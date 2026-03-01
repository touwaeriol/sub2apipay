import { prisma } from '@/lib/db';
import { getEnv } from '@/lib/config';
import { generateRechargeCode } from './code-gen';
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
}

export interface CreateOrderResult {
  orderId: string;
  amount: number;
  status: string;
  paymentType: PaymentType;
  userName: string;
  userBalance: number;
  payUrl?: string | null;
  qrCode?: string | null;
  checkoutUrl?: string | null;
  expiresAt: Date;
}

export async function createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
  const env = getEnv();

  const user = await getUser(input.userId);
  if (user.status !== 'active') {
    throw new OrderError('USER_INACTIVE', 'User account is disabled', 422);
  }

  const pendingCount = await prisma.order.count({
    where: { userId: input.userId, status: 'PENDING' },
  });
  if (pendingCount >= MAX_PENDING_ORDERS) {
    throw new OrderError('TOO_MANY_PENDING', `Too many pending orders (${MAX_PENDING_ORDERS})`, 429);
  }

  const expiresAt = new Date(Date.now() + env.ORDER_TIMEOUT_MINUTES * 60 * 1000);
  const order = await prisma.order.create({
    data: {
      userId: input.userId,
      userEmail: user.email,
      userName: user.username,
      amount: new Prisma.Decimal(input.amount.toFixed(2)),
      rechargeCode: '',
      status: 'PENDING',
      paymentType: input.paymentType,
      expiresAt,
      clientIp: input.clientIp,
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
      amount: input.amount,
      paymentType: input.paymentType,
      subject: `${env.PRODUCT_NAME} ${input.amount.toFixed(2)} CNY`,
      notifyUrl: env.EASY_PAY_NOTIFY_URL || '',
      returnUrl: env.EASY_PAY_RETURN_URL || '',
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
      status: 'PENDING',
      paymentType: input.paymentType,
      userName: user.username,
      userBalance: user.balance,
      payUrl: paymentResult.payUrl,
      qrCode: paymentResult.qrCode,
      checkoutUrl: paymentResult.checkoutUrl,
      expiresAt,
    };
  } catch (error) {
    await prisma.order.delete({ where: { id: order.id } });
    throw error;
  }
}

export async function cancelOrder(orderId: string, userId: number): Promise<void> {
  const result = await prisma.order.updateMany({
    where: { id: orderId, userId, status: 'PENDING' },
    data: { status: 'CANCELLED', updatedAt: new Date() },
  });

  if (result.count === 0) {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new OrderError('NOT_FOUND', 'Order not found', 404);
    if (order.userId !== userId) throw new OrderError('FORBIDDEN', 'Forbidden', 403);
    throw new OrderError('INVALID_STATUS', 'Order cannot be cancelled', 400);
  }

  await prisma.auditLog.create({
    data: {
      orderId,
      action: 'ORDER_CANCELLED',
      detail: 'User cancelled order',
      operator: `user:${userId}`,
    },
  });
}

export async function adminCancelOrder(orderId: string): Promise<void> {
  const result = await prisma.order.updateMany({
    where: { id: orderId, status: 'PENDING' },
    data: { status: 'CANCELLED', updatedAt: new Date() },
  });

  if (result.count === 0) {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new OrderError('NOT_FOUND', 'Order not found', 404);
    throw new OrderError('INVALID_STATUS', 'Order cannot be cancelled', 400);
  }

  await prisma.auditLog.create({
    data: {
      orderId,
      action: 'ORDER_CANCELLED',
      detail: 'Admin cancelled order',
      operator: 'admin',
    },
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
  if (!paidAmount.equals(order.amount)) {
    console.warn(
      `${input.providerName} notify: amount changed, use paid amount`,
      order.amount.toString(),
      paidAmount.toString(),
    );
  }

  const result = await prisma.order.updateMany({
    where: {
      id: order.id,
      status: { in: ['PENDING', 'EXPIRED'] },
    },
    data: {
      status: 'PAID',
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
  if (order.status === 'COMPLETED') {
    return;
  }
  if (isRefundStatus(order.status)) {
    throw new OrderError('INVALID_STATUS', 'Refund-related order cannot recharge', 400);
  }
  if (order.status !== 'PAID' && order.status !== 'FAILED') {
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
      data: { status: 'COMPLETED', completedAt: new Date() },
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
        status: 'FAILED',
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

  if (order.status === 'FAILED' || order.status === 'PAID') {
    return;
  }

  if (order.status === 'RECHARGING') {
    throw new OrderError('CONFLICT', 'Order is recharging, retry later', 409);
  }

  if (order.status === 'COMPLETED') {
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
      status: { in: ['FAILED', 'PAID'] },
      paidAt: { not: null },
    },
    data: { status: 'PAID', failedAt: null, failedReason: null },
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
    if (derived.rechargeStatus === 'recharging' || latest.status === 'PAID') {
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
  if (order.status !== 'COMPLETED') {
    throw new OrderError('INVALID_STATUS', 'Only completed orders can be refunded', 400);
  }

  const amount = Number(order.amount);

  if (!input.force) {
    try {
      const user = await getUser(order.userId);
      if (user.balance < amount) {
        return {
          success: false,
          warning: `User balance ${user.balance} is lower than refund ${amount}`,
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
    where: { id: input.orderId, status: 'COMPLETED' },
    data: { status: 'REFUNDING' },
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
        amount,
        reason: input.reason,
      });
    }

    await subtractBalance(order.userId, amount, `sub2apipay refund order:${order.id}`, `sub2apipay:refund:${order.id}`);

    await prisma.order.update({
      where: { id: input.orderId },
      data: {
        status: 'REFUNDED',
        refundAmount: new Prisma.Decimal(amount.toFixed(2)),
        refundReason: input.reason || null,
        refundAt: new Date(),
        forceRefund: input.force || false,
      },
    });

    await prisma.auditLog.create({
      data: {
        orderId: input.orderId,
        action: 'REFUND_SUCCESS',
        detail: JSON.stringify({ amount, reason: input.reason, force: input.force }),
        operator: 'admin',
      },
    });

    return { success: true };
  } catch (error) {
    await prisma.order.update({
      where: { id: input.orderId },
      data: {
        status: 'REFUND_FAILED',
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
