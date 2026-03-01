'use client';

import { useSearchParams } from 'next/navigation';
import { useState, useEffect, useCallback, Suspense } from 'react';
import OrderTable from '@/components/admin/OrderTable';
import OrderDetail from '@/components/admin/OrderDetail';

interface AdminOrder {
  id: string;
  userId: number;
  userName: string | null;
  userEmail: string | null;
  amount: number;
  status: string;
  paymentType: string;
  createdAt: string;
  paidAt: string | null;
  completedAt: string | null;
  failedReason: string | null;
  expiresAt: string;
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
  paymentSuccess?: boolean;
  rechargeSuccess?: boolean;
  rechargeStatus?: string;
  auditLogs: { id: string; action: string; detail: string | null; operator: string | null; createdAt: string }[];
}

function AdminContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [detailOrder, setDetailOrder] = useState<AdminOrderDetail | null>(null);

  const fetchOrders = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ token, page: String(page), page_size: '20' });
      if (statusFilter) params.set('status', statusFilter);

      const res = await fetch(`/api/admin/orders?${params}`);
      if (!res.ok) {
        if (res.status === 401) {
          setError('管理员凭证无效');
          return;
        }
        throw new Error('请求失败');
      }

      const data = await res.json();
      setOrders(data.orders);
      setTotal(data.total);
      setTotalPages(data.total_pages);
    } catch (e) {
      setError('加载订单列表失败');
    } finally {
      setLoading(false);
    }
  }, [token, page, statusFilter]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-red-500">缺少管理员凭证</div>
      </div>
    );
  }

  const handleRetry = async (orderId: string) => {
    if (!confirm('确认重试充值？')) return;
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/retry?token=${token}`, {
        method: 'POST',
      });
      if (res.ok) {
        fetchOrders();
      } else {
        const data = await res.json();
        setError(data.error || '重试失败');
      }
    } catch {
      setError('重试请求失败');
    }
  };

  const handleCancel = async (orderId: string) => {
    if (!confirm('确认取消该订单？')) return;
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/cancel?token=${token}`, {
        method: 'POST',
      });
      if (res.ok) {
        fetchOrders();
      } else {
        const data = await res.json();
        setError(data.error || '取消失败');
      }
    } catch {
      setError('取消请求失败');
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
      setError('加载订单详情失败');
    }
  };

  const statuses = ['', 'PENDING', 'PAID', 'RECHARGING', 'COMPLETED', 'EXPIRED', 'CANCELLED', 'FAILED', 'REFUNDED'];
  const statusLabels: Record<string, string> = {
    '': '全部',
    PENDING: '待支付',
    PAID: '已支付',
    RECHARGING: '充值中',
    COMPLETED: '已完成',
    EXPIRED: '已超时',
    CANCELLED: '已取消',
    FAILED: '充值失败',
    REFUNDED: '已退款',
  };

  return (
    <div className="mx-auto min-h-screen max-w-6xl p-4">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Sub2ApiPay 订单管理</h1>
        <button
          type="button"
          onClick={fetchOrders}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100"
        >
          刷新
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">
          {error}
          <button onClick={() => setError('')} className="ml-2 text-red-400 hover:text-red-600">
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
            className={`rounded-full px-3 py-1 text-sm transition-colors ${
              statusFilter === s ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {statusLabels[s]}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-xl bg-white shadow-sm">
        {loading ? (
          <div className="py-12 text-center text-gray-500">加载中...</div>
        ) : (
          <OrderTable orders={orders} onRetry={handleRetry} onCancel={handleCancel} onViewDetail={handleViewDetail} />
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-gray-500">
          <span>共 {total} 条记录</span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="rounded border px-3 py-1 disabled:opacity-50"
            >
              上一页
            </button>
            <span className="px-3 py-1">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="rounded border px-3 py-1 disabled:opacity-50"
            >
              下一页
            </button>
          </div>
        </div>
      )}

      {/* Order Detail */}
      {detailOrder && <OrderDetail order={detailOrder} onClose={() => setDetailOrder(null)} />}
    </div>
  );
}

export default function AdminPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <div className="text-gray-500">加载中...</div>
        </div>
      }
    >
      <AdminContent />
    </Suspense>
  );
}
