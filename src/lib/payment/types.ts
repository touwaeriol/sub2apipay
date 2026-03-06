/** Unified payment method types across all providers */
export type PaymentType = string;

/**
 * 从复合 key 中提取基础支付方式（如 'alipay_direct' → 'alipay'）
 * 用于传给第三方 API 时映射回标准名称
 */
export function getBasePaymentType(type: string): string {
  if (type.startsWith('alipay')) return 'alipay';
  if (type.startsWith('wxpay')) return 'wxpay';
  if (type.startsWith('stripe')) return 'stripe';
  return type;
}

/** Request to create a payment with any provider */
export interface CreatePaymentRequest {
  orderId: string;
  amount: number; // in CNY (yuan)
  paymentType: PaymentType;
  subject: string; // product description
  notifyUrl?: string;
  returnUrl?: string;
  clientIp?: string;
}

/** Response from creating a payment */
export interface CreatePaymentResponse {
  tradeNo: string; // third-party transaction ID
  payUrl?: string; // H5 payment URL (alipay/wxpay)
  qrCode?: string; // QR code content
  clientSecret?: string; // Stripe PaymentIntent client secret (for embedded Payment Element)
}

/** Response from querying an order's payment status */
export interface QueryOrderResponse {
  tradeNo: string;
  status: 'pending' | 'paid' | 'failed' | 'refunded';
  amount: number;
  paidAt?: Date;
}

/** Parsed payment notification from webhook/notify callback */
export interface PaymentNotification {
  tradeNo: string;
  orderId: string;
  amount: number;
  status: 'success' | 'failed';
  rawData: unknown;
}

/** Request to refund a payment */
export interface RefundRequest {
  tradeNo: string;
  orderId: string;
  amount: number;
  reason?: string;
}

/** Response from a refund request */
export interface RefundResponse {
  refundId: string;
  status: 'success' | 'pending' | 'failed';
}

/** Per-method default limits declared by the provider */
export interface MethodDefaultLimits {
  /** 单笔最大金额，0 = 不限（使用全局 MAX_RECHARGE_AMOUNT） */
  singleMax?: number;
  /** 每日全平台最大金额，0 = 不限 */
  dailyMax?: number;
}

/** Common interface that all payment providers must implement */
export interface PaymentProvider {
  readonly name: string;
  readonly providerKey: string;
  readonly supportedTypes: PaymentType[];
  /** 各渠道默认限额，key 为 PaymentType（如 'alipay'），可被环境变量覆盖 */
  readonly defaultLimits?: Record<string, MethodDefaultLimits>;

  createPayment(request: CreatePaymentRequest): Promise<CreatePaymentResponse>;
  queryOrder(tradeNo: string): Promise<QueryOrderResponse>;
  /** Returns null for unrecognized/irrelevant webhook events (caller should return 200). */
  verifyNotification(rawBody: string | Buffer, headers: Record<string, string>): Promise<PaymentNotification | null>;
  refund(request: RefundRequest): Promise<RefundResponse>;
  /** Cancel/expire a pending payment on the platform. Optional — not all providers support it. */
  cancelPayment?(tradeNo: string): Promise<void>;
}
