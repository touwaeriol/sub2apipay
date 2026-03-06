import {
  ORDER_STATUS,
  PAYMENT_TYPE,
  PAYMENT_PREFIX,
  REDIRECT_PAYMENT_TYPES,
} from './constants';

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
}

export type OrderStatusFilter = 'ALL' | 'PENDING' | 'PAID' | 'COMPLETED' | 'CANCELLED' | 'EXPIRED' | 'FAILED';

export const STATUS_TEXT_MAP: Record<string, string> = {
  [ORDER_STATUS.PENDING]: '待支付',
  [ORDER_STATUS.PAID]: '已支付',
  [ORDER_STATUS.RECHARGING]: '充值中',
  [ORDER_STATUS.COMPLETED]: '已完成',
  [ORDER_STATUS.EXPIRED]: '已超时',
  [ORDER_STATUS.CANCELLED]: '已取消',
  [ORDER_STATUS.FAILED]: '失败',
  [ORDER_STATUS.REFUNDING]: '退款中',
  [ORDER_STATUS.REFUNDED]: '已退款',
  [ORDER_STATUS.REFUND_FAILED]: '退款失败',
};

export const FILTER_OPTIONS: { key: OrderStatusFilter; label: string }[] = [
  { key: 'ALL', label: '全部' },
  { key: 'PENDING', label: '待支付' },
  { key: 'COMPLETED', label: '已完成' },
  { key: 'CANCELLED', label: '已取消' },
  { key: 'EXPIRED', label: '已超时' },
];

export function detectDeviceIsMobile(): boolean {
  if (typeof window === 'undefined') return false;

  // 1. 现代 API（Chromium 系浏览器，最准确）
  const uad = (navigator as Navigator & { userAgentData?: { mobile: boolean } }).userAgentData;
  if (uad !== undefined) return uad.mobile;

  // 2. UA 正则兜底（Safari / Firefox 等）
  const ua = navigator.userAgent || '';
  const mobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Windows Phone|Mobile/i.test(ua);
  if (mobileUA) return true;

  // 3. 触控 + 小屏兜底（新版 iPad UA 伪装成 Mac 的情况）
  const smallPhysicalScreen = Math.min(window.screen.width, window.screen.height) <= 768;
  const touchCapable = navigator.maxTouchPoints > 1;
  return touchCapable && smallPhysicalScreen;
}

export function formatStatus(status: string): string {
  return STATUS_TEXT_MAP[status] || status;
}

export function formatCreatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export interface PaymentTypeMeta {
  /** 支付渠道名（用户看到的：支付宝 / 微信支付 / Stripe） */
  label: string;
  /** 选择器中的辅助说明（易支付 / 官方 / 信用卡 / 借记卡） */
  sublabel?: string;
  /** 提供商名称（易支付 / 支付宝 / 微信支付 / Stripe） */
  provider: string;
  color: string;
  selectedBorder: string;
  selectedBg: string;
  iconBg: string;
  /** 图标路径（Stripe 不使用外部图标） */
  iconSrc?: string;
  /** 图表条形颜色 class */
  chartBar: { light: string; dark: string };
  /** 按钮颜色 class（含 hover/active 状态） */
  buttonClass: string;
}

export const PAYMENT_TYPE_META: Record<string, PaymentTypeMeta> = {
  [PAYMENT_TYPE.ALIPAY]: {
    label: '支付宝',
    sublabel: '易支付',
    provider: '易支付',
    color: '#00AEEF',
    selectedBorder: 'border-cyan-400',
    selectedBg: 'bg-cyan-50',
    iconBg: 'bg-[#00AEEF]',
    iconSrc: '/icons/alipay.svg',
    chartBar: { light: 'bg-cyan-500', dark: 'bg-cyan-400' },
    buttonClass: 'bg-[#00AEEF] hover:bg-[#009dd6] active:bg-[#008cbe]',
  },
  [PAYMENT_TYPE.ALIPAY_DIRECT]: {
    label: '支付宝',
    sublabel: '官方',
    provider: '支付宝',
    color: '#1677FF',
    selectedBorder: 'border-blue-500',
    selectedBg: 'bg-blue-50',
    iconBg: 'bg-[#1677FF]',
    iconSrc: '/icons/alipay.svg',
    chartBar: { light: 'bg-blue-500', dark: 'bg-blue-400' },
    buttonClass: 'bg-[#1677FF] hover:bg-[#0958d9] active:bg-[#003eb3]',
  },
  [PAYMENT_TYPE.WXPAY]: {
    label: '微信支付',
    sublabel: '易支付',
    provider: '易支付',
    color: '#2BB741',
    selectedBorder: 'border-green-500',
    selectedBg: 'bg-green-50',
    iconBg: 'bg-[#2BB741]',
    iconSrc: '/icons/wxpay.svg',
    chartBar: { light: 'bg-green-500', dark: 'bg-green-400' },
    buttonClass: 'bg-[#2BB741] hover:bg-[#24a038] active:bg-[#1d8a2f]',
  },
  [PAYMENT_TYPE.WXPAY_DIRECT]: {
    label: '微信支付',
    sublabel: '官方',
    provider: '微信支付',
    color: '#07C160',
    selectedBorder: 'border-green-600',
    selectedBg: 'bg-green-50',
    iconBg: 'bg-[#07C160]',
    iconSrc: '/icons/wxpay.svg',
    chartBar: { light: 'bg-emerald-500', dark: 'bg-emerald-400' },
    buttonClass: 'bg-[#07C160] hover:bg-[#06ad56] active:bg-[#05994c]',
  },
  [PAYMENT_TYPE.STRIPE]: {
    label: 'Stripe',
    sublabel: '信用卡 / 借记卡',
    provider: 'Stripe',
    color: '#635bff',
    selectedBorder: 'border-[#635bff]',
    selectedBg: 'bg-[#635bff]/10',
    iconBg: 'bg-[#635bff]',
    chartBar: { light: 'bg-purple-500', dark: 'bg-purple-400' },
    buttonClass: 'bg-[#635bff] hover:bg-[#5249d9] active:bg-[#4840c4]',
  },
};

/** 获取支付方式的显示名称（如 '支付宝（官方）'） */
export function getPaymentTypeLabel(type: string): string {
  const meta = PAYMENT_TYPE_META[type];
  if (!meta) return type;
  return meta.sublabel ? `${meta.label}（${meta.sublabel}）` : meta.label;
}

/** 获取支付渠道和提供商的结构化信息 */
export function getPaymentDisplayInfo(type: string): { channel: string; provider: string } {
  const meta = PAYMENT_TYPE_META[type];
  if (!meta) return { channel: type, provider: '' };
  return { channel: meta.label, provider: meta.provider };
}

/** 获取基础支付方式图标类型（alipay_direct → alipay） */
export function getPaymentIconType(type: string): string {
  if (type.startsWith(PAYMENT_PREFIX.ALIPAY)) return PAYMENT_PREFIX.ALIPAY;
  if (type.startsWith(PAYMENT_PREFIX.WXPAY)) return PAYMENT_PREFIX.WXPAY;
  if (type.startsWith(PAYMENT_PREFIX.STRIPE)) return PAYMENT_PREFIX.STRIPE;
  return type;
}

/** 获取支付方式的元数据，带合理的 fallback */
export function getPaymentMeta(type: string): PaymentTypeMeta {
  const base = getPaymentIconType(type);
  return PAYMENT_TYPE_META[type] || PAYMENT_TYPE_META[base] || PAYMENT_TYPE_META[PAYMENT_TYPE.ALIPAY];
}

/** 获取支付方式图标路径 */
export function getPaymentIconSrc(type: string): string {
  return getPaymentMeta(type).iconSrc || '';
}

/** 获取支付方式简短标签（如 '支付宝'、'微信'、'Stripe'） */
export function getPaymentChannelLabel(type: string): string {
  return getPaymentMeta(type).label;
}

/** 支付类型谓词函数 */
export function isStripeType(type: string | undefined | null): boolean {
  return !!type?.startsWith(PAYMENT_PREFIX.STRIPE);
}

export function isWxpayType(type: string | undefined | null): boolean {
  return !!type?.startsWith(PAYMENT_PREFIX.WXPAY);
}

export function isAlipayType(type: string | undefined | null): boolean {
  return !!type?.startsWith(PAYMENT_PREFIX.ALIPAY);
}

/** 该支付方式需要页面跳转（而非二维码） */
export function isRedirectPayment(type: string | undefined | null): boolean {
  return !!type && REDIRECT_PAYMENT_TYPES.has(type);
}

/** 用自定义 sublabel 覆盖默认值 */
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
  if (status === ORDER_STATUS.PENDING) {
    return isDark ? 'bg-blue-500/20 text-blue-200' : 'bg-blue-100 text-blue-700';
  }
  const GREY_STATUSES = new Set<string>([ORDER_STATUS.CANCELLED, ORDER_STATUS.EXPIRED, ORDER_STATUS.FAILED]);
  if (GREY_STATUSES.has(status)) {
    return isDark ? 'bg-slate-600 text-slate-200' : 'bg-slate-100 text-slate-700';
  }
  return isDark ? 'bg-slate-700 text-slate-200' : 'bg-slate-100 text-slate-700';
}
