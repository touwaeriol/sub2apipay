'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import PayPageLayout from '@/components/PayPageLayout';
import OrderFilterBar from '@/components/OrderFilterBar';
import OrderSummaryCards from '@/components/OrderSummaryCards';
import OrderTable from '@/components/OrderTable';
import PaginationBar from '@/components/PaginationBar';
import { applyLocaleToSearchParams, pickLocaleText, resolveLocale } from '@/lib/locale';
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
  const token = (searchParams.get('token') || '').trim();
  const theme = searchParams.get('theme') === 'dark' ? 'dark' : 'light';
  const uiMode = searchParams.get('ui_mode') || 'standalone';
  const srcHost = searchParams.get('src_host') || '';
  const locale = resolveLocale(searchParams.get('lang'));
  const isDark = theme === 'dark';

  const text = {
    missingAuth: pickLocaleText(locale, '缺少认证信息', 'Missing authentication information'),
    visitOrders: pickLocaleText(locale, '请从 Sub2API 平台正确访问订单页面', 'Please open the orders page from Sub2API'),
    sessionExpired: pickLocaleText(locale, '登录态已失效，请从 Sub2API 重新进入支付页。', 'Session expired. Please re-enter from Sub2API.'),
    loadFailed: pickLocaleText(locale, '订单加载失败，请稍后重试。', 'Failed to load orders. Please try again later.'),
    networkError: pickLocaleText(locale, '网络错误，请稍后重试。', 'Network error. Please try again later.'),
    switchingMobileTab: pickLocaleText(locale, '正在切换到移动端订单 Tab...', 'Switching to mobile orders tab...'),
    myOrders: pickLocaleText(locale, '我的订单', 'My Orders'),
    refresh: pickLocaleText(locale, '刷新', 'Refresh'),
    backToPay: pickLocaleText(locale, '返回充值', 'Back to Top Up'),
    loading: pickLocaleText(locale, '加载中...', 'Loading...'),
    userPrefix: pickLocaleText(locale, '用户', 'User'),
    authError: pickLocaleText(locale, '缺少认证信息，请从 Sub2API 平台正确访问订单页面', 'Missing authentication information. Please open the orders page from Sub2API.'),
    refundRequestFailed: pickLocaleText(locale, '退款申请失败，请稍后重试。', 'Refund request failed. Please try again later.'),
  };

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

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setIsIframeContext(window.self !== window.top);
    setIsMobile(detectDeviceIsMobile());
  }, []);

  useEffect(() => {
    if (!isMobile || isEmbedded || typeof window === 'undefined') return;
    const params = new URLSearchParams();
    if (token) params.set('token', token);
    params.set('theme', theme);
    params.set('ui_mode', uiMode);
    params.set('tab', 'orders');
    applyLocaleToSearchParams(params, locale);
    window.location.replace(`/pay?${params.toString()}`);
  }, [isMobile, isEmbedded, token, theme, uiMode, locale]);

  const loadOrders = async (targetPage = page, targetPageSize = pageSize) => {
    setLoading(true);
    setError('');
    try {
      if (!hasToken) {
        setOrders([]);
        setError(text.authError);
        return;
      }

      const params = new URLSearchParams({
        token,
        page: String(targetPage),
        page_size: String(targetPageSize),
      });
      const res = await fetch(`/api/orders/my?${params}`);
      if (!res.ok) {
        setError(res.status === 401 ? text.sessionExpired : text.loadFailed);
        setOrders([]);
        return;
      }

      const data = await res.json();
      const meUser = data.user || {};
      const meId = Number(meUser.id);
      if (Number.isInteger(meId) && meId > 0) setResolvedUserId(meId);

      setUserInfo({
        id: Number.isInteger(meId) && meId > 0 ? meId : undefined,
        username:
          (typeof meUser.displayName === 'string' && meUser.displayName.trim()) ||
          (typeof meUser.username === 'string' && meUser.username.trim()) ||
          `${text.userPrefix} #${meId}`,
        balance: typeof meUser.balance === 'number' ? meUser.balance : 0,
      });

      setOrders(Array.isArray(data.orders) ? data.orders : []);
      setSummary(data.summary ?? { total: 0, pending: 0, completed: 0, failed: 0 });
      setPage(data.page ?? targetPage);
      setTotalPages(data.total_pages ?? 1);
    } catch {
      setOrders([]);
      setError(text.networkError);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isMobile && !isEmbedded) return;
    loadOrders(1, pageSize);
  }, [token, isMobile, isEmbedded]);

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    loadOrders(newPage, pageSize);
  };

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setPage(1);
    loadOrders(1, newSize);
  };

  const handleRefundRequest = async (orderId: string, amount: number, reason: string) => {
    const params = new URLSearchParams({ token });
    applyLocaleToSearchParams(params, locale);
    const res = await fetch(`/api/orders/${orderId}/refund-request?${params.toString()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount, reason }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || text.refundRequestFailed);
    }

    await loadOrders(page, pageSize);
  };

  const filteredOrders = activeFilter === 'ALL' ? orders : orders.filter((o) => o.status === activeFilter);

  const btnClass = [
    'inline-flex items-center rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
    isDark ? 'border-slate-600 text-slate-200 hover:bg-slate-800' : 'border-slate-300 text-slate-700 hover:bg-slate-100',
  ].join(' ');

  if (isMobile) {
    return (
      <div className={`flex min-h-screen items-center justify-center p-4 ${isDark ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'}`}>
        {text.switchingMobileTab}
      </div>
    );
  }

  if (!hasToken && !resolvedUserId) {
    return (
      <div className={`flex min-h-screen items-center justify-center p-4 ${isDark ? 'bg-slate-950' : 'bg-slate-50'}`}>
        <div className="text-center text-red-500">
          <p className="text-lg font-medium">{text.missingAuth}</p>
          <p className={`mt-2 text-sm ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>{text.visitOrders}</p>
        </div>
      </div>
    );
  }

  const buildScopedUrl = (path: string) => {
    const params = new URLSearchParams();
    if (token) params.set('token', token);
    params.set('theme', theme);
    params.set('ui_mode', uiMode);
    applyLocaleToSearchParams(params, locale);
    return `${path}?${params.toString()}`;
  };

  return (
    <PayPageLayout
      isDark={isDark}
      isEmbedded={isEmbedded}
      title={text.myOrders}
      subtitle={userInfo?.username || text.myOrders}
      actions={
        <>
          <button type="button" onClick={() => loadOrders(page, pageSize)} className={btnClass}>
            {text.refresh}
          </button>
          {!srcHost && (
            <a href={buildScopedUrl('/pay')} className={btnClass}>
              {text.backToPay}
            </a>
          )}
        </>
      }
    >
      <OrderSummaryCards isDark={isDark} locale={locale} summary={summary} />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <OrderFilterBar isDark={isDark} locale={locale} activeFilter={activeFilter} onChange={setActiveFilter} />
      </div>

      <OrderTable
        isDark={isDark}
        locale={locale}
        loading={loading}
        error={error}
        orders={filteredOrders}
        userBalance={userInfo?.balance ?? 0}
        onRefundRequest={async (orderId, amount, reason) => {
          try {
            await handleRefundRequest(orderId, amount, reason);
          } catch (err) {
            setError(err instanceof Error ? err.message : text.refundRequestFailed);
          }
        }}
      />

      <PaginationBar
        page={page}
        totalPages={totalPages}
        total={summary.total}
        pageSize={pageSize}
        pageSizeOptions={PAGE_SIZE_OPTIONS}
        locale={locale}
        isDark={isDark}
        loading={loading}
        onPageChange={handlePageChange}
        onPageSizeChange={handlePageSizeChange}
      />
    </PayPageLayout>
  );
}

function OrdersPageFallback() {
  const searchParams = useSearchParams();
  const locale = resolveLocale(searchParams.get('lang'));
  const isDark = searchParams.get('theme') === 'dark';

  return (
    <div className={`flex min-h-screen items-center justify-center ${isDark ? 'bg-slate-950' : 'bg-slate-50'}`}>
      <div className={isDark ? 'text-slate-400' : 'text-gray-500'}>{pickLocaleText(locale, '加载中...', 'Loading...')}</div>
    </div>
  );
}

export default function OrdersPage() {
  return (
    <Suspense fallback={<OrdersPageFallback />}>
      <OrdersContent />
    </Suspense>
  );
}
