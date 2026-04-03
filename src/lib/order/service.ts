import { prisma } from '@/lib/db';
import { getEnv } from '@/lib/config';
import { ORDER_STATUS } from '@/lib/constants';
import { generateRechargeCode } from './code-gen';
import { getMethodDailyLimit } from './limits';
import { getMethodFeeRate, calculatePayAmount } from './fee';
import { initPaymentProviders, paymentRegistry } from '@/lib/payment';
import type { PaymentType, PaymentNotification } from '@/lib/payment';
import {
  getUser,
  createAndRedeem,
  subtractBalance,
  addBalance,
  getGroup,
  getUserSubscriptions,
  extendSubscription,
} from '@/lib/sub2api/client';
import { computeValidityDays, type ValidityUnit } from '@/lib/subscription-utils';
import { Prisma } from '@prisma/client';
import { deriveOrderState, isRefundStatus } from './status';
import { pickLocaleText, type Locale } from '@/lib/locale';
import { getBizDayStartUTC } from '@/lib/time/biz-day';
import { buildOrderResultUrl, createOrderStatusAccessToken } from '@/lib/order/status-access';
import { getSystemConfig, getSystemConfigs } from '@/lib/system-config';
import { selectInstance, getInstanceConfig, type LoadBalanceStrategy } from '@/lib/payment/load-balancer';

const DEFAULT_MAX_PENDING_ORDERS = 3;
/** Decimal(10,2) 允许的最大金额 */
export const MAX_AMOUNT = 99999999.99;

function message(locale: Locale, zh: string, en: string): string {
  return pickLocaleText(locale, zh, en);
}

export interface CreateOrderInput {
  userId: number;
  amount: number;
  paymentType: PaymentType;
  clientIp: string;
  isMobile?: boolean;
  srcHost?: string;
  srcUrl?: string;
  locale?: Locale;
  // 订阅订单专用
  orderType?: 'balance' | 'subscription';
  planId?: string;
}

export interface CreateOrderResult {
  orderId: string;
  amount: number;
  payAmount: number;
  feeRate: number;
  status: string;
  paymentType: PaymentType;
  userName: string;
  userBalance: number;
  payUrl?: string | null;
  qrCode?: string | null;
  clientSecret?: string | null;
  expiresAt: Date;
  statusAccessToken: string;
}

export async function createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
  const env = getEnv();
  const locale = input.locale ?? 'zh';
  const todayStart = getBizDayStartUTC();
  const orderType = input.orderType ?? 'balance';

  // ── 订阅订单前置校验 ──
  let subscriptionPlan: {
    id: string;
    groupId: number | null;
    price: Prisma.Decimal;
    validityDays: number;
    validityUnit: string;
    name: string;
    productName: string | null;
  } | null = null;
  let subscriptionGroupName = '';

  // R6: 余额充值禁用检查
  if (orderType === 'balance') {
    const balanceDisabled = await getSystemConfig('BALANCE_PAYMENT_DISABLED');
    if (balanceDisabled === 'true') {
      throw new OrderError(
        'BALANCE_PAYMENT_DISABLED',
        message(locale, '余额充值已被管理员关闭', 'Balance recharge has been disabled by the administrator'),
        403,
      );
    }
  }

  if (orderType === 'subscription') {
    if (!input.planId) {
      throw new OrderError(
        'INVALID_INPUT',
        message(locale, '订阅订单必须指定套餐', 'Subscription order requires a plan'),
        400,
      );
    }
    const plan = await prisma.subscriptionPlan.findUnique({ where: { id: input.planId } });
    if (!plan || !plan.forSale) {
      throw new OrderError(
        'PLAN_NOT_AVAILABLE',
        message(locale, '该套餐不存在或未上架', 'Plan not found or not for sale'),
        404,
      );
    }
    // 校验分组绑定有效
    if (plan.groupId === null) {
      throw new OrderError(
        'GROUP_NOT_BOUND',
        message(locale, '该套餐尚未绑定分组，无法购买', 'Plan is not bound to a group'),
        400,
      );
    }
    // 校验 Sub2API 分组仍然存在
    const group = await getGroup(plan.groupId);
    if (!group || group.status !== 'active') {
      throw new OrderError(
        'GROUP_NOT_FOUND',
        message(locale, '订阅分组已下架，无法购买', 'Subscription group is no longer available'),
        410,
      );
    }
    // R4: 校验分组必须为订阅类型
    if (group.subscription_type !== 'subscription') {
      throw new OrderError(
        'GROUP_TYPE_MISMATCH',
        message(locale, '该分组不是订阅类型，无法购买订阅', 'This group is not a subscription type'),
        400,
      );
    }
    subscriptionGroupName = group?.name || plan.name;
    subscriptionPlan = plan;
    // 订阅订单金额使用服务端套餐价格，不信任客户端
    input.amount = Number(plan.price);
  }

  const user = await getUser(input.userId);
  if (user.status !== 'active') {
    throw new OrderError('USER_INACTIVE', message(locale, '用户账号已被禁用', 'User account is disabled'), 422);
  }

  // ── 取消频率限制：超限后禁止创建新订单 ──
  const rateLimitConfigs = await getSystemConfigs([
    'CANCEL_RATE_LIMIT_ENABLED',
    'CANCEL_RATE_LIMIT_WINDOW',
    'CANCEL_RATE_LIMIT_UNIT',
    'CANCEL_RATE_LIMIT_MAX',
    'CANCEL_RATE_LIMIT_WINDOW_MODE',
  ]);
  if (rateLimitConfigs['CANCEL_RATE_LIMIT_ENABLED'] === 'true') {
    const windowSize = parseInt(rateLimitConfigs['CANCEL_RATE_LIMIT_WINDOW'] || '1', 10) || 1;
    const maxCount = parseInt(rateLimitConfigs['CANCEL_RATE_LIMIT_MAX'] || '10', 10) || 10;
    const unit = rateLimitConfigs['CANCEL_RATE_LIMIT_UNIT'] || 'day';
    const windowMode = rateLimitConfigs['CANCEL_RATE_LIMIT_WINDOW_MODE'] || 'rolling';

    let windowStart: Date;
    if (windowMode === 'fixed') {
      const now = new Date();
      if (unit === 'day') {
        const start = new Date(now);
        start.setHours(0, 0, 0, 0);
        start.setDate(start.getDate() - (windowSize - 1));
        windowStart = start;
      } else if (unit === 'minute') {
        const start = new Date(now);
        start.setSeconds(0, 0);
        start.setMinutes(start.getMinutes() - (windowSize - 1));
        windowStart = start;
      } else {
        const start = new Date(now);
        start.setMinutes(0, 0, 0);
        start.setHours(start.getHours() - (windowSize - 1));
        windowStart = start;
      }
    } else {
      const unitMs = unit === 'minute' ? 60_000 : unit === 'day' ? 86_400_000 : 3_600_000;
      windowStart = new Date(Date.now() - windowSize * unitMs);
    }

    const recentCancelCount = await prisma.auditLog.count({
      where: {
        action: 'ORDER_CANCELLED',
        operator: `user:${input.userId}`,
        createdAt: { gte: windowStart },
      },
    });
    if (recentCancelCount >= maxCount) {
      let retryAfter: Date;
      if (windowMode === 'fixed') {
        const now = new Date();
        if (unit === 'day') {
          retryAfter = new Date(now);
          retryAfter.setHours(0, 0, 0, 0);
          retryAfter.setDate(retryAfter.getDate() + 1);
        } else if (unit === 'minute') {
          retryAfter = new Date(now);
          retryAfter.setSeconds(0, 0);
          retryAfter.setMinutes(retryAfter.getMinutes() + 1);
        } else {
          retryAfter = new Date(now);
          retryAfter.setMinutes(0, 0, 0);
          retryAfter.setHours(retryAfter.getHours() + 1);
        }
      } else {
        const unitMs = unit === 'minute' ? 60_000 : unit === 'day' ? 86_400_000 : 3_600_000;
        const earliest = await prisma.auditLog.findFirst({
          where: {
            action: 'ORDER_CANCELLED',
            operator: `user:${input.userId}`,
            createdAt: { gte: windowStart },
          },
          orderBy: { createdAt: 'asc' },
          select: { createdAt: true },
        });
        retryAfter = earliest
          ? new Date(earliest.createdAt.getTime() + windowSize * unitMs)
          : new Date(Date.now() + windowSize * unitMs);
      }

      const waitMs = retryAfter.getTime() - Date.now();
      const retryAfterMinutes = Math.max(1, Math.ceil(waitMs / 60_000));

      throw new OrderError('CANCEL_RATE_LIMITED', 'Cancel rate limited', 429, {
        windowSize,
        unit,
        maxCount,
        retryAfterMinutes,
      });
    }
  }

  const feeRate = getMethodFeeRate(input.paymentType);
  const payAmountStr = calculatePayAmount(input.amount, feeRate);
  const payAmountNum = Number(payAmountStr);

  const orderTimeoutConfig = await getSystemConfig('ORDER_TIMEOUT_MINUTES');
  const orderTimeoutMinutes = orderTimeoutConfig
    ? parseInt(orderTimeoutConfig, 10) || env.ORDER_TIMEOUT_MINUTES
    : env.ORDER_TIMEOUT_MINUTES;
  const expiresAt = new Date(Date.now() + orderTimeoutMinutes * 60 * 1000);

  // 读取最大支付中订单数配置
  const maxPendingConfig = await getSystemConfig('MAX_PENDING_ORDERS');
  const maxPendingOrders = maxPendingConfig
    ? parseInt(maxPendingConfig, 10) || DEFAULT_MAX_PENDING_ORDERS
    : DEFAULT_MAX_PENDING_ORDERS;

  // 每日充值限额配置（参考 /api/user 覆盖模式：getSystemConfig → env 兜底）
  const dailyLimitConfig = await getSystemConfig('DAILY_RECHARGE_LIMIT');
  const maxDailyRechargeAmount = dailyLimitConfig
    ? parseFloat(dailyLimitConfig) || env.MAX_DAILY_RECHARGE_AMOUNT
    : env.MAX_DAILY_RECHARGE_AMOUNT;

  // 将限额校验与订单创建放在同一个 serializable 事务中，防止并发突破限额
  const order = await prisma.$transaction(async (tx) => {
    // 待支付订单数限制
    const pendingCount = await tx.order.count({
      where: { userId: input.userId, status: ORDER_STATUS.PENDING },
    });
    if (pendingCount >= maxPendingOrders) {
      throw new OrderError(
        'TOO_MANY_PENDING',
        message(
          locale,
          `待支付订单过多（最多 ${maxPendingOrders} 笔）`,
          `Too many pending orders (${maxPendingOrders})`,
        ),
        429,
      );
    }

    // 每日累计充值限额校验（0 = 不限制）
    if (maxDailyRechargeAmount > 0) {
      const dailyAgg = await tx.order.aggregate({
        where: {
          userId: input.userId,
          status: { in: [ORDER_STATUS.PAID, ORDER_STATUS.RECHARGING, ORDER_STATUS.COMPLETED] },
          paidAt: { gte: todayStart },
        },
        _sum: { amount: true },
      });
      const alreadyPaid = Number(dailyAgg._sum.amount ?? 0);
      if (alreadyPaid + input.amount > maxDailyRechargeAmount) {
        const remaining = Math.max(0, maxDailyRechargeAmount - alreadyPaid);
        throw new OrderError(
          'DAILY_LIMIT_EXCEEDED',
          message(
            locale,
            `今日累计充值已达上限，剩余可充值 ${remaining.toFixed(2)} 元`,
            `Daily recharge limit reached. Remaining amount: ${remaining.toFixed(2)} CNY`,
          ),
          429,
        );
      }
    }

    // 渠道每日全平台限额校验（0 = 不限）
    const methodDailyLimit = await getMethodDailyLimit(input.paymentType);
    if (methodDailyLimit > 0) {
      const methodAgg = await tx.order.aggregate({
        where: {
          paymentType: input.paymentType,
          status: { in: [ORDER_STATUS.PAID, ORDER_STATUS.RECHARGING, ORDER_STATUS.COMPLETED] },
          paidAt: { gte: todayStart },
        },
        _sum: { amount: true },
      });
      const methodUsed = Number(methodAgg._sum.amount ?? 0);
      if (methodUsed + input.amount > methodDailyLimit) {
        const remaining = Math.max(0, methodDailyLimit - methodUsed);
        throw new OrderError(
          'METHOD_DAILY_LIMIT_EXCEEDED',
          remaining > 0
            ? message(
                locale,
                `${input.paymentType} 今日剩余额度 ${remaining.toFixed(2)} 元，请减少充值金额或使用其他支付方式`,
                `${input.paymentType} remaining daily quota: ${remaining.toFixed(2)} CNY. Reduce the amount or use another payment method`,
              )
            : message(
                locale,
                `${input.paymentType} 今日充值额度已满，请使用其他支付方式`,
                `${input.paymentType} daily quota is full. Please use another payment method`,
              ),
          429,
        );
      }
    }

    const created = await tx.order.create({
      data: {
        userId: input.userId,
        userEmail: user.email,
        userName: user.username,
        userNotes: user.notes || null,
        amount: new Prisma.Decimal(input.amount.toFixed(2)),
        payAmount: new Prisma.Decimal(payAmountStr),
        feeRate: feeRate > 0 ? new Prisma.Decimal(feeRate.toFixed(4)) : null,
        rechargeCode: '',
        status: 'PENDING',
        paymentType: input.paymentType,
        expiresAt,
        clientIp: input.clientIp,
        srcHost: input.srcHost || null,
        srcUrl: input.srcUrl || null,
        orderType,
        planId: subscriptionPlan?.id ?? null,
        subscriptionGroupId: subscriptionPlan?.groupId ?? null,
        subscriptionDays: subscriptionPlan
          ? computeValidityDays(subscriptionPlan.validityDays, subscriptionPlan.validityUnit as ValidityUnit)
          : null,
      },
    });

    const rechargeCode = generateRechargeCode(created.id);
    await tx.order.update({
      where: { id: created.id },
      data: { rechargeCode },
    });

    return { ...created, rechargeCode };
  });

  try {
    initPaymentProviders();
    const provider = paymentRegistry.getProvider(input.paymentType);

    // 多实例负载均衡：尝试为当前 provider 选择实例
    let actualProvider = provider;
    let selectedInstanceId: string | undefined;

    const strategyConfig = await getSystemConfig('LOAD_BALANCE_STRATEGY');
    const strategy = (strategyConfig === 'least-amount' ? 'least-amount' : 'round-robin') as LoadBalanceStrategy;

    const instanceResult = await selectInstance(provider.providerKey, strategy, input.paymentType, input.amount);
    if (instanceResult) {
      if (provider.providerKey === 'easypay') {
        const { EasyPayProvider } = await import('@/lib/easy-pay/provider');
        actualProvider = new EasyPayProvider(instanceResult.instanceId, instanceResult.config);
      }
      selectedInstanceId = instanceResult.instanceId;
    } else {
      // 检查是否有配置的实例但全部被限额过滤掉
      const instanceCount = await prisma.paymentProviderInstance.count({
        where: { providerKey: provider.providerKey, enabled: true },
      });
      if (instanceCount > 0) {
        throw new OrderError(
          'NO_AVAILABLE_INSTANCE',
          message(
            locale,
            '当前支付方式暂无可用渠道（所有实例已达限额），请稍后重试或更换支付方式',
            'No available payment instance (all instances have reached their limits). Please try later or use another payment method',
          ),
          429,
        );
      }
    }

    const statusAccessToken = createOrderStatusAccessToken(order.id, input.userId);
    const orderResultUrl = buildOrderResultUrl(env.NEXT_PUBLIC_APP_URL, order.id, input.userId);

    // 只有 easypay 从外部传入 notifyUrl，return_url 统一回到带访问令牌的结果页
    let notifyUrl: string | undefined;
    let returnUrl: string | undefined = orderResultUrl;
    if (actualProvider.providerKey === 'easypay') {
      if (selectedInstanceId) {
        notifyUrl = `${env.NEXT_PUBLIC_APP_URL}/api/easy-pay/notify?inst=${selectedInstanceId}`;
      } else {
        notifyUrl = env.EASY_PAY_NOTIFY_URL || '';
      }
      returnUrl = orderResultUrl;
    }

    // R3+R5: 构建支付商品名称
    let paymentSubject: string;
    if (subscriptionPlan) {
      // R3: 订阅订单优先使用套餐自定义商品名称
      paymentSubject = subscriptionPlan.productName || `Sub2API 订阅 ${subscriptionGroupName || subscriptionPlan.name}`;
    } else {
      // R5: 余额订单使用前缀/后缀配置
      const nameConfigs = await getSystemConfigs(['PRODUCT_NAME_PREFIX', 'PRODUCT_NAME_SUFFIX']);
      const prefix = nameConfigs['PRODUCT_NAME_PREFIX']?.trim();
      const suffix = nameConfigs['PRODUCT_NAME_SUFFIX']?.trim();
      if (prefix || suffix) {
        paymentSubject = `${prefix || ''} ${payAmountStr} ${suffix || ''}`.trim();
      } else {
        paymentSubject = `Sub2API ${payAmountStr} CNY`;
      }
    }

    const paymentResult = await actualProvider.createPayment({
      orderId: order.id,
      amount: payAmountNum,
      paymentType: input.paymentType,
      subject: paymentSubject,
      notifyUrl,
      returnUrl,
      clientIp: input.clientIp,
      isMobile: input.isMobile,
    });

    await prisma.order.update({
      where: { id: order.id },
      data: {
        paymentTradeNo: paymentResult.tradeNo,
        payUrl: paymentResult.payUrl || null,
        qrCode: paymentResult.qrCode || null,
        providerInstanceId: selectedInstanceId ?? null,
      },
    });

    await prisma.auditLog.create({
      data: {
        orderId: order.id,
        action: 'ORDER_CREATED',
        detail: JSON.stringify({
          userId: input.userId,
          amount: input.amount,
          paymentType: input.paymentType,
          orderType,
          ...(subscriptionPlan && {
            planId: subscriptionPlan.id,
            planName: subscriptionPlan.name,
            groupId: subscriptionPlan.groupId,
          }),
        }),
        operator: `user:${input.userId}`,
      },
    });

    return {
      orderId: order.id,
      amount: input.amount,
      payAmount: payAmountNum,
      feeRate,
      status: ORDER_STATUS.PENDING,
      paymentType: input.paymentType,
      userName: user.username,
      userBalance: user.balance,
      payUrl: paymentResult.payUrl,
      qrCode: paymentResult.qrCode,
      clientSecret: paymentResult.clientSecret,
      expiresAt,
      statusAccessToken,
    };
  } catch (error) {
    await prisma.order.delete({ where: { id: order.id } });

    // 已经是业务错误，直接向上抛
    if (error instanceof OrderError) throw error;

    // 支付网关配置缺失或调用失败，转成友好错误
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`Payment gateway error (${input.paymentType}):`, error);
    if (msg.includes('environment variables') || msg.includes('not configured') || msg.includes('not found')) {
      throw new OrderError(
        'PAYMENT_GATEWAY_ERROR',
        message(
          locale,
          `支付渠道（${input.paymentType}）暂未配置，请联系管理员`,
          `Payment method (${input.paymentType}) is not configured. Please contact the administrator`,
        ),
        503,
      );
    }
    throw new OrderError(
      'PAYMENT_GATEWAY_ERROR',
      message(
        locale,
        '支付渠道暂时不可用，请稍后重试或更换支付方式',
        'Payment method is temporarily unavailable. Please try again later or use another payment method',
      ),
      502,
    );
  }
}

export type CancelOutcome = 'cancelled' | 'already_paid';

/**
 * 核心取消逻辑 — 所有取消路径共用。
 * 调用前由 caller 负责权限校验（userId / admin 身份）。
 */
export async function cancelOrderCore(options: {
  orderId: string;
  paymentTradeNo: string | null;
  paymentType: string | null;
  providerInstanceId?: string | null;
  finalStatus: 'CANCELLED' | 'EXPIRED';
  operator: string;
  auditDetail: string;
}): Promise<CancelOutcome> {
  const { orderId, paymentTradeNo, paymentType, providerInstanceId, finalStatus, operator, auditDetail } = options;

  // 1. 平台侧处理
  if (paymentTradeNo && paymentType) {
    try {
      let provider;
      // 多实例：使用实例配置创建 provider
      if (providerInstanceId) {
        const instConfig = await getInstanceConfig(providerInstanceId);
        if (instConfig) {
          // 目前仅 easypay 支持多实例
          const { EasyPayProvider } = await import('@/lib/easy-pay/provider');
          provider = new EasyPayProvider(providerInstanceId, instConfig);
        }
      }
      if (!provider) {
        initPaymentProviders();
        provider = paymentRegistry.getProvider(paymentType as PaymentType);
      }
      const queryResult = await provider.queryOrder(paymentTradeNo);

      if (queryResult.status === 'paid') {
        await confirmPayment({
          orderId,
          tradeNo: paymentTradeNo,
          paidAmount: queryResult.amount,
          providerName: provider.name,
        });
        console.log(`Order ${orderId} was paid during cancel (${operator}), processed as success`);
        return 'already_paid';
      }

      if (provider.cancelPayment) {
        try {
          await provider.cancelPayment(paymentTradeNo);
        } catch (cancelErr) {
          console.warn(`Failed to cancel payment for order ${orderId}:`, cancelErr);
        }
      }
    } catch (platformErr) {
      console.warn(`Platform check failed for order ${orderId}, cancelling locally:`, platformErr);
    }
  }

  // 2. DB 更新 (WHERE status='PENDING' 保证幂等)
  const result = await prisma.order.updateMany({
    where: { id: orderId, status: ORDER_STATUS.PENDING },
    data: { status: finalStatus, updatedAt: new Date() },
  });

  // 3. 审计日志
  if (result.count > 0) {
    await prisma.auditLog.create({
      data: {
        orderId,
        action: finalStatus === ORDER_STATUS.EXPIRED ? 'ORDER_EXPIRED' : 'ORDER_CANCELLED',
        detail: auditDetail,
        operator,
      },
    });
  }

  return 'cancelled';
}

export async function cancelOrder(orderId: string, userId: number, locale: Locale = 'zh'): Promise<CancelOutcome> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, userId: true, status: true, paymentTradeNo: true, paymentType: true, providerInstanceId: true },
  });

  if (!order) throw new OrderError('NOT_FOUND', message(locale, '订单不存在', 'Order not found'), 404);
  if (order.userId !== userId) throw new OrderError('FORBIDDEN', message(locale, '无权操作该订单', 'Forbidden'), 403);
  if (order.status !== ORDER_STATUS.PENDING)
    throw new OrderError('INVALID_STATUS', message(locale, '订单当前状态不可取消', 'Order cannot be cancelled'), 400);

  return cancelOrderCore({
    orderId: order.id,
    paymentTradeNo: order.paymentTradeNo,
    paymentType: order.paymentType,
    providerInstanceId: order.providerInstanceId,
    finalStatus: ORDER_STATUS.CANCELLED,
    operator: `user:${userId}`,
    auditDetail: message(locale, '用户取消订单', 'User cancelled order'),
  });
}

export async function adminCancelOrder(orderId: string, locale: Locale = 'zh'): Promise<CancelOutcome> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, status: true, paymentTradeNo: true, paymentType: true, providerInstanceId: true },
  });

  if (!order) throw new OrderError('NOT_FOUND', message(locale, '订单不存在', 'Order not found'), 404);
  if (order.status !== ORDER_STATUS.PENDING)
    throw new OrderError('INVALID_STATUS', message(locale, '订单当前状态不可取消', 'Order cannot be cancelled'), 400);

  return cancelOrderCore({
    orderId: order.id,
    paymentTradeNo: order.paymentTradeNo,
    paymentType: order.paymentType,
    providerInstanceId: order.providerInstanceId,
    finalStatus: ORDER_STATUS.CANCELLED,
    operator: 'admin',
    auditDetail: message(locale, '管理员取消订单', 'Admin cancelled order'),
  });
}

/**
 * Provider-agnostic: confirm a payment and trigger recharge.
 * Called by any provider's webhook/notify handler after verification.
 */
export async function confirmPayment(input: {
  orderId: string;
  tradeNo: string;
  paidAmount: number;
  providerName: string;
}): Promise<boolean> {
  const order = await prisma.order.findUnique({
    where: { id: input.orderId },
  });
  if (!order) {
    console.error(`${input.providerName} notify: order not found:`, input.orderId);
    return false;
  }

  let paidAmount: Prisma.Decimal;
  try {
    paidAmount = new Prisma.Decimal(input.paidAmount.toFixed(2));
  } catch {
    console.error(`${input.providerName} notify: invalid amount:`, input.paidAmount);
    return false;
  }
  if (paidAmount.lte(0)) {
    console.error(`${input.providerName} notify: non-positive amount:`, input.paidAmount);
    return false;
  }
  const expectedAmount = order.payAmount ?? order.amount;
  if (!paidAmount.equals(expectedAmount)) {
    const diff = paidAmount.minus(expectedAmount).abs();
    if (diff.gt(new Prisma.Decimal('0.01'))) {
      // 写审计日志
      await prisma.auditLog.create({
        data: {
          orderId: order.id,
          action: 'PAYMENT_AMOUNT_MISMATCH',
          detail: JSON.stringify({
            expected: expectedAmount.toString(),
            paid: paidAmount.toString(),
            diff: diff.toString(),
            tradeNo: input.tradeNo,
          }),
          operator: input.providerName,
        },
      });
      console.error(
        `${input.providerName} notify: amount mismatch beyond threshold`,
        `expected=${expectedAmount.toString()}, paid=${paidAmount.toString()}, diff=${diff.toString()}`,
      );
      return false;
    }
    console.warn(
      `${input.providerName} notify: minor amount difference (rounding)`,
      expectedAmount.toString(),
      paidAmount.toString(),
    );
  }

  // 只接受 PENDING 状态，或过期不超过 5 分钟的 EXPIRED 订单（支付在过期边缘完成的宽限窗口）
  const graceDeadline = new Date(Date.now() - 5 * 60 * 1000);
  const result = await prisma.order.updateMany({
    where: {
      id: order.id,
      OR: [{ status: ORDER_STATUS.PENDING }, { status: ORDER_STATUS.EXPIRED, updatedAt: { gte: graceDeadline } }],
    },
    data: {
      status: ORDER_STATUS.PAID,
      payAmount: paidAmount,
      paymentTradeNo: input.tradeNo,
      paidAt: new Date(),
      failedAt: null,
      failedReason: null,
    },
  });

  if (result.count === 0) {
    // 重新查询当前状态，区分「已成功」和「需重试」
    const current = await prisma.order.findUnique({
      where: { id: order.id },
      select: { status: true },
    });
    if (!current) return true;

    // 已完成或已退款 — 告知支付平台成功
    if (current.status === ORDER_STATUS.COMPLETED || current.status === ORDER_STATUS.REFUNDED) {
      return true;
    }

    // FAILED 状态 — 之前充值失败，利用重试通知自动重试充值
    if (current.status === ORDER_STATUS.FAILED) {
      try {
        await executeFulfillment(order.id);
        return true;
      } catch (err) {
        console.error('Fulfillment retry failed for order:', order.id, err);
        return false; // 让支付平台继续重试
      }
    }

    // PAID / RECHARGING — 正在处理中，让支付平台稍后重试
    if (current.status === ORDER_STATUS.PAID || current.status === ORDER_STATUS.RECHARGING) {
      return false;
    }

    // 其他状态（CANCELLED 等）— 不应该出现，返回 true 停止重试
    return true;
  }

  await prisma.auditLog.create({
    data: {
      orderId: order.id,
      action: 'ORDER_PAID',
      detail: JSON.stringify({
        previous_status: order.status,
        trade_no: input.tradeNo,
        expected_amount: order.amount.toString(),
        paid_amount: paidAmount.toString(),
      }),
      operator: input.providerName,
    },
  });

  try {
    await executeFulfillment(order.id);
  } catch (err) {
    console.error('Fulfillment failed for order:', order.id, err);
    return false;
  }

  return true;
}

/**
 * Handle a verified payment notification from any provider.
 * The caller (webhook route) is responsible for verifying the notification
 * via provider.verifyNotification() before calling this function.
 */
export async function handlePaymentNotify(notification: PaymentNotification, providerName: string): Promise<boolean> {
  if (notification.status !== 'success') {
    return true;
  }

  return confirmPayment({
    orderId: notification.orderId,
    tradeNo: notification.tradeNo,
    paidAmount: notification.amount,
    providerName,
  });
}

/**
 * 统一履约入口 — 根据 orderType 分派到余额充值或订阅分配。
 */
export async function executeFulfillment(orderId: string): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { orderType: true },
  });
  if (!order) throw new OrderError('NOT_FOUND', 'Order not found', 404);

  if (order.orderType === 'subscription') {
    await executeSubscriptionFulfillment(orderId);
  } else {
    await executeRecharge(orderId);
  }
}

/**
 * 订阅履约 — 支付成功后调用 Sub2API 分配订阅。
 */
export async function executeSubscriptionFulfillment(orderId: string): Promise<void> {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new OrderError('NOT_FOUND', 'Order not found', 404);
  if (order.status === ORDER_STATUS.COMPLETED) return;
  if (isRefundStatus(order.status)) {
    throw new OrderError('INVALID_STATUS', 'Refund-related order cannot fulfill', 400);
  }
  if (order.status !== ORDER_STATUS.PAID && order.status !== ORDER_STATUS.FAILED) {
    throw new OrderError('INVALID_STATUS', `Order cannot fulfill in status ${order.status}`, 400);
  }
  if (!order.subscriptionGroupId || !order.subscriptionDays) {
    throw new OrderError('INVALID_STATUS', 'Missing subscription info on order', 400);
  }

  // CAS 锁
  const lockResult = await prisma.order.updateMany({
    where: { id: orderId, status: { in: [ORDER_STATUS.PAID, ORDER_STATUS.FAILED] } },
    data: { status: ORDER_STATUS.RECHARGING },
  });
  if (lockResult.count === 0) return;

  try {
    // 校验分组是否仍然存在
    const group = await getGroup(order.subscriptionGroupId);
    if (!group || group.status !== 'active') {
      throw new Error(`Subscription group ${order.subscriptionGroupId} no longer exists or inactive`);
    }

    // 检测是否续费：查找同分组的活跃订阅，决定天数计算起点
    let validityDays = order.subscriptionDays;
    let fulfillMethod: 'renew' | 'new' = 'new';
    let renewedSubscriptionId: number | undefined;

    const userSubs = await getUserSubscriptions(order.userId);
    const activeSub = userSubs.find((s) => s.group_id === order.subscriptionGroupId && s.status === 'active');

    if (activeSub) {
      // 续费：从到期日往后推算天数（使用订单关联的具体套餐，而非分组下任意套餐）
      const plan = order.planId
        ? await prisma.subscriptionPlan.findUnique({
            where: { id: order.planId },
            select: { validityDays: true, validityUnit: true },
          })
        : null;
      if (plan) {
        validityDays = computeValidityDays(
          plan.validityDays,
          plan.validityUnit as ValidityUnit,
          new Date(activeSub.expires_at),
        );
      }
      fulfillMethod = 'renew';
      renewedSubscriptionId = activeSub.id;
    }

    await createAndRedeem(
      order.rechargeCode,
      Number(order.amount),
      order.userId,
      `sub2apipay subscription order:${orderId}`,
      {
        type: 'subscription',
        groupId: order.subscriptionGroupId,
        validityDays,
      },
    );

    await prisma.order.updateMany({
      where: { id: orderId, status: ORDER_STATUS.RECHARGING },
      data: { status: ORDER_STATUS.COMPLETED, completedAt: new Date() },
    });

    await prisma.auditLog.create({
      data: {
        orderId,
        action: 'SUBSCRIPTION_SUCCESS',
        detail: JSON.stringify({
          groupId: order.subscriptionGroupId,
          days: order.subscriptionDays,
          amount: Number(order.amount),
          method: fulfillMethod,
          ...(renewedSubscriptionId && { renewedSubscriptionId }),
        }),
        operator: 'system',
      },
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const isGroupGone = reason.includes('no longer exists');

    await prisma.order.update({
      where: { id: orderId },
      data: {
        status: ORDER_STATUS.FAILED,
        failedAt: new Date(),
        failedReason: isGroupGone ? `SUBSCRIPTION_GROUP_GONE: ${reason}` : reason,
      },
    });

    await prisma.auditLog.create({
      data: {
        orderId,
        action: 'SUBSCRIPTION_FAILED',
        detail: reason,
        operator: 'system',
      },
    });

    throw error;
  }
}

export async function executeRecharge(orderId: string): Promise<void> {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) {
    throw new OrderError('NOT_FOUND', 'Order not found', 404);
  }
  if (order.status === ORDER_STATUS.COMPLETED) {
    return;
  }
  if (isRefundStatus(order.status)) {
    throw new OrderError('INVALID_STATUS', 'Refund-related order cannot recharge', 400);
  }
  if (order.status !== ORDER_STATUS.PAID && order.status !== ORDER_STATUS.FAILED) {
    throw new OrderError('INVALID_STATUS', `Order cannot recharge in status ${order.status}`, 400);
  }

  // 原子 CAS：将状态从 PAID/FAILED → RECHARGING，防止并发竞态
  const lockResult = await prisma.order.updateMany({
    where: { id: orderId, status: { in: [ORDER_STATUS.PAID, ORDER_STATUS.FAILED] } },
    data: { status: ORDER_STATUS.RECHARGING },
  });
  if (lockResult.count === 0) {
    // 另一个并发请求已经在处理
    return;
  }

  try {
    await createAndRedeem(
      order.rechargeCode,
      Number(order.amount),
      order.userId,
      `sub2apipay recharge order:${orderId}`,
    );

    await prisma.order.updateMany({
      where: { id: orderId, status: ORDER_STATUS.RECHARGING },
      data: { status: ORDER_STATUS.COMPLETED, completedAt: new Date() },
    });

    await prisma.auditLog.create({
      data: {
        orderId,
        action: 'RECHARGE_SUCCESS',
        detail: JSON.stringify({ rechargeCode: order.rechargeCode, amount: Number(order.amount) }),
        operator: 'system',
      },
    });
  } catch (error) {
    await prisma.order.update({
      where: { id: orderId },
      data: {
        status: ORDER_STATUS.FAILED,
        failedAt: new Date(),
        failedReason: error instanceof Error ? error.message : String(error),
      },
    });

    await prisma.auditLog.create({
      data: {
        orderId,
        action: 'RECHARGE_FAILED',
        detail: error instanceof Error ? error.message : String(error),
        operator: 'system',
      },
    });

    throw error;
  }
}

function assertRetryAllowed(order: { status: string; paidAt: Date | null }, locale: Locale): void {
  if (!order.paidAt) {
    throw new OrderError(
      'INVALID_STATUS',
      message(locale, '订单未支付，不允许重试', 'Order is not paid, retry denied'),
      400,
    );
  }

  if (isRefundStatus(order.status)) {
    throw new OrderError(
      'INVALID_STATUS',
      message(locale, '退款相关订单不允许重试', 'Refund-related order cannot retry'),
      400,
    );
  }

  if (order.status === ORDER_STATUS.FAILED || order.status === ORDER_STATUS.PAID) {
    return;
  }

  if (order.status === ORDER_STATUS.RECHARGING) {
    throw new OrderError(
      'CONFLICT',
      message(locale, '订单正在充值中，请稍后重试', 'Order is recharging, retry later'),
      409,
    );
  }

  if (order.status === ORDER_STATUS.COMPLETED) {
    throw new OrderError('INVALID_STATUS', message(locale, '订单已完成', 'Order already completed'), 400);
  }

  throw new OrderError(
    'INVALID_STATUS',
    message(locale, '仅已支付和失败订单允许重试', 'Only paid and failed orders can retry'),
    400,
  );
}

export async function retryRecharge(orderId: string, locale: Locale = 'zh'): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      status: true,
      paidAt: true,
      completedAt: true,
    },
  });

  if (!order) {
    throw new OrderError('NOT_FOUND', message(locale, '订单不存在', 'Order not found'), 404);
  }

  assertRetryAllowed(order, locale);

  const result = await prisma.order.updateMany({
    where: {
      id: orderId,
      status: { in: [ORDER_STATUS.FAILED, ORDER_STATUS.PAID] },
      paidAt: { not: null },
    },
    data: { status: ORDER_STATUS.PAID, failedAt: null, failedReason: null },
  });

  if (result.count === 0) {
    const latest = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        status: true,
        paidAt: true,
        completedAt: true,
      },
    });

    if (!latest) {
      throw new OrderError('NOT_FOUND', message(locale, '订单不存在', 'Order not found'), 404);
    }

    const derived = deriveOrderState(latest);
    if (derived.rechargeStatus === 'recharging' || latest.status === ORDER_STATUS.PAID) {
      throw new OrderError(
        'CONFLICT',
        message(locale, '订单正在充值中，请稍后重试', 'Order is recharging, retry later'),
        409,
      );
    }

    if (derived.rechargeStatus === 'success') {
      throw new OrderError('INVALID_STATUS', message(locale, '订单已完成', 'Order already completed'), 400);
    }

    if (isRefundStatus(latest.status)) {
      throw new OrderError(
        'INVALID_STATUS',
        message(locale, '退款相关订单不允许重试', 'Refund-related order cannot retry'),
        400,
      );
    }

    throw new OrderError(
      'CONFLICT',
      message(locale, '订单状态已变更，请刷新后重试', 'Order status changed, refresh and retry'),
      409,
    );
  }

  await prisma.auditLog.create({
    data: {
      orderId,
      action: 'RECHARGE_RETRY',
      detail: message(locale, '管理员手动重试充值', 'Admin manual retry recharge'),
      operator: 'admin',
    },
  });

  await executeFulfillment(orderId);
}

export interface RefundRequestInput {
  orderId: string;
  userId: number;
  amount: number;
  reason?: string;
  locale?: Locale;
}

export async function requestRefund(input: RefundRequestInput): Promise<{ success: boolean }> {
  const locale = input.locale ?? 'zh';
  const order = await prisma.order.findUnique({ where: { id: input.orderId } });
  if (!order) throw new OrderError('NOT_FOUND', message(locale, '订单不存在', 'Order not found'), 404);
  if (order.userId !== input.userId) {
    throw new OrderError('FORBIDDEN', message(locale, '无权申请该订单退款', 'Forbidden'), 403);
  }
  if (order.orderType !== 'balance') {
    throw new OrderError(
      'INVALID_ORDER_TYPE',
      message(locale, '仅余额充值订单支持退款申请', 'Only balance orders can request refund'),
      400,
    );
  }
  if (order.status !== ORDER_STATUS.COMPLETED) {
    throw new OrderError(
      'INVALID_STATUS',
      message(locale, '仅已完成订单可申请退款', 'Only completed orders can request refund'),
      400,
    );
  }

  const refundAmount = input.amount;
  if (!Number.isFinite(refundAmount) || refundAmount <= 0) {
    throw new OrderError(
      'INVALID_REFUND_AMOUNT',
      message(locale, '退款金额必须大于 0', 'Refund amount must be greater than 0'),
      400,
    );
  }

  const maxRefundAmount = Number(order.amount);
  if (refundAmount > maxRefundAmount) {
    throw new OrderError(
      'REFUND_AMOUNT_EXCEEDED',
      message(locale, '退款金额不能超过充值金额', 'Refund amount cannot exceed recharge amount'),
      400,
    );
  }

  const user = await getUser(order.userId);
  if (user.balance < refundAmount) {
    throw new OrderError(
      'BALANCE_NOT_ENOUGH',
      message(locale, '退款金额不能超过当前余额', 'Refund amount cannot exceed current balance'),
      400,
    );
  }

  const normalizedReason = input.reason?.trim() || null;

  const updated = await prisma.order.updateMany({
    where: { id: input.orderId, userId: input.userId, status: ORDER_STATUS.COMPLETED, orderType: 'balance' },
    data: {
      status: ORDER_STATUS.REFUND_REQUESTED,
      refundRequestedAt: new Date(),
      refundRequestReason: normalizedReason,
      refundRequestedBy: input.userId,
      refundAmount: new Prisma.Decimal(refundAmount.toFixed(2)),
    },
  });

  if (updated.count === 0) {
    throw new OrderError(
      'CONFLICT',
      message(locale, '订单状态已变更，请刷新后重试', 'Order status changed, refresh and retry'),
      409,
    );
  }

  await prisma.auditLog.create({
    data: {
      orderId: input.orderId,
      action: 'REFUND_REQUESTED',
      detail: JSON.stringify({
        amount: refundAmount,
        reason: normalizedReason,
        requestedBy: input.userId,
      }),
      operator: `user:${input.userId}`,
    },
  });

  return { success: true };
}

export interface RefundInput {
  orderId: string;
  amount?: number;
  reason?: string;
  force?: boolean;
  deductBalance?: boolean;
  locale?: Locale;
}

export interface RefundResult {
  success: boolean;
  warning?: string;
  requireForce?: boolean;
  balanceDeducted?: number;
  subscriptionDaysDeducted?: number;
}

// ── 退款内部类型与辅助函数 ──

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

interface DeductionPlan {
  type: 'balance' | 'subscription' | 'none';
  balanceAmount: number;
  subscriptionDays: number;
  subscriptionId: number | null;
}

/** 查询用户余额/订阅信息，计算扣减量。返回 DeductionPlan 或提前返回的 RefundResult。 */
async function prepareDeduction(
  order: {
    userId: number;
    orderType: string | null;
    amount: Prisma.Decimal;
    subscriptionGroupId: number | null;
    subscriptionDays: number | null;
  },
  deductBalance: boolean,
  force: boolean,
  locale: Locale,
  overrideAmount?: number,
): Promise<DeductionPlan | RefundResult> {
  if (!deductBalance) return { type: 'none', balanceAmount: 0, subscriptionDays: 0, subscriptionId: null };

  const rechargeAmount = overrideAmount ?? Number(order.amount);

  if (order.orderType === 'subscription') {
    if (!order.subscriptionGroupId || !order.subscriptionDays) {
      return { type: 'subscription', balanceAmount: 0, subscriptionDays: 0, subscriptionId: null };
    }
    try {
      const userSubs = await getUserSubscriptions(order.userId);
      const activeSub = userSubs.find((s) => s.group_id === order.subscriptionGroupId && s.status === 'active');
      if (!activeSub) {
        return { type: 'subscription', balanceAmount: 0, subscriptionDays: 0, subscriptionId: null };
      }
      const remainingDays = Math.max(
        0,
        Math.ceil((new Date(activeSub.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
      );
      return {
        type: 'subscription',
        balanceAmount: 0,
        subscriptionDays: Math.min(order.subscriptionDays, remainingDays),
        subscriptionId: activeSub.id,
      };
    } catch {
      if (!force) {
        return {
          success: false,
          warning: message(locale, '无法获取订阅信息，请勾选强制退款', 'Cannot fetch subscription info, use force'),
          requireForce: true,
        };
      }
      return { type: 'subscription', balanceAmount: 0, subscriptionDays: 0, subscriptionId: null };
    }
  }

  // 余额订单
  try {
    const user = await getUser(order.userId);
    return {
      type: 'balance',
      balanceAmount: Math.min(rechargeAmount, user.balance),
      subscriptionDays: 0,
      subscriptionId: null,
    };
  } catch {
    if (!force) {
      return {
        success: false,
        warning: message(locale, '无法获取用户余额，请勾选强制退款', 'Cannot fetch user balance, use force'),
        requireForce: true,
      };
    }
    return { type: 'balance', balanceAmount: 0, subscriptionDays: 0, subscriptionId: null };
  }
}

function isDeductionPlan(v: DeductionPlan | RefundResult): v is DeductionPlan {
  return 'type' in v;
}

/** 执行扣减（先扣后退的"扣"步骤） */
async function executeDeduction(orderId: string, userId: number, plan: DeductionPlan): Promise<void> {
  const ts = Date.now();
  if (plan.type === 'subscription' && plan.subscriptionId && plan.subscriptionDays > 0) {
    await extendSubscription(plan.subscriptionId, -plan.subscriptionDays, `sub2apipay:refund-sub:${orderId}:${ts}`);
  } else if (plan.type === 'balance' && plan.balanceAmount > 0) {
    await subtractBalance(
      userId,
      plan.balanceAmount,
      `sub2apipay refund order:${orderId}`,
      `sub2apipay:refund:${orderId}:${ts}`,
    );
  }
}

/** 回滚已扣减的余额/订阅。返回 true 表示回滚成功，false 表示回滚也失败。 */
async function rollbackDeduction(
  orderId: string,
  userId: number,
  plan: DeductionPlan,
  gatewayError: unknown,
): Promise<boolean> {
  const ts = Date.now();
  if (plan.type === 'subscription' && plan.subscriptionId && plan.subscriptionDays > 0) {
    try {
      await extendSubscription(
        plan.subscriptionId,
        plan.subscriptionDays,
        `sub2apipay:refund-sub-rollback:${orderId}:${ts}`,
      );
      return true;
    } catch (rollbackError) {
      console.error(
        `[CRITICAL] Subscription rollback failed for order ${orderId}: ${plan.subscriptionDays} days deducted but gateway refund failed. Manual intervention required.`,
      );
      await prisma.auditLog.create({
        data: {
          orderId,
          action: 'REFUND_ROLLBACK_FAILED',
          detail: JSON.stringify({
            gatewayError: errorMessage(gatewayError),
            rollbackError: errorMessage(rollbackError),
            subscriptionDaysDeducted: plan.subscriptionDays,
          }),
          operator: 'admin',
        },
      });
      return false;
    }
  }

  if (plan.type === 'balance' && plan.balanceAmount > 0) {
    try {
      await addBalance(
        userId,
        plan.balanceAmount,
        `sub2apipay refund rollback order:${orderId}`,
        `sub2apipay:refund-rollback:${orderId}:${ts}`,
      );
      return true;
    } catch (rollbackError) {
      console.error(
        `[CRITICAL] Refund rollback failed for order ${orderId}: balance deducted ${plan.balanceAmount} but gateway refund and balance restoration both failed. Manual intervention required.`,
      );
      await prisma.auditLog.create({
        data: {
          orderId,
          action: 'REFUND_ROLLBACK_FAILED',
          detail: JSON.stringify({
            gatewayError: errorMessage(gatewayError),
            rollbackError: errorMessage(rollbackError),
            balanceDeducted: plan.balanceAmount,
            needsBalanceCompensation: true,
          }),
          operator: 'admin',
        },
      });
      return false;
    }
  }

  // 无需回滚（未执行扣减）
  return true;
}

// ── processRefund 主流程 ──

export async function processRefund(input: RefundInput): Promise<RefundResult> {
  const locale = input.locale ?? 'zh';
  const deductBalance = input.deductBalance ?? true;
  const order = await prisma.order.findUnique({ where: { id: input.orderId } });
  if (!order) throw new OrderError('NOT_FOUND', message(locale, '订单不存在', 'Order not found'), 404);

  const allowedStatuses = [ORDER_STATUS.COMPLETED, ORDER_STATUS.REFUND_REQUESTED, ORDER_STATUS.REFUND_FAILED];
  if (!allowedStatuses.includes(order.status as (typeof allowedStatuses)[number])) {
    throw new OrderError(
      'INVALID_STATUS',
      message(
        locale,
        '仅已完成、已申请退款或退款失败的订单允许退款',
        'Only completed, refund-requested, or refund-failed orders can be refunded',
      ),
      400,
    );
  }

  const rechargeAmount = Number(order.amount);
  const maxGatewayRefund = Number(order.payAmount ?? order.amount);

  // 部分退款支持：优先使用传入金额，否则全额
  const refundAmount = input.amount ?? rechargeAmount;
  if (!Number.isFinite(refundAmount) || refundAmount <= 0) {
    throw new OrderError(
      'INVALID_REFUND_AMOUNT',
      message(locale, '退款金额必须大于 0', 'Refund amount must be greater than 0'),
      400,
    );
  }
  if (refundAmount > rechargeAmount) {
    throw new OrderError(
      'REFUND_AMOUNT_EXCEEDED',
      message(locale, '退款金额不能超过充值金额', 'Refund amount cannot exceed recharge amount'),
      400,
    );
  }

  // 网关退款金额：部分退款时用 refundAmount，全额时用 payAmount
  const gatewayRefundAmount = input.amount ?? maxGatewayRefund;
  const refundReason =
    input.reason?.trim() || order.refundRequestReason?.trim() || `sub2apipay refund order:${order.id}`;

  // 1. 准备扣减计划（可能提前返回 requireForce）
  const planOrResult = await prepareDeduction(order, deductBalance, input.force ?? false, locale, input.amount);
  if (!isDeductionPlan(planOrResult)) return planOrResult;
  const plan = planOrResult;

  // 2. CAS 乐观锁
  const lockResult = await prisma.order.updateMany({
    where: {
      id: input.orderId,
      status: { in: [ORDER_STATUS.COMPLETED, ORDER_STATUS.REFUND_REQUESTED, ORDER_STATUS.REFUND_FAILED] },
    },
    data: { status: ORDER_STATUS.REFUNDING },
  });
  if (lockResult.count === 0) {
    throw new OrderError(
      'CONFLICT',
      message(locale, '订单状态已变更，请刷新后重试', 'Order status changed, refresh and retry'),
      409,
    );
  }

  try {
    // 3. 执行扣减（安全方向：先扣后退）
    await executeDeduction(order.id, order.userId, plan);

    // 4. 调用支付网关退款
    if (order.paymentTradeNo) {
      let provider;
      if (order.providerInstanceId) {
        const instConfig = await getInstanceConfig(order.providerInstanceId);
        if (instConfig) {
          const { EasyPayProvider } = await import('@/lib/easy-pay/provider');
          provider = new EasyPayProvider(order.providerInstanceId, instConfig);
        }
      }
      if (!provider) {
        initPaymentProviders();
        provider = paymentRegistry.getProvider(order.paymentType as PaymentType);
      }

      try {
        await provider.refund({
          tradeNo: order.paymentTradeNo,
          orderId: order.id,
          amount: gatewayRefundAmount,
          reason: refundReason,
        });
      } catch (gatewayError) {
        // 网关退款失败 — 回滚扣减
        const rollbackOk = await rollbackDeduction(input.orderId, order.userId, plan, gatewayError);

        if (rollbackOk) {
          // 回滚成功 — 恢复原状态，返回失败结果（不 throw）
          const restoreStatus =
            order.status === ORDER_STATUS.REFUND_REQUESTED ? ORDER_STATUS.REFUND_REQUESTED : ORDER_STATUS.COMPLETED;
          await prisma.order.update({ where: { id: input.orderId }, data: { status: restoreStatus } });
          await prisma.auditLog.create({
            data: {
              orderId: input.orderId,
              action: 'REFUND_GATEWAY_FAILED',
              detail: `Gateway refund failed, deduction rolled back: ${errorMessage(gatewayError)}`,
              operator: 'admin',
            },
          });
          return {
            success: false,
            warning: message(
              locale,
              `支付网关退款失败：${errorMessage(gatewayError)}，已回滚扣减`,
              `Gateway refund failed: ${errorMessage(gatewayError)}, deduction rolled back`,
            ),
          };
        }

        // 回滚失败 — 标记 REFUND_FAILED，需人工介入
        await prisma.order.update({
          where: { id: input.orderId },
          data: { status: ORDER_STATUS.REFUND_FAILED, failedAt: new Date(), failedReason: errorMessage(gatewayError) },
        });
        await prisma.auditLog.create({
          data: {
            orderId: input.orderId,
            action: 'REFUND_FAILED',
            detail: `Gateway refund failed and rollback also failed: ${errorMessage(gatewayError)}`,
            operator: 'admin',
          },
        });
        throw new OrderError('REFUND_FAILED', errorMessage(gatewayError), 500);
      }
    } else {
      await prisma.auditLog.create({
        data: {
          orderId: input.orderId,
          action: 'REFUND_NO_TRADE_NO',
          detail: 'No paymentTradeNo, skipped gateway refund',
          operator: 'admin',
        },
      });
    }

    // 5. 标记退款成功（部分/全额）
    const finalStatus = refundAmount < rechargeAmount ? ORDER_STATUS.PARTIALLY_REFUNDED : ORDER_STATUS.REFUNDED;

    await prisma.order.update({
      where: { id: input.orderId },
      data: {
        status: finalStatus,
        refundAmount: new Prisma.Decimal(refundAmount.toFixed(2)),
        refundReason: refundReason,
        refundAt: new Date(),
        forceRefund: input.force || false,
      },
    });

    await prisma.auditLog.create({
      data: {
        orderId: input.orderId,
        action: finalStatus === ORDER_STATUS.PARTIALLY_REFUNDED ? 'PARTIAL_REFUND_SUCCESS' : 'REFUND_SUCCESS',
        detail: JSON.stringify({
          rechargeAmount,
          refundAmount,
          gatewayRefundAmount,
          reason: refundReason,
          force: input.force,
          deductBalance,
          balanceDeducted: plan.balanceAmount,
          subscriptionDaysDeducted: plan.subscriptionDays,
        }),
        operator: 'admin',
      },
    });

    return { success: true, balanceDeducted: plan.balanceAmount, subscriptionDaysDeducted: plan.subscriptionDays };
  } catch (error) {
    // 未被内部处理的异常（如扣减阶段失败）— 标记 REFUND_FAILED
    if (!(error instanceof OrderError && error.code === 'REFUND_FAILED')) {
      await prisma.order.update({
        where: { id: input.orderId },
        data: { status: ORDER_STATUS.REFUND_FAILED, failedAt: new Date(), failedReason: errorMessage(error) },
      });
      await prisma.auditLog.create({
        data: { orderId: input.orderId, action: 'REFUND_FAILED', detail: errorMessage(error), operator: 'admin' },
      });
    }
    throw error;
  }
}

export class OrderError extends Error {
  code: string;
  statusCode: number;
  data?: Record<string, unknown>;

  constructor(code: string, message: string, statusCode: number = 400, data?: Record<string, unknown>) {
    super(message);
    this.name = 'OrderError';
    this.code = code;
    this.statusCode = statusCode;
    this.data = data;
  }
}
