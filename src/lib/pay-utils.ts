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
  PENDING: '待支付',
  PAID: '已支付',
  RECHARGING: '充值中',
  COMPLETED: '已完成',
  EXPIRED: '已超时',
  CANCELLED: '已取消',
  FAILED: '失败',
  REFUNDING: '退款中',
  REFUNDED: '已退款',
  REFUND_FAILED: '退款失败',
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
  label: string;
  sublabel?: string;
  color: string;
  selectedBorder: string;
  selectedBg: string;
  iconBg: string;
}

export const PAYMENT_TYPE_META: Record<string, PaymentTypeMeta> = {
  alipay: {
    label: '支付宝',
    sublabel: '易支付',
    color: '#00AEEF',
    selectedBorder: 'border-cyan-400',
    selectedBg: 'bg-cyan-50',
    iconBg: 'bg-[#00AEEF]',
  },
  alipay_direct: {
    label: '支付宝',
    sublabel: '官方直连',
    color: '#1677FF',
    selectedBorder: 'border-blue-500',
    selectedBg: 'bg-blue-50',
    iconBg: 'bg-[#1677FF]',
  },
  wxpay: {
    label: '微信支付',
    sublabel: '易支付',
    color: '#2BB741',
    selectedBorder: 'border-green-500',
    selectedBg: 'bg-green-50',
    iconBg: 'bg-[#2BB741]',
  },
  wxpay_direct: {
    label: '微信支付',
    sublabel: '官方直连',
    color: '#07C160',
    selectedBorder: 'border-green-600',
    selectedBg: 'bg-green-50',
    iconBg: 'bg-[#07C160]',
  },
  stripe: {
    label: 'Stripe',
    sublabel: '信用卡 / 借记卡',
    color: '#635bff',
    selectedBorder: 'border-[#635bff]',
    selectedBg: 'bg-[#635bff]/10',
    iconBg: 'bg-[#635bff]',
  },
};

/** 获取支付方式的显示名称（如 '支付宝（官方直连）'） */
export function getPaymentTypeLabel(type: string): string {
  const meta = PAYMENT_TYPE_META[type];
  if (!meta) return type;
  return meta.sublabel ? `${meta.label}（${meta.sublabel}）` : meta.label;
}

/** 获取基础支付方式图标类型（alipay_direct → alipay） */
export function getPaymentIconType(type: string): string {
  if (type.startsWith('alipay')) return 'alipay';
  if (type.startsWith('wxpay')) return 'wxpay';
  if (type.startsWith('stripe')) return 'stripe';
  return type;
}

export function getStatusBadgeClass(status: string, isDark: boolean): string {
  if (['COMPLETED', 'PAID'].includes(status)) {
    return isDark ? 'bg-emerald-500/20 text-emerald-200' : 'bg-emerald-100 text-emerald-700';
  }
  if (status === 'PENDING') {
    return isDark ? 'bg-blue-500/20 text-blue-200' : 'bg-blue-100 text-blue-700';
  }
  if (['CANCELLED', 'EXPIRED', 'FAILED'].includes(status)) {
    return isDark ? 'bg-slate-600 text-slate-200' : 'bg-slate-100 text-slate-700';
  }
  return isDark ? 'bg-slate-700 text-slate-200' : 'bg-slate-100 text-slate-700';
}
