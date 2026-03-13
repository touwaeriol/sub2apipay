import { prisma } from '@/lib/db';
import { getEnv } from '@/lib/config';
import { ORDER_STATUS } from '@/lib/constants';
import { generateRechargeCode } from './code-gen';
import { getMethodDailyLimit } from './limits';
import { getMethodFeeRate, calculatePayAmount } from './fee';
import { initPaymentProviders, paymentRegistry } from '@/lib/payment';
import type { PaymentType, PaymentNotification } from '@/lib/payment';
import { getUser, createAndRedeem, subtractBalance, addBalance, getGroup } from '@/lib/sub2api/client';
import { computeValidityDays, type ValidityUnit } from '@/lib/subscription-utils';
import { Prisma } from '@prisma/client';
import { deriveOrderState, isRefundStatus } from './status';
import { pickLocaleText, type Locale } from '@/lib/locale';
import { getBizDayStartUTC } from '@/lib/time/biz-day';
import { buildOrderResultUrl, createOrderStatusAccessToken } from '@/lib/order/status-access';

const MAX_PENDING_ORDERS = 3;

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
  let subscriptionPlan: { id: string; groupId: number; price: Prisma.Decimal; validityDays: number; validityUnit: string; name: string } | null = null;
  if (orderType === 'subscription') {
    if (!input.planId) {
      throw new OrderError('INVALID_INPUT', message(locale, '订阅订单必须指定套餐', 'Subscription order requires a plan'), 400);
    }
    const plan = await prisma.subscriptionPlan.findUnique({ where: { id: input.planId } });
    if (!plan || !plan.forSale) {
      throw new OrderError('PLAN_NOT_AVAILABLE', message(locale, '该套餐不存在或未上架', 'Plan not found or not for sale'), 404);
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
    subscriptionPlan = plan;
    // 订阅订单金额使用服务端套餐价格，不信任客户端
    input.amount = Number(plan.price);
  }

  const user = await getUser(input.userId);
  if (user.status !== 'active') {
    throw new OrderError('USER_INACTIVE', message(locale, '用户账号已被禁用', 'User account is disabled'), 422);
  }

  const pendingCount = await prisma.order.count({
    where: { userId: input.userId, status: ORDER_STATUS.PENDING },
  });
  if (pendingCount >= MAX_PENDING_ORDERS) {
    throw new OrderError(
      'TOO_MANY_PENDING',
      message(
        locale,
        `待支付订单过多（最多 ${MAX_PENDING_ORDERS} 笔）`,
        `Too many pending orders (${MAX_PENDING_ORDERS})`,
      ),
      429,
    );
  }

  // 每日累计充值限额校验（0 = 不限制）
  if (env.MAX_DAILY_RECHARGE_AMOUNT > 0) {
    const dailyAgg = await prisma.order.aggregate({
      where: {
        userId: input.userId,
        status: { in: [ORDER_STATUS.PAID, ORDER_STATUS.RECHARGING, ORDER_STATUS.COMPLETED] },
        paidAt: { gte: todayStart },
      },
      _sum: { amount: true },
    });
    const alreadyPaid = Number(dailyAgg._sum.amount ?? 0);
    if (alreadyPaid + input.amount > env.MAX_DAILY_RECHARGE_AMOUNT) {
      const remaining = Math.max(0, env.MAX_DAILY_RECHARGE_AMOUNT - alreadyPaid);
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
  const methodDailyLimit = getMethodDailyLimit(input.paymentType);
  if (methodDailyLimit > 0) {
    const methodAgg = await prisma.order.aggregate({
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

  const feeRate = getMethodFeeRate(input.paymentType);
  const payAmount = calculatePayAmount(input.amount, feeRate);

  const expiresAt = new Date(Date.now() + env.ORDER_TIMEOUT_MINUTES * 60 * 1000);
  const order = await prisma.$transaction(async (tx) => {
    const created = await tx.order.create({
      data: {
        userId: input.userId,
        userEmail: user.email,
        userName: user.username,
        userNotes: user.notes || null,
        amount: new Prisma.Decimal(input.amount.toFixed(2)),
        payAmount: new Prisma.Decimal(payAmount.toFixed(2)),
        feeRate: feeRate > 0 ? new Prisma.Decimal(feeRate.toFixed(2)) : null,
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

    const statusAccessToken = createOrderStatusAccessToken(order.id);
    const orderResultUrl = buildOrderResultUrl(env.NEXT_PUBLIC_APP_URL, order.id);

    // 只有 easypay 从外部传入 notifyUrl，return_url 统一回到带访问令牌的结果页
    let notifyUrl: string | undefined;
    let returnUrl: string | undefined = orderResultUrl;
    if (provider.providerKey === 'easypay') {
      notifyUrl = env.EASY_PAY_NOTIFY_URL || '';
      returnUrl = orderResultUrl;
    }

    const paymentResult = await provider.createPayment({
      orderId: order.id,
      amount: payAmount,
      paymentType: input.paymentType,
      subject: `${env.PRODUCT_NAME} ${payAmount.toFixed(2)} CNY`,
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
          ...(subscriptionPlan && { planId: subscriptionPlan.id, planName: subscriptionPlan.name, groupId: subscriptionPlan.groupId }),
        }),
        operator: `user:${input.userId}`,
      },
    });

    return {
      orderId: order.id,
      amount: input.amount,
      payAmount,
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
  finalStatus: 'CANCELLED' | 'EXPIRED';
  operator: string;
  auditDetail: string;
}): Promise<CancelOutcome> {
  const { orderId, paymentTradeNo, paymentType, finalStatus, operator, auditDetail } = options;

  // 1. 平台侧处理
  if (paymentTradeNo && paymentType) {
    try {
      initPaymentProviders();
      const provider = paymentRegistry.getProvider(paymentType as PaymentType);
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
    select: { id: true, userId: true, status: true, paymentTradeNo: true, paymentType: true },
  });

  if (!order) throw new OrderError('NOT_FOUND', message(locale, '订单不存在', 'Order not found'), 404);
  if (order.userId !== userId) throw new OrderError('FORBIDDEN', message(locale, '无权操作该订单', 'Forbidden'), 403);
  if (order.status !== ORDER_STATUS.PENDING)
    throw new OrderError('INVALID_STATUS', message(locale, '订单当前状态不可取消', 'Order cannot be cancelled'), 400);

  return cancelOrderCore({
    orderId: order.id,
    paymentTradeNo: order.paymentTradeNo,
    paymentType: order.paymentType,
    finalStatus: ORDER_STATUS.CANCELLED,
    operator: `user:${userId}`,
    auditDetail: message(locale, '用户取消订单', 'User cancelled order'),
  });
}

export async function adminCancelOrder(orderId: string, locale: Locale = 'zh'): Promise<CancelOutcome> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, status: true, paymentTradeNo: true, paymentType: true },
  });

  if (!order) throw new OrderError('NOT_FOUND', message(locale, '订单不存在', 'Order not found'), 404);
  if (order.status !== ORDER_STATUS.PENDING)
    throw new OrderError('INVALID_STATUS', message(locale, '订单当前状态不可取消', 'Order cannot be cancelled'), 400);

  return cancelOrderCore({
    orderId: order.id,
    paymentTradeNo: order.paymentTradeNo,
    paymentType: order.paymentType,
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

    await createAndRedeem(
      order.rechargeCode,
      Number(order.amount),
      order.userId,
      `sub2apipay subscription order:${orderId}`,
      {
        type: 'subscription',
        groupId: order.subscriptionGroupId,
        validityDays: order.subscriptionDays,
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
        failedReason: isGroupGone
          ? `SUBSCRIPTION_GROUP_GONE: ${reason}`
          : reason,
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

export interface RefundInput {
  orderId: string;
  reason?: string;
  force?: boolean;
  locale?: Locale;
}

export interface RefundResult {
  success: boolean;
  warning?: string;
  requireForce?: boolean;
}

export async function processRefund(input: RefundInput): Promise<RefundResult> {
  const locale = input.locale ?? 'zh';
  const order = await prisma.order.findUnique({ where: { id: input.orderId } });
  if (!order) throw new OrderError('NOT_FOUND', message(locale, '订单不存在', 'Order not found'), 404);
  if (order.status !== ORDER_STATUS.COMPLETED) {
    throw new OrderError(
      'INVALID_STATUS',
      message(locale, '仅已完成订单允许退款', 'Only completed orders can be refunded'),
      400,
    );
  }

  const rechargeAmount = Number(order.amount);
  const refundAmount = Number(order.payAmount ?? order.amount);

  if (!input.force) {
    try {
      const user = await getUser(order.userId);
      if (user.balance < rechargeAmount) {
        return {
          success: false,
          warning: message(
            locale,
            `用户余额 ${user.balance} 小于需退款的充值金额 ${rechargeAmount}`,
            `User balance ${user.balance} is lower than refund ${rechargeAmount}`,
          ),
          requireForce: true,
        };
      }
    } catch {
      return {
        success: false,
        warning: message(locale, '无法获取用户余额，请使用 force=true', 'Cannot fetch user balance, use force=true'),
        requireForce: true,
      };
    }
  }

  const lockResult = await prisma.order.updateMany({
    where: { id: input.orderId, status: ORDER_STATUS.COMPLETED },
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
    // 1. 先扣减用户余额（安全方向：先扣后退）
    await subtractBalance(
      order.userId,
      rechargeAmount,
      `sub2apipay refund order:${order.id}`,
      `sub2apipay:refund:${order.id}`,
    );

    // 2. 调用支付网关退款
    if (order.paymentTradeNo) {
      try {
        initPaymentProviders();
        const provider = paymentRegistry.getProvider(order.paymentType as PaymentType);
        await provider.refund({
          tradeNo: order.paymentTradeNo,
          orderId: order.id,
          amount: refundAmount,
          reason: input.reason,
        });
      } catch (gatewayError) {
        // 3. 网关退款失败 — 恢复已扣减的余额
        try {
          await addBalance(
            order.userId,
            rechargeAmount,
            `sub2apipay refund rollback order:${order.id}`,
            `sub2apipay:refund-rollback:${order.id}`,
          );
        } catch (rollbackError) {
          // 余额恢复也失败，记录审计日志，需人工介入
          await prisma.auditLog.create({
            data: {
              orderId: input.orderId,
              action: 'REFUND_ROLLBACK_FAILED',
              detail: JSON.stringify({
                gatewayError: gatewayError instanceof Error ? gatewayError.message : String(gatewayError),
                rollbackError: rollbackError instanceof Error ? rollbackError.message : String(rollbackError),
                rechargeAmount,
              }),
              operator: 'admin',
            },
          });
        }
        throw gatewayError;
      }
    }

    await prisma.order.update({
      where: { id: input.orderId },
      data: {
        status: ORDER_STATUS.REFUNDED,
        refundAmount: new Prisma.Decimal(refundAmount.toFixed(2)),
        refundReason: input.reason || null,
        refundAt: new Date(),
        forceRefund: input.force || false,
      },
    });

    await prisma.auditLog.create({
      data: {
        orderId: input.orderId,
        action: 'REFUND_SUCCESS',
        detail: JSON.stringify({ rechargeAmount, refundAmount, reason: input.reason, force: input.force }),
        operator: 'admin',
      },
    });

    return { success: true };
  } catch (error) {
    await prisma.order.update({
      where: { id: input.orderId },
      data: {
        status: ORDER_STATUS.REFUND_FAILED,
        failedAt: new Date(),
        failedReason: error instanceof Error ? error.message : String(error),
      },
    });

    await prisma.auditLog.create({
      data: {
        orderId: input.orderId,
        action: 'REFUND_FAILED',
        detail: error instanceof Error ? error.message : String(error),
        operator: 'admin',
      },
    });

    throw error;
  }
}

export class OrderError extends Error {
  code: string;
  statusCode: number;

  constructor(code: string, message: string, statusCode: number = 400) {
    super(message);
    this.name = 'OrderError';
    this.code = code;
    this.statusCode = statusCode;
  }
}
