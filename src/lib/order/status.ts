import { ORDER_STATUS, REFUND_STATUSES } from '@/lib/constants';

export type RechargeStatus = 'not_paid' | 'paid_pending' | 'recharging' | 'success' | 'failed' | 'closed';

export interface OrderStatusLike {
  status: string;
  paidAt?: Date | string | null;
  completedAt?: Date | string | null;
}

const CLOSED_STATUSES = new Set<string>([
  ORDER_STATUS.EXPIRED,
  ORDER_STATUS.CANCELLED,
  ORDER_STATUS.REFUNDING,
  ORDER_STATUS.REFUNDED,
  ORDER_STATUS.REFUND_FAILED,
]);

function hasDate(value: Date | string | null | undefined): boolean {
  return Boolean(value);
}

export function isRefundStatus(status: string): boolean {
  return REFUND_STATUSES.has(status);
}

export function isRechargeRetryable(order: OrderStatusLike): boolean {
  return hasDate(order.paidAt) && order.status === ORDER_STATUS.FAILED && !isRefundStatus(order.status);
}

export function deriveOrderState(order: OrderStatusLike): {
  paymentSuccess: boolean;
  rechargeSuccess: boolean;
  rechargeStatus: RechargeStatus;
} {
  const paymentSuccess = hasDate(order.paidAt);
  const rechargeSuccess = hasDate(order.completedAt) || order.status === ORDER_STATUS.COMPLETED;

  if (rechargeSuccess) {
    return { paymentSuccess, rechargeSuccess: true, rechargeStatus: 'success' };
  }

  if (order.status === ORDER_STATUS.RECHARGING) {
    return { paymentSuccess, rechargeSuccess: false, rechargeStatus: 'recharging' };
  }

  if (order.status === ORDER_STATUS.FAILED) {
    return { paymentSuccess, rechargeSuccess: false, rechargeStatus: 'failed' };
  }

  if (CLOSED_STATUSES.has(order.status)) {
    return { paymentSuccess, rechargeSuccess: false, rechargeStatus: 'closed' };
  }

  if (paymentSuccess) {
    return { paymentSuccess, rechargeSuccess: false, rechargeStatus: 'paid_pending' };
  }

  return { paymentSuccess: false, rechargeSuccess: false, rechargeStatus: 'not_paid' };
}
