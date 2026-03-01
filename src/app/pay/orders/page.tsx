'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import PayPageLayout from '@/components/PayPageLayout';
import OrderFilterBar from '@/components/OrderFilterBar';
import OrderSummaryCards from '@/components/OrderSummaryCards';
import OrderTable from '@/components/OrderTable';
import { detectDeviceIsMobile, type UserInfo, type MyOrder, type OrderStatusFilter } from '@/lib/pay-utils';

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeFilter, setActiveFilter] = useState<OrderStatusFilter>('ALL');
  const [resolvedUserId, setResolvedUserId] = useState<number | null>(null);

  const isEmbedded = uiMode === 'embedded' && isIframeContext;
  const hasToken = token.length > 0;
  const effectiveUserId = resolvedUserId || userId;

  useEffect(() => {
    if (typeof window === 'undefined') return;

    setIsIframeContext(window.self !== window.top);
    setIsMobile(detectDeviceIsMobile());
  }, []);

  const buildMobilePayOrdersTabUrl = () => {
    const params = new URLSearchParams();
    if (userId && !Number.isNaN(userId)) params.set('user_id', String(userId));
    if (token) params.set('token', token);
    params.set('theme', theme);
    params.set('ui_mode', uiMode);
    params.set('tab', 'orders');
    return `/pay?${params.toString()}`;
  };

  useEffect(() => {
    if (!isMobile || isEmbedded || typeof window === 'undefined') return;
    window.location.replace(buildMobilePayOrdersTabUrl());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile, isEmbedded, userId, token, theme, uiMode]);

  const loadOrders = async () => {
    setLoading(true);
    setError('');

    try {
      if (!userId || Number.isNaN(userId) || userId <= 0) {
        setError('无效的用户 ID');
        setOrders([]);
        return;
      }

      if (!hasToken) {
        const res = await fetch(`/api/users/${userId}`);
        if (res.ok) {
          const data = await res.json();
          setUserInfo({
            id: userId,
            username:
              (typeof data.displayName === 'string' && data.displayName.trim()) ||
              (typeof data.username === 'string' && data.username.trim()) ||
              (typeof data.email === 'string' && data.email.trim()) ||
              `用户 #${userId}`,
            balance: typeof data.balance === 'number' ? data.balance : 0,
          });
        }
        setOrders([]);
        setError('当前链接未携带登录 token，无法查询"我的订单"。');
        return;
      }

      const meRes = await fetch(`/api/orders/my?token=${encodeURIComponent(token)}`);
      if (!meRes.ok) {
        if (meRes.status === 401) {
          setError('登录态已失效，请从 Sub2API 重新进入支付页。');
        } else {
          setError('订单加载失败，请稍后重试。');
        }
        setOrders([]);
        return;
      }

      const meData = await meRes.json();
      const meUser = meData.user || {};
      const meId = Number(meUser.id);
      if (Number.isInteger(meId) && meId > 0) {
        setResolvedUserId(meId);
      }

      setUserInfo({
        id: Number.isInteger(meId) && meId > 0 ? meId : userId,
        username:
          (typeof meUser.displayName === 'string' && meUser.displayName.trim()) ||
          (typeof meUser.username === 'string' && meUser.username.trim()) ||
          `用户 #${userId}`,
        balance: typeof meUser.balance === 'number' ? meUser.balance : 0,
      });

      if (Array.isArray(meData.orders)) {
        setOrders(meData.orders);
      } else {
        setOrders([]);
      }
    } catch {
      setOrders([]);
      setError('网络错误，请稍后重试。');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isMobile && !isEmbedded) return;
    loadOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, token, isMobile, isEmbedded]);

  const filteredOrders = useMemo(() => {
    if (activeFilter === 'ALL') return orders;
    return orders.filter((item) => item.status === activeFilter);
  }, [orders, activeFilter]);

  const summary = useMemo(() => {
    const total = orders.length;
    const pending = orders.filter((item) => item.status === 'PENDING').length;
    const completed = orders.filter((item) => item.status === 'COMPLETED' || item.status === 'PAID').length;
    const failed = orders.filter((item) => ['FAILED', 'CANCELLED', 'EXPIRED'].includes(item.status)).length;
    return { total, pending, completed, failed };
  }, [orders]);

  const buildScopedUrl = (path: string) => {
    const params = new URLSearchParams();
    if (effectiveUserId) params.set('user_id', String(effectiveUserId));
    if (token) params.set('token', token);
    params.set('theme', theme);
    params.set('ui_mode', uiMode);
    return `${path}?${params.toString()}`;
  };

  const payUrl = buildScopedUrl('/pay');

  if (isMobile) {
    return (
      <div
        className={`flex min-h-screen items-center justify-center p-4 ${isDark ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'}`}
      >
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

  return (
    <PayPageLayout
      isDark={isDark}
      isEmbedded={isEmbedded}
      title="我的订单"
      subtitle={userInfo?.username || `用户 #${effectiveUserId}`}
      actions={
        <>
          <button
            type="button"
            onClick={loadOrders}
            className={[
              'rounded-lg border px-3 py-2 text-xs font-medium',
              isDark
                ? 'border-slate-600 text-slate-200 hover:bg-slate-800'
                : 'border-slate-300 text-slate-700 hover:bg-slate-100',
            ].join(' ')}
          >
            刷新
          </button>
          <a
            href={payUrl}
            className={[
              'rounded-lg border px-3 py-2 text-xs font-medium',
              isDark
                ? 'border-slate-600 text-slate-200 hover:bg-slate-800'
                : 'border-slate-300 text-slate-700 hover:bg-slate-100',
            ].join(' ')}
          >
            返回充值
          </a>
        </>
      }
    >
      <OrderSummaryCards isDark={isDark} summary={summary} />

      <div className="mb-4">
        <OrderFilterBar isDark={isDark} activeFilter={activeFilter} onChange={setActiveFilter} />
      </div>

      <OrderTable isDark={isDark} loading={loading} error={error} orders={filteredOrders} />
    </PayPageLayout>
  );
}

export default function OrdersPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <div className="text-gray-500">加载中...</div>
        </div>
      }
    >
      <OrdersContent />
    </Suspense>
  );
}
