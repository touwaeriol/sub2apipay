/** 订单状态 */
export const ORDER_STATUS = {
  PENDING: 'PENDING',
  PAID: 'PAID',
  RECHARGING: 'RECHARGING',
  COMPLETED: 'COMPLETED',
  EXPIRED: 'EXPIRED',
  CANCELLED: 'CANCELLED',
  FAILED: 'FAILED',
  REFUND_REQUESTED: 'REFUND_REQUESTED',
  REFUNDING: 'REFUNDING',
  PARTIALLY_REFUNDED: 'PARTIALLY_REFUNDED',
  REFUNDED: 'REFUNDED',
  REFUND_FAILED: 'REFUND_FAILED',
} as const;

export type OrderStatus = (typeof ORDER_STATUS)[keyof typeof ORDER_STATUS];

/** 终态状态集合（不再轮询） */
export const TERMINAL_STATUSES = new Set<string>([
  ORDER_STATUS.COMPLETED,
  ORDER_STATUS.FAILED,
  ORDER_STATUS.CANCELLED,
  ORDER_STATUS.EXPIRED,
  ORDER_STATUS.PARTIALLY_REFUNDED,
  ORDER_STATUS.REFUNDED,
  ORDER_STATUS.REFUND_FAILED,
]);

/** 退款相关状态 */
export const REFUND_STATUSES = new Set<string>([
  ORDER_STATUS.REFUND_REQUESTED,
  ORDER_STATUS.REFUNDING,
  ORDER_STATUS.PARTIALLY_REFUNDED,
  ORDER_STATUS.REFUNDED,
  ORDER_STATUS.REFUND_FAILED,
]);

/** 支付方式标识 */
export const PAYMENT_TYPE = {
  ALIPAY: 'alipay',
  ALIPAY_DIRECT: 'alipay_direct',
  WXPAY: 'wxpay',
  WXPAY_DIRECT: 'wxpay_direct',
  STRIPE: 'stripe',
} as const;

/** 支付方式前缀（用于 startsWith 判断） */
export const PAYMENT_PREFIX = {
  ALIPAY: 'alipay',
  WXPAY: 'wxpay',
  STRIPE: 'stripe',
} as const;

/** 需要页面跳转（而非二维码）的支付方式 */
export const REDIRECT_PAYMENT_TYPES = new Set<string>([PAYMENT_TYPE.ALIPAY_DIRECT]);
