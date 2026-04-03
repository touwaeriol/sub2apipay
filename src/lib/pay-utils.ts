import { ORDER_STATUS, PAYMENT_TYPE, PAYMENT_PREFIX, REDIRECT_PAYMENT_TYPES } from './constants';
import type { Locale } from './locale';

export interface UserInfo {
  id?: number;
  username: string;
  balance?: number;
}

export interface MyOrder {
  id: string;
  amount: number;
  status: string;
  paymentType: string;
  createdAt: string;
  orderType?: string;
  refundRequestedAt?: string | null;
  refundRequestReason?: string | null;
  refundAmount?: number | null;
  canRefundRequest?: boolean;
}

export type OrderStatusFilter =
  | 'ALL'
  | 'PENDING'
  | 'PAID'
  | 'COMPLETED'
  | 'REFUND_REQUESTED'
  | 'REFUNDING'
  | 'PARTIALLY_REFUNDED'
  | 'REFUNDED'
  | 'REFUND_FAILED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'FAILED';

const STATUS_TEXT_MAP: Record<Locale, Record<string, string>> = {
  zh: {
    [ORDER_STATUS.PENDING]: '待支付',
    [ORDER_STATUS.PAID]: '已支付',
    [ORDER_STATUS.RECHARGING]: '充值中',
    [ORDER_STATUS.COMPLETED]: '已完成',
    [ORDER_STATUS.REFUND_REQUESTED]: '申请中',
    [ORDER_STATUS.REFUNDING]: '退款中',
    [ORDER_STATUS.PARTIALLY_REFUNDED]: '已部分退款',
    [ORDER_STATUS.REFUNDED]: '已退款',
    [ORDER_STATUS.REFUND_FAILED]: '退款失败',
    [ORDER_STATUS.EXPIRED]: '已超时',
    [ORDER_STATUS.CANCELLED]: '已取消',
    [ORDER_STATUS.FAILED]: '失败',
  },
  en: {
    [ORDER_STATUS.PENDING]: 'Pending',
    [ORDER_STATUS.PAID]: 'Paid',
    [ORDER_STATUS.RECHARGING]: 'Recharging',
    [ORDER_STATUS.COMPLETED]: 'Completed',
    [ORDER_STATUS.REFUND_REQUESTED]: 'Requested',
    [ORDER_STATUS.REFUNDING]: 'Refunding',
    [ORDER_STATUS.PARTIALLY_REFUNDED]: 'Partially refunded',
    [ORDER_STATUS.REFUNDED]: 'Refunded',
    [ORDER_STATUS.REFUND_FAILED]: 'Refund failed',
    [ORDER_STATUS.EXPIRED]: 'Expired',
    [ORDER_STATUS.CANCELLED]: 'Cancelled',
    [ORDER_STATUS.FAILED]: 'Failed',
  },
};

const FILTER_OPTIONS_MAP: Record<Locale, { key: OrderStatusFilter; label: string }[]> = {
  zh: [
    { key: 'ALL', label: '全部' },
    { key: 'PENDING', label: '待支付' },
    { key: 'COMPLETED', label: '已完成' },
    { key: 'REFUND_REQUESTED', label: '申请中' },
    { key: 'REFUNDING', label: '退款中' },
    { key: 'PARTIALLY_REFUNDED', label: '已部分退款' },
    { key: 'REFUNDED', label: '已退款' },
    { key: 'REFUND_FAILED', label: '退款失败' },
    { key: 'CANCELLED', label: '已取消' },
    { key: 'EXPIRED', label: '已超时' },
  ],
  en: [
    { key: 'ALL', label: 'All' },
    { key: 'PENDING', label: 'Pending' },
    { key: 'COMPLETED', label: 'Completed' },
    { key: 'REFUND_REQUESTED', label: 'Requested' },
    { key: 'REFUNDING', label: 'Refunding' },
    { key: 'PARTIALLY_REFUNDED', label: 'Partially refunded' },
    { key: 'REFUNDED', label: 'Refunded' },
    { key: 'REFUND_FAILED', label: 'Refund failed' },
    { key: 'CANCELLED', label: 'Cancelled' },
    { key: 'EXPIRED', label: 'Expired' },
  ],
};

export function getFilterOptions(locale: Locale = 'zh'): { key: OrderStatusFilter; label: string }[] {
  return FILTER_OPTIONS_MAP[locale];
}

export function detectDeviceIsMobile(): boolean {
  if (typeof window === 'undefined') return false;

  const uad = (navigator as Navigator & { userAgentData?: { mobile: boolean } }).userAgentData;
  if (uad !== undefined) return uad.mobile;

  const ua = navigator.userAgent || '';
  const mobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Windows Phone|Mobile/i.test(ua);
  if (mobileUA) return true;

  const smallPhysicalScreen = Math.min(window.screen.width, window.screen.height) <= 768;
  const touchCapable = navigator.maxTouchPoints > 1;
  return touchCapable && smallPhysicalScreen;
}

export function formatStatus(status: string, locale: Locale = 'zh'): string {
  return STATUS_TEXT_MAP[locale][status] || status;
}

export function formatCreatedAt(value: string, locale: Locale = 'zh'): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(locale === 'en' ? 'en-US' : 'zh-CN');
}

export interface PaymentTypeMeta {
  label: string;
  sublabel?: string;
  provider: string;
  color: string;
  selectedBorder: string;
  selectedBg: string;
  selectedBgDark: string;
  iconBg: string;
  iconSrc?: string;
  chartBar: { light: string; dark: string };
  buttonClass: string;
}

export const PAYMENT_TYPE_META: Record<string, PaymentTypeMeta> = {
  [PAYMENT_TYPE.ALIPAY]: {
    label: '支付宝',
    provider: '易支付',
    color: '#00AEEF',
    selectedBorder: 'border-cyan-400',
    selectedBg: 'bg-cyan-50',
    selectedBgDark: 'bg-cyan-950',
    iconBg: 'bg-[#00AEEF]',
    iconSrc: '/icons/alipay.svg',
    chartBar: { light: 'bg-cyan-500', dark: 'bg-cyan-400' },
    buttonClass: 'bg-[#00AEEF] hover:bg-[#009dd6] active:bg-[#008cbe]',
  },
  [PAYMENT_TYPE.ALIPAY_DIRECT]: {
    label: '支付宝',
    provider: '支付宝',
    color: '#1677FF',
    selectedBorder: 'border-blue-500',
    selectedBg: 'bg-blue-50',
    selectedBgDark: 'bg-blue-950',
    iconBg: 'bg-[#1677FF]',
    iconSrc: '/icons/alipay.svg',
    chartBar: { light: 'bg-blue-500', dark: 'bg-blue-400' },
    buttonClass: 'bg-[#1677FF] hover:bg-[#0958d9] active:bg-[#003eb3]',
  },
  [PAYMENT_TYPE.WXPAY]: {
    label: '微信支付',
    provider: '易支付',
    color: '#2BB741',
    selectedBorder: 'border-green-500',
    selectedBg: 'bg-green-50',
    selectedBgDark: 'bg-green-950',
    iconBg: 'bg-[#2BB741]',
    iconSrc: '/icons/wxpay.svg',
    chartBar: { light: 'bg-green-500', dark: 'bg-green-400' },
    buttonClass: 'bg-[#2BB741] hover:bg-[#24a038] active:bg-[#1d8a2f]',
  },
  [PAYMENT_TYPE.WXPAY_DIRECT]: {
    label: '微信支付',
    provider: '微信支付',
    color: '#07C160',
    selectedBorder: 'border-green-600',
    selectedBg: 'bg-green-50',
    selectedBgDark: 'bg-green-950',
    iconBg: 'bg-[#07C160]',
    iconSrc: '/icons/wxpay.svg',
    chartBar: { light: 'bg-emerald-500', dark: 'bg-emerald-400' },
    buttonClass: 'bg-[#07C160] hover:bg-[#06ad56] active:bg-[#05994c]',
  },
  [PAYMENT_TYPE.STRIPE]: {
    label: 'Stripe',
    provider: 'Stripe',
    color: '#635bff',
    selectedBorder: 'border-[#635bff]',
    selectedBg: 'bg-[#635bff]/10',
    selectedBgDark: 'bg-[#635bff]/20',
    iconBg: 'bg-[#635bff]',
    chartBar: { light: 'bg-purple-500', dark: 'bg-purple-400' },
    buttonClass: 'bg-[#635bff] hover:bg-[#5249d9] active:bg-[#4840c4]',
  },
};

const PAYMENT_TEXT_MAP: Record<Locale, Record<string, { label: string; provider: string; sublabel?: string }>> = {
  zh: {
    [PAYMENT_TYPE.ALIPAY]: { label: '支付宝', provider: '易支付' },
    [PAYMENT_TYPE.ALIPAY_DIRECT]: { label: '支付宝', provider: '支付宝' },
    [PAYMENT_TYPE.WXPAY]: { label: '微信支付', provider: '易支付' },
    [PAYMENT_TYPE.WXPAY_DIRECT]: { label: '微信支付', provider: '微信支付' },
    [PAYMENT_TYPE.STRIPE]: { label: 'Stripe', provider: 'Stripe' },
  },
  en: {
    [PAYMENT_TYPE.ALIPAY]: { label: 'Alipay', provider: 'EasyPay' },
    [PAYMENT_TYPE.ALIPAY_DIRECT]: { label: 'Alipay', provider: 'Alipay' },
    [PAYMENT_TYPE.WXPAY]: { label: 'WeChat Pay', provider: 'EasyPay' },
    [PAYMENT_TYPE.WXPAY_DIRECT]: { label: 'WeChat Pay', provider: 'WeChat Pay' },
    [PAYMENT_TYPE.STRIPE]: { label: 'Stripe', provider: 'Stripe' },
  },
};

function getPaymentText(type: string, locale: Locale = 'zh'): { label: string; provider: string; sublabel?: string } {
  const meta = PAYMENT_TYPE_META[type];
  if (!meta) return { label: type, provider: '' };
  const baseText = PAYMENT_TEXT_MAP[locale][type] || { label: meta.label, provider: meta.provider };
  return {
    ...baseText,
    sublabel: meta.sublabel,
  };
}

export function getPaymentTypeLabel(type: string, locale: Locale = 'zh'): string {
  const meta = getPaymentText(type, locale);
  if (!meta) return type;
  if (meta.sublabel) {
    return locale === 'en' ? `${meta.label} (${meta.sublabel})` : `${meta.label}（${meta.sublabel}）`;
  }
  const hasDuplicate = Object.keys(PAYMENT_TYPE_META).some(
    (key) => key !== type && getPaymentText(key, locale).label === meta.label,
  );
  if (!hasDuplicate || !meta.provider) return meta.label;
  return locale === 'en' ? `${meta.label} (${meta.provider})` : `${meta.label}（${meta.provider}）`;
}

export function getPaymentDisplayInfo(
  type: string,
  locale: Locale = 'zh',
): { channel: string; provider: string; sublabel?: string } {
  const meta = getPaymentText(type, locale);
  return { channel: meta.label, provider: meta.provider, sublabel: meta.sublabel };
}

export function getPaymentIconType(type: string): string {
  if (type.startsWith(PAYMENT_PREFIX.ALIPAY)) return PAYMENT_PREFIX.ALIPAY;
  if (type.startsWith(PAYMENT_PREFIX.WXPAY)) return PAYMENT_PREFIX.WXPAY;
  if (type.startsWith(PAYMENT_PREFIX.STRIPE)) return PAYMENT_PREFIX.STRIPE;
  return type;
}

export function getPaymentMeta(type: string): PaymentTypeMeta {
  const base = getPaymentIconType(type);
  return PAYMENT_TYPE_META[type] || PAYMENT_TYPE_META[base] || PAYMENT_TYPE_META[PAYMENT_TYPE.ALIPAY];
}

export function getPaymentIconSrc(type: string): string {
  return getPaymentMeta(type).iconSrc || '';
}

export function getPaymentChannelLabel(type: string, locale: Locale = 'zh'): string {
  return getPaymentDisplayInfo(type, locale).channel;
}

export function isStripeType(type: string | undefined | null): boolean {
  return !!type?.startsWith(PAYMENT_PREFIX.STRIPE);
}

export function isWxpayType(type: string | undefined | null): boolean {
  return !!type?.startsWith(PAYMENT_PREFIX.WXPAY);
}

export function isAlipayType(type: string | undefined | null): boolean {
  return !!type?.startsWith(PAYMENT_PREFIX.ALIPAY);
}

export function isRedirectPayment(type: string | undefined | null): boolean {
  return !!type && REDIRECT_PAYMENT_TYPES.has(type);
}

export function applySublabelOverrides(overrides: Record<string, string>): void {
  for (const [type, sublabel] of Object.entries(overrides)) {
    if (PAYMENT_TYPE_META[type]) {
      PAYMENT_TYPE_META[type] = { ...PAYMENT_TYPE_META[type], sublabel };
    }
  }
}

export function getStatusBadgeClass(status: string, isDark: boolean): string {
  if (status === ORDER_STATUS.COMPLETED || status === ORDER_STATUS.PAID) {
    return isDark ? 'bg-emerald-500/20 text-emerald-200' : 'bg-emerald-100 text-emerald-700';
  }
  if (status === ORDER_STATUS.REFUND_REQUESTED) {
    return isDark ? 'bg-violet-500/20 text-violet-200' : 'bg-violet-100 text-violet-700';
  }
  if (status === ORDER_STATUS.REFUNDING) {
    return isDark ? 'bg-orange-500/20 text-orange-200' : 'bg-orange-100 text-orange-700';
  }
  if (status === ORDER_STATUS.PARTIALLY_REFUNDED) {
    return isDark ? 'bg-fuchsia-500/20 text-fuchsia-200' : 'bg-fuchsia-100 text-fuchsia-700';
  }
  if (status === ORDER_STATUS.REFUNDED) {
    return isDark ? 'bg-purple-500/20 text-purple-200' : 'bg-purple-100 text-purple-700';
  }
  if (status === ORDER_STATUS.REFUND_FAILED) {
    return isDark ? 'bg-red-500/20 text-red-200' : 'bg-red-100 text-red-700';
  }
  if (status === ORDER_STATUS.PENDING) {
    return isDark ? 'bg-blue-500/20 text-blue-200' : 'bg-blue-100 text-blue-700';
  }
  const GREY_STATUSES = new Set<string>([ORDER_STATUS.CANCELLED, ORDER_STATUS.EXPIRED, ORDER_STATUS.FAILED]);
  if (GREY_STATUSES.has(status)) {
    return isDark ? 'bg-slate-600 text-slate-200' : 'bg-slate-100 text-slate-700';
  }
  return isDark ? 'bg-slate-700 text-slate-200' : 'bg-slate-100 text-slate-700';
}
