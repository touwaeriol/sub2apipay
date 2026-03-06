import { prisma } from '@/lib/db';
import { getEnv } from '@/lib/config';
import { ORDER_STATUS } from '@/lib/constants';
import { generateRechargeCode } from './code-gen';
import { getMethodDailyLimit } from './limits';
import { getMethodFeeRate, calculatePayAmount } from './fee';
import { initPaymentProviders, paymentRegistry } from '@/lib/payment';
import type { PaymentType, PaymentNotification } from '@/lib/payment';
import { getUser, createAndRedeem, subtractBalance } from '@/lib/sub2api/client';
import { Prisma } from '@prisma/client';
import { deriveOrderState, isRefundStatus } from './status';

const MAX_PENDING_ORDERS = 3;

export interface CreateOrderInput {
  userId: number;
  amount: number;
  paymentType: PaymentType;
  clientIp: string;
  srcHost?: string;
  srcUrl?: string;
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
}

export async function createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
  const env = getEnv();

  const user = await getUser(input.userId);
  if (user.status !== 'active') {
    throw new OrderError('USER_INACTIVE', 'User account is disabled', 422);
  }

  const pendingCount = await prisma.order.count({
    where: { userId: input.userId, status: ORDER_STATUS.PENDING },
  });
  if (pendingCount >= MAX_PENDING_ORDERS) {
    throw new OrderError('TOO_MANY_PENDING', `Too many pending orders (${MAX_PENDING_ORDERS})`, 429);
  }

  // 每日累计充值限额校验（0 = 不限制）
  if (env.MAX_DAILY_RECHARGE_AMOUNT > 0) {
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
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
      throw new OrderError('DAILY_LIMIT_EXCEEDED', `今日累计充值已达上限，剩余可充值 ${remaining.toFixed(2)} 元`, 429);
    }
  }

  // 渠道每日全平台限额校验（0 = 不限）
  const methodDailyLimit = getMethodDailyLimit(input.paymentType);
  if (methodDailyLimit > 0) {
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
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
          ? `${input.paymentType} 今日剩余额度 ${remaining.toFixed(2)} 元，请减少充值金额或使用其他支付方式`
          : `${input.paymentType} 今日充值额度已满，请使用其他支付方式`,
        429,
      );
    }
  }

  const feeRate = getMethodFeeRate(input.paymentType);
  const payAmount = calculatePayAmount(input.amount, feeRate);

  const expiresAt = new Date(Date.now() + env.ORDER_TIMEOUT_MINUTES * 60 * 1000);
  const order = await prisma.order.create({
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
    },
  });

  const rechargeCode = generateRechargeCode(order.id);
  await prisma.order.update({
    where: { id: order.id },
    data: { rechargeCode },
  });

  try {
    initPaymentProviders();
    const provider = paymentRegistry.getProvider(input.paymentType);
    const paymentResult = await provider.createPayment({
      orderId: order.id,
      amount: payAmount,
      paymentType: input.paymentType,
      subject: `${env.PRODUCT_NAME} ${payAmount.toFixed(2)} CNY`,
      clientIp: input.clientIp,
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
        detail: JSON.stringify({ userId: input.userId, amount: input.amount, paymentType: input.paymentType }),
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
    };
  } catch (error) {
    await prisma.order.delete({ where: { id: order.id } });

    // 已经是业务错误，直接向上抛
    if (error instanceof OrderError) throw error;

    // 支付网关配置缺失或调用失败，转成友好错误
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`Payment gateway error (${input.paymentType}):`, error);
    if (msg.includes('environment variables') || msg.includes('not configured') || msg.includes('not found')) {
      throw new OrderError('PAYMENT_GATEWAY_ERROR', `支付渠道（${input.paymentType}）暂未配置，请联系管理员`, 503);
    }
    throw new OrderError('PAYMENT_GATEWAY_ERROR', '支付渠道暂时不可用，请稍后重试或更换支付方式', 502);
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

export async function cancelOrder(orderId: string, userId: number): Promise<CancelOutcome> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, userId: true, status: true, paymentTradeNo: true, paymentType: true },
  });

  if (!order) throw new OrderError('NOT_FOUND', 'Order not found', 404);
  if (order.userId !== userId) throw new OrderError('FORBIDDEN', 'Forbidden', 403);
  if (order.status !== ORDER_STATUS.PENDING) throw new OrderError('INVALID_STATUS', 'Order cannot be cancelled', 400);

  return cancelOrderCore({
    orderId: order.id,
    paymentTradeNo: order.paymentTradeNo,
    paymentType: order.paymentType,
    finalStatus: ORDER_STATUS.CANCELLED,
    operator: `user:${userId}`,
    auditDetail: 'User cancelled order',
  });
}

export async function adminCancelOrder(orderId: string): Promise<CancelOutcome> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, status: true, paymentTradeNo: true, paymentType: true },
  });

  if (!order) throw new OrderError('NOT_FOUND', 'Order not found', 404);
  if (order.status !== ORDER_STATUS.PENDING) throw new OrderError('INVALID_STATUS', 'Order cannot be cancelled', 400);

  return cancelOrderCore({
    orderId: order.id,
    paymentTradeNo: order.paymentTradeNo,
    paymentType: order.paymentType,
    finalStatus: ORDER_STATUS.CANCELLED,
    operator: 'admin',
    auditDetail: 'Admin cancelled order',
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
    console.warn(
      `${input.providerName} notify: amount changed, use paid amount`,
      expectedAmount.toString(),
      paidAmount.toString(),
    );
  }

  const result = await prisma.order.updateMany({
    where: {
      id: order.id,
      status: { in: [ORDER_STATUS.PENDING, ORDER_STATUS.EXPIRED] },
    },
    data: {
      status: ORDER_STATUS.PAID,
      amount: paidAmount,
      paymentTradeNo: input.tradeNo,
      paidAt: new Date(),
      failedAt: null,
      failedReason: null,
    },
  });

  if (result.count === 0) {
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
    await executeRecharge(order.id);
  } catch (err) {
    console.error('Recharge failed for order:', order.id, err);
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

  try {
    await createAndRedeem(
      order.rechargeCode,
      Number(order.amount),
      order.userId,
      `sub2apipay recharge order:${orderId}`,
    );

    await prisma.order.update({
      where: { id: orderId },
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

function assertRetryAllowed(order: { status: string; paidAt: Date | null }): void {
  if (!order.paidAt) {
    throw new OrderError('INVALID_STATUS', 'Order is not paid, retry denied', 400);
  }

  if (isRefundStatus(order.status)) {
    throw new OrderError('INVALID_STATUS', 'Refund-related order cannot retry', 400);
  }

  if (order.status === ORDER_STATUS.FAILED || order.status === ORDER_STATUS.PAID) {
    return;
  }

  if (order.status === ORDER_STATUS.RECHARGING) {
    throw new OrderError('CONFLICT', 'Order is recharging, retry later', 409);
  }

  if (order.status === ORDER_STATUS.COMPLETED) {
    throw new OrderError('INVALID_STATUS', 'Order already completed', 400);
  }

  throw new OrderError('INVALID_STATUS', 'Only paid and failed orders can retry', 400);
}

export async function retryRecharge(orderId: string): Promise<void> {
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
    throw new OrderError('NOT_FOUND', 'Order not found', 404);
  }

  assertRetryAllowed(order);

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
      throw new OrderError('NOT_FOUND', 'Order not found', 404);
    }

    const derived = deriveOrderState(latest);
    if (derived.rechargeStatus === 'recharging' || latest.status === ORDER_STATUS.PAID) {
      throw new OrderError('CONFLICT', 'Order is recharging, retry later', 409);
    }

    if (derived.rechargeStatus === 'success') {
      throw new OrderError('INVALID_STATUS', 'Order already completed', 400);
    }

    if (isRefundStatus(latest.status)) {
      throw new OrderError('INVALID_STATUS', 'Refund-related order cannot retry', 400);
    }

    throw new OrderError('CONFLICT', 'Order status changed, refresh and retry', 409);
  }

  await prisma.auditLog.create({
    data: {
      orderId,
      action: 'RECHARGE_RETRY',
      detail: 'Admin manual retry recharge',
      operator: 'admin',
    },
  });

  await executeRecharge(orderId);
}

export interface RefundInput {
  orderId: string;
  reason?: string;
  force?: boolean;
}

export interface RefundResult {
  success: boolean;
  warning?: string;
  requireForce?: boolean;
}

export async function processRefund(input: RefundInput): Promise<RefundResult> {
  const order = await prisma.order.findUnique({ where: { id: input.orderId } });
  if (!order) throw new OrderError('NOT_FOUND', 'Order not found', 404);
  if (order.status !== ORDER_STATUS.COMPLETED) {
    throw new OrderError('INVALID_STATUS', 'Only completed orders can be refunded', 400);
  }

  const rechargeAmount = Number(order.amount);
  const refundAmount = Number(order.payAmount ?? order.amount);

  if (!input.force) {
    try {
      const user = await getUser(order.userId);
      if (user.balance < rechargeAmount) {
        return {
          success: false,
          warning: `User balance ${user.balance} is lower than refund ${rechargeAmount}`,
          requireForce: true,
        };
      }
    } catch {
      return {
        success: false,
        warning: 'Cannot fetch user balance, use force=true',
        requireForce: true,
      };
    }
  }

  const lockResult = await prisma.order.updateMany({
    where: { id: input.orderId, status: ORDER_STATUS.COMPLETED },
    data: { status: ORDER_STATUS.REFUNDING },
  });
  if (lockResult.count === 0) {
    throw new OrderError('CONFLICT', 'Order status changed, refresh and retry', 409);
  }

  try {
    if (order.paymentTradeNo) {
      initPaymentProviders();
      const provider = paymentRegistry.getProvider(order.paymentType as PaymentType);
      await provider.refund({
        tradeNo: order.paymentTradeNo,
        orderId: order.id,
        amount: refundAmount,
        reason: input.reason,
      });
    }

    await subtractBalance(
      order.userId,
      rechargeAmount,
      `sub2apipay refund order:${order.id}`,
      `sub2apipay:refund:${order.id}`,
    );

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
