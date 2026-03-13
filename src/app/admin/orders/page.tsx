'use client';

import { useSearchParams } from 'next/navigation';
import { useState, useEffect, useCallback, Suspense } from 'react';
import OrderTable from '@/components/admin/OrderTable';
import OrderDetail from '@/components/admin/OrderDetail';
import PaginationBar from '@/components/PaginationBar';
import PayPageLayout from '@/components/PayPageLayout';
import { resolveLocale, type Locale } from '@/lib/locale';

interface AdminOrder {
  id: string;
  userId: number;
  userName: string | null;
  userEmail: string | null;
  userNotes: string | null;
  amount: number;
  status: string;
  paymentType: string;
  createdAt: string;
  paidAt: string | null;
  completedAt: string | null;
  failedReason: string | null;
  expiresAt: string;
  srcHost: string | null;
}

interface AdminOrderDetail extends AdminOrder {
  rechargeCode: string;
  paymentTradeNo: string | null;
  refundAmount: number | null;
  refundReason: string | null;
  refundAt: string | null;
  forceRefund: boolean;
  failedAt: string | null;
  updatedAt: string;
  clientIp: string | null;
  srcHost: string | null;
  srcUrl: string | null;
  paymentSuccess?: boolean;
  rechargeSuccess?: boolean;
  rechargeStatus?: string;
  auditLogs: { id: string; action: string; detail: string | null; operator: string | null; createdAt: string }[];
}

function AdminContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const theme = searchParams.get('theme') === 'dark' ? 'dark' : 'light';
  const uiMode = searchParams.get('ui_mode') || 'standalone';
  const locale = resolveLocale(searchParams.get('lang'));
  const isDark = theme === 'dark';
  const isEmbedded = uiMode === 'embedded';

  const text =
    locale === 'en'
      ? {
          missingToken: 'Missing admin token',
          missingTokenHint: 'Please access the admin page from the Sub2API platform.',
          invalidToken: 'Invalid admin token',
          requestFailed: 'Request failed',
          loadOrdersFailed: 'Failed to load orders',
          retryConfirm: 'Retry recharge for this order?',
          retryFailed: 'Retry failed',
          retryRequestFailed: 'Retry request failed',
          cancelConfirm: 'Cancel this order?',
          cancelFailed: 'Cancel failed',
          cancelRequestFailed: 'Cancel request failed',
          loadDetailFailed: 'Failed to load order details',
          title: 'Order Management',
          subtitle: 'View and manage all recharge orders',
          dashboard: 'Dashboard',
          refresh: 'Refresh',
          loading: 'Loading...',
          statuses: {
            '': 'All',
            PENDING: 'Pending',
            PAID: 'Paid',
            RECHARGING: 'Recharging',
            COMPLETED: 'Completed',
            EXPIRED: 'Expired',
            CANCELLED: 'Cancelled',
            FAILED: 'Recharge failed',
            REFUNDED: 'Refunded',
          },
        }
      : {
          missingToken: '缺少管理员凭证',
          missingTokenHint: '请从 Sub2API 平台正确访问管理页面',
          invalidToken: '管理员凭证无效',
          requestFailed: '请求失败',
          loadOrdersFailed: '加载订单列表失败',
          retryConfirm: '确认重试充值？',
          retryFailed: '重试失败',
          retryRequestFailed: '重试请求失败',
          cancelConfirm: '确认取消该订单？',
          cancelFailed: '取消失败',
          cancelRequestFailed: '取消请求失败',
          loadDetailFailed: '加载订单详情失败',
          title: '订单管理',
          subtitle: '查看和管理所有充值订单',
          dashboard: '数据概览',
          refresh: '刷新',
          loading: '加载中...',
          statuses: {
            '': '全部',
            PENDING: '待支付',
            PAID: '已支付',
            RECHARGING: '充值中',
            COMPLETED: '已完成',
            EXPIRED: '已超时',
            CANCELLED: '已取消',
            FAILED: '充值失败',
            REFUNDED: '已退款',
          },
        };

  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [detailOrder, setDetailOrder] = useState<AdminOrderDetail | null>(null);

  const fetchOrders = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ token, page: String(page), page_size: String(pageSize) });
      if (statusFilter) params.set('status', statusFilter);

      const res = await fetch(`/api/admin/orders?${params}`);
      if (!res.ok) {
        if (res.status === 401) {
          setError(text.invalidToken);
          return;
        }
        throw new Error(text.requestFailed);
      }

      const data = await res.json();
      setOrders(data.orders);
      setTotal(data.total);
      setTotalPages(data.total_pages);
    } catch {
      setError(text.loadOrdersFailed);
    } finally {
      setLoading(false);
    }
  }, [token, page, pageSize, statusFilter]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  if (!token) {
    return (
      <div className={`flex min-h-screen items-center justify-center p-4 ${isDark ? 'bg-slate-950' : 'bg-slate-50'}`}>
        <div className="text-center text-red-500">
          <p className="text-lg font-medium">{text.missingToken}</p>
          <p className="mt-2 text-sm text-gray-500">{text.missingTokenHint}</p>
        </div>
      </div>
    );
  }

  const handleRetry = async (orderId: string) => {
    if (!confirm(text.retryConfirm)) return;
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/retry?token=${token}`, {
        method: 'POST',
      });
      if (res.ok) {
        fetchOrders();
      } else {
        const data = await res.json();
        setError(data.error || text.retryFailed);
      }
    } catch {
      setError(text.retryRequestFailed);
    }
  };

  const handleCancel = async (orderId: string) => {
    if (!confirm(text.cancelConfirm)) return;
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/cancel?token=${token}`, {
        method: 'POST',
      });
      if (res.ok) {
        fetchOrders();
      } else {
        const data = await res.json();
        setError(data.error || text.cancelFailed);
      }
    } catch {
      setError(text.cancelRequestFailed);
    }
  };

  const handleViewDetail = async (orderId: string) => {
    try {
      const res = await fetch(`/api/admin/orders/${orderId}?token=${token}`);
      if (res.ok) {
        const data = await res.json();
        setDetailOrder(data);
      }
    } catch {
      setError(text.loadDetailFailed);
    }
  };

  const statuses = ['', 'PENDING', 'PAID', 'RECHARGING', 'COMPLETED', 'EXPIRED', 'CANCELLED', 'FAILED', 'REFUNDED'];
  const statusLabels: Record<string, string> = text.statuses;

  const navParams = new URLSearchParams();
  if (token) navParams.set('token', token);
  if (locale === 'en') navParams.set('lang', 'en');
  if (isDark) navParams.set('theme', 'dark');
  if (isEmbedded) navParams.set('ui_mode', 'embedded');

  const btnBase = [
    'inline-flex items-center rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
    isDark
      ? 'border-slate-600 text-slate-200 hover:bg-slate-800'
      : 'border-slate-300 text-slate-700 hover:bg-slate-100',
  ].join(' ');

  return (
    <PayPageLayout
      isDark={isDark}
      isEmbedded={isEmbedded}
      maxWidth="full"
      title={text.title}
      subtitle={text.subtitle}
      locale={locale}
      actions={
        <>
          <a href={`/admin/dashboard?${navParams}`} className={btnBase}>
            {text.dashboard}
          </a>
          <button type="button" onClick={fetchOrders} className={btnBase}>
            {text.refresh}
          </button>
        </>
      }
    >
      {error && (
        <div
          className={`mb-4 rounded-lg border p-3 text-sm ${isDark ? 'border-red-800 bg-red-950/50 text-red-400' : 'border-red-200 bg-red-50 text-red-600'}`}
        >
          {error}
          <button onClick={() => setError('')} className="ml-2 opacity-60 hover:opacity-100">
            ✕
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="mb-4 flex flex-wrap gap-2">
        {statuses.map((s) => (
          <button
            key={s}
            onClick={() => {
              setStatusFilter(s);
              setPage(1);
            }}
            className={[
              'rounded-full px-3 py-1 text-sm transition-colors',
              statusFilter === s
                ? isDark
                  ? 'bg-indigo-500/30 text-indigo-200 ring-1 ring-indigo-400/40'
                  : 'bg-blue-600 text-white'
                : isDark
                  ? 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
            ].join(' ')}
          >
            {statusLabels[s]}
          </button>
        ))}
      </div>

      {/* Table */}
      <div
        className={[
          'rounded-xl border',
          isDark ? 'border-slate-700 bg-slate-800/70' : 'border-slate-200 bg-white shadow-sm',
        ].join(' ')}
      >
        {loading ? (
          <div className={`py-12 text-center ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>{text.loading}</div>
        ) : (
          <OrderTable
            orders={orders}
            onRetry={handleRetry}
            onCancel={handleCancel}
            onViewDetail={handleViewDetail}
            dark={isDark}
            locale={locale}
          />
        )}
      </div>

      <PaginationBar
        page={page}
        totalPages={totalPages}
        total={total}
        pageSize={pageSize}
        loading={loading}
        onPageChange={(p) => setPage(p)}
        onPageSizeChange={(s) => {
          setPageSize(s);
          setPage(1);
        }}
        locale={locale}
        isDark={isDark}
      />

      {/* Order Detail */}
      {detailOrder && (
        <OrderDetail order={detailOrder} onClose={() => setDetailOrder(null)} dark={isDark} locale={locale} />
      )}
    </PayPageLayout>
  );
}

function AdminPageFallback() {
  const searchParams = useSearchParams();
  const locale = resolveLocale(searchParams.get('lang'));

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-gray-500">{locale === 'en' ? 'Loading...' : '加载中...'}</div>
    </div>
  );
}

export default function AdminPage() {
  return (
    <Suspense fallback={<AdminPageFallback />}>
      <AdminContent />
    </Suspense>
  );
}
