import { ORDER_STATUS, REFUND_STATUSES } from '@/lib/constants';

export type RechargeStatus = 'not_paid' | 'paid_pending' | 'recharging' | 'success' | 'failed' | 'closed';

export interface OrderStatusLike {
  status: string;
  paidAt?: Date | string | null;
  completedAt?: Date | string | null;
}

export interface DerivedOrderState {
  paymentSuccess: boolean;
  rechargeSuccess: boolean;
  rechargeStatus: RechargeStatus;
}

export interface PublicOrderStatusSnapshot extends DerivedOrderState {
  id: string;
  status: string;
  expiresAt: Date | string;
  failedReason?: string | null;
}

export interface OrderDisplayState {
  label: string;
  color: string;
  icon: string;
  message: string;
}

const CLOSED_STATUSES = new Set<string>([
  ORDER_STATUS.EXPIRED,
  ORDER_STATUS.CANCELLED,
  ORDER_STATUS.REFUND_REQUESTED,
  ORDER_STATUS.REFUNDING,
  ORDER_STATUS.PARTIALLY_REFUNDED,
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

export function deriveOrderState(order: OrderStatusLike): DerivedOrderState {
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

export function getOrderDisplayState(
  order: Pick<PublicOrderStatusSnapshot, 'status' | 'paymentSuccess' | 'rechargeSuccess' | 'rechargeStatus'>,
): OrderDisplayState {
  if (order.status === ORDER_STATUS.REFUND_REQUESTED) {
    return {
      label: '申请中',
      color: 'text-violet-600',
      icon: '…',
      message: '退款申请已提交，等待管理员确认。',
    };
  }

  if (order.status === ORDER_STATUS.REFUNDING) {
    return {
      label: '退款中',
      color: 'text-orange-600',
      icon: '⟳',
      message: '管理员已确认退款，正在处理退款，请稍候。',
    };
  }

  if (order.status === ORDER_STATUS.PARTIALLY_REFUNDED) {
    return {
      label: '已部分退款',
      color: 'text-fuchsia-600',
      icon: '✓',
      message: '订单已完成部分退款。',
    };
  }

  if (order.status === ORDER_STATUS.REFUNDED) {
    return {
      label: '已退款',
      color: 'text-purple-600',
      icon: '✓',
      message: '订单已完成退款。',
    };
  }

  if (order.status === ORDER_STATUS.REFUND_FAILED) {
    return {
      label: '退款失败',
      color: 'text-red-600',
      icon: '✗',
      message: '退款处理失败，请联系管理员。',
    };
  }

  if (order.rechargeSuccess || order.rechargeStatus === 'success') {
    return {
      label: '充值成功',
      color: 'text-green-600',
      icon: '✓',
      message: '余额已到账，感谢您的充值！',
    };
  }

  if (order.paymentSuccess) {
    if (order.rechargeStatus === 'paid_pending' || order.rechargeStatus === 'recharging') {
      return {
        label: '充值中',
        color: 'text-blue-600',
        icon: '⟳',
        message: '支付成功，正在充值余额中，请稍候...',
      };
    }

    if (order.rechargeStatus === 'failed') {
      return {
        label: '支付成功',
        color: 'text-amber-600',
        icon: '!',
        message: '支付已完成，但余额充值暂未完成。系统可能会自动重试，请稍后在订单列表查看；如长时间未到账请联系管理员。',
      };
    }
  }

  if (order.status === ORDER_STATUS.FAILED) {
    return {
      label: '支付失败',
      color: 'text-red-600',
      icon: '✗',
      message: '支付未完成，请重新发起支付；如已扣款未到账，请联系管理员处理。',
    };
  }

  if (order.status === ORDER_STATUS.PENDING) {
    return {
      label: '等待支付',
      color: 'text-yellow-600',
      icon: '⏳',
      message: '订单尚未完成支付。',
    };
  }

  if (order.status === ORDER_STATUS.EXPIRED) {
    return {
      label: '订单超时',
      color: 'text-gray-500',
      icon: '⏰',
      message: '订单已超时，请重新创建订单。',
    };
  }

  if (order.status === ORDER_STATUS.CANCELLED) {
    return {
      label: '已取消',
      color: 'text-gray-500',
      icon: '✗',
      message: '订单已取消。',
    };
  }

  return {
    label: '支付异常',
    color: 'text-red-600',
    icon: '✗',
    message: '支付状态异常，请联系管理员处理。',
  };
}
