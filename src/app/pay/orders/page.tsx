'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import PayPageLayout from '@/components/PayPageLayout';
import OrderFilterBar from '@/components/OrderFilterBar';
import OrderSummaryCards from '@/components/OrderSummaryCards';
import OrderTable from '@/components/OrderTable';
import PaginationBar from '@/components/PaginationBar';
import { detectDeviceIsMobile, type UserInfo, type MyOrder, type OrderStatusFilter } from '@/lib/pay-utils';

const PAGE_SIZE_OPTIONS = [20, 50, 100];

interface Summary {
  total: number;
  pending: number;
  completed: number;
  failed: number;
}

function OrdersContent() {
  const searchParams = useSearchParams();
  const userId = Number(searchParams.get('user_id'));
  const token = (searchParams.get('token') || '').trim();
  const theme = searchParams.get('theme') === 'dark' ? 'dark' : 'light';
  const uiMode = searchParams.get('ui_mode') || 'standalone';
  const isDark = theme === 'dark';

  const [isIframeContext, setIsIframeContext] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [orders, setOrders] = useState<MyOrder[]>([]);
  const [summary, setSummary] = useState<Summary>({ total: 0, pending: 0, completed: 0, failed: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeFilter, setActiveFilter] = useState<OrderStatusFilter>('ALL');
  const [resolvedUserId, setResolvedUserId] = useState<number | null>(null);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalPages, setTotalPages] = useState(1);

  const isEmbedded = uiMode === 'embedded' && isIframeContext;
  const hasToken = token.length > 0;
  const effectiveUserId = resolvedUserId || userId;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setIsIframeContext(window.self !== window.top);
    setIsMobile(detectDeviceIsMobile());
  }, []);

  useEffect(() => {
    if (!isMobile || isEmbedded || typeof window === 'undefined') return;
    const params = new URLSearchParams();
    if (userId && !Number.isNaN(userId)) params.set('user_id', String(userId));
    if (token) params.set('token', token);
    params.set('theme', theme);
    params.set('ui_mode', uiMode);
    params.set('tab', 'orders');
    window.location.replace(`/pay?${params.toString()}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile, isEmbedded]);

  const loadOrders = async (targetPage = page, targetPageSize = pageSize) => {
    setLoading(true);
    setError('');
    try {
      if (!userId || Number.isNaN(userId) || userId <= 0) {
        setError('无效的用户 ID');
        setOrders([]);
        return;
      }
      if (!hasToken) {
        setUserInfo({ id: userId, username: `用户 #${userId}` });
        setOrders([]);
        setError('当前链接未携带登录 token，无法查询"我的订单"。');
        return;
      }

      const params = new URLSearchParams({
        token,
        page: String(targetPage),
        page_size: String(targetPageSize),
      });
      const res = await fetch(`/api/orders/my?${params}`);
      if (!res.ok) {
        setError(res.status === 401 ? '登录态已失效，请从 Sub2API 重新进入支付页。' : '订单加载失败，请稍后重试。');
        setOrders([]);
        return;
      }

      const data = await res.json();
      const meUser = data.user || {};
      const meId = Number(meUser.id);
      if (Number.isInteger(meId) && meId > 0) setResolvedUserId(meId);

      setUserInfo({
        id: Number.isInteger(meId) && meId > 0 ? meId : userId,
        username:
          (typeof meUser.displayName === 'string' && meUser.displayName.trim()) ||
          (typeof meUser.username === 'string' && meUser.username.trim()) ||
          `用户 #${userId}`,
        balance: typeof meUser.balance === 'number' ? meUser.balance : 0,
      });

      setOrders(Array.isArray(data.orders) ? data.orders : []);
      setSummary(data.summary ?? { total: 0, pending: 0, completed: 0, failed: 0 });
      setPage(data.page ?? targetPage);
      setTotalPages(data.total_pages ?? 1);
    } catch {
      setOrders([]);
      setError('网络错误，请稍后重试。');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isMobile && !isEmbedded) return;
    loadOrders(1, pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, token, isMobile, isEmbedded]);

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    loadOrders(newPage, pageSize);
  };

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setPage(1);
    loadOrders(1, newSize);
  };

  const filteredOrders =
    activeFilter === 'ALL' ? orders : orders.filter((o) => o.status === activeFilter);

  const btnClass = [
    'inline-flex items-center rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
    isDark ? 'border-slate-600 text-slate-200 hover:bg-slate-800' : 'border-slate-300 text-slate-700 hover:bg-slate-100',
  ].join(' ');

  if (isMobile) {
    return (
      <div className={`flex min-h-screen items-center justify-center p-4 ${isDark ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'}`}>
        正在切换到移动端订单 Tab...
      </div>
    );
  }

  if (!effectiveUserId || Number.isNaN(effectiveUserId) || effectiveUserId <= 0) {
    return (
      <div className={`flex min-h-screen items-center justify-center p-4 ${isDark ? 'bg-slate-950' : 'bg-slate-50'}`}>
        <div className="text-center text-red-500">
          <p className="text-lg font-medium">无效的用户 ID</p>
          <p className="mt-2 text-sm text-gray-500">请从 Sub2API 平台正确访问订单页面</p>
        </div>
      </div>
    );
  }

  const buildScopedUrl = (path: string) => {
    const params = new URLSearchParams();
    if (effectiveUserId) params.set('user_id', String(effectiveUserId));
    if (token) params.set('token', token);
    params.set('theme', theme);
    params.set('ui_mode', uiMode);
    return `${path}?${params.toString()}`;
  };

  return (
    <PayPageLayout
      isDark={isDark}
      isEmbedded={isEmbedded}
      title="我的订单"
      subtitle={userInfo?.username || `用户 #${effectiveUserId}`}
      actions={
        <>
          <button type="button" onClick={() => loadOrders(page, pageSize)} className={btnClass}>刷新</button>
          <a href={buildScopedUrl('/pay')} className={btnClass}>返回充值</a>
        </>
      }
    >
      <OrderSummaryCards isDark={isDark} summary={summary} />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <OrderFilterBar isDark={isDark} activeFilter={activeFilter} onChange={setActiveFilter} />
      </div>

      <OrderTable isDark={isDark} loading={loading} error={error} orders={filteredOrders} />

      <PaginationBar
        page={page}
        totalPages={totalPages}
        total={summary.total}
        pageSize={pageSize}
        pageSizeOptions={PAGE_SIZE_OPTIONS}
        isDark={isDark}
        loading={loading}
        onPageChange={handlePageChange}
        onPageSizeChange={handlePageSizeChange}
      />
    </PayPageLayout>
  );
}

export default function OrdersPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center"><div className="text-gray-500">加载中...</div></div>}>
      <OrdersContent />
    </Suspense>
  );
}
