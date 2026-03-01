export interface UserInfo {
  id?: number;
  username: string;
  balance: number;
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

  const ua = navigator.userAgent || '';
  const mobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Windows Phone|Mobile/i.test(ua);
  const smallPhysicalScreen = Math.min(window.screen.width, window.screen.height) <= 768;
  const touchCapable = navigator.maxTouchPoints > 1;

  return mobileUA || (touchCapable && smallPhysicalScreen);
}

export function formatStatus(status: string): string {
  return STATUS_TEXT_MAP[status] || status;
}

export function formatCreatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
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
