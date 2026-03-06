'use client';

import { useSearchParams } from 'next/navigation';
import { useState, useEffect, Suspense } from 'react';
import PaymentForm from '@/components/PaymentForm';
import PaymentQRCode from '@/components/PaymentQRCode';
import OrderStatus from '@/components/OrderStatus';
import PayPageLayout from '@/components/PayPageLayout';
import MobileOrderList from '@/components/MobileOrderList';
import { detectDeviceIsMobile, type UserInfo, type MyOrder } from '@/lib/pay-utils';
import type { MethodLimitInfo } from '@/components/PaymentForm';

interface OrderResult {
  orderId: string;
  amount: number;
  payAmount?: number;
  status: string;
  paymentType: string;
  payUrl?: string | null;
  qrCode?: string | null;
  clientSecret?: string | null;
  expiresAt: string;
}

interface AppConfig {
  enabledPaymentTypes: string[];
  minAmount: number;
  maxAmount: number;
  maxDailyAmount: number;
  methodLimits?: Record<string, MethodLimitInfo>;
  helpImageUrl?: string | null;
  helpText?: string | null;
  stripePublishableKey?: string | null;
}

function PayContent() {
  const searchParams = useSearchParams();
  const userId = Number(searchParams.get('user_id'));
  const token = (searchParams.get('token') || '').trim();
  const theme = searchParams.get('theme') === 'dark' ? 'dark' : 'light';
  const uiMode = searchParams.get('ui_mode') || 'standalone';
  const tab = searchParams.get('tab');
  const srcHost = searchParams.get('src_host') || undefined;
  const srcUrl = searchParams.get('src_url') || undefined;
  const isDark = theme === 'dark';

  const [isIframeContext, setIsIframeContext] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [step, setStep] = useState<'form' | 'paying' | 'result'>('form');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [orderResult, setOrderResult] = useState<OrderResult | null>(null);
  const [finalStatus, setFinalStatus] = useState('');
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [resolvedUserId, setResolvedUserId] = useState<number | null>(null);
  const [myOrders, setMyOrders] = useState<MyOrder[]>([]);
  const [ordersPage, setOrdersPage] = useState(1);
  const [ordersHasMore, setOrdersHasMore] = useState(false);
  const [ordersLoadingMore, setOrdersLoadingMore] = useState(false);
  const [activeMobileTab, setActiveMobileTab] = useState<'pay' | 'orders'>('pay');

  const [config, setConfig] = useState<AppConfig>({
    enabledPaymentTypes: [],
    minAmount: 1,
    maxAmount: 1000,
    maxDailyAmount: 0,
  });
  const [userNotFound, setUserNotFound] = useState(false);
  const [helpImageOpen, setHelpImageOpen] = useState(false);

  const effectiveUserId = resolvedUserId || userId;
  const isEmbedded = uiMode === 'embedded' && isIframeContext;
  const hasToken = token.length > 0;
  const helpImageUrl = (config.helpImageUrl || '').trim();
  const helpText = (config.helpText || '').trim();
  const hasHelpContent = Boolean(helpImageUrl || helpText);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    setIsIframeContext(window.self !== window.top);
    setIsMobile(detectDeviceIsMobile());
  }, []);

  useEffect(() => {
    if (!isMobile || step !== 'form') return;
    if (tab === 'orders') {
      setActiveMobileTab('orders');
      return;
    }
    setActiveMobileTab('pay');
  }, [isMobile, step, tab]);

  const loadUserAndOrders = async () => {
    if (!userId || Number.isNaN(userId) || userId <= 0) return;

    setUserNotFound(false);
    try {
      // 始终获取服务端配置（不含隐私信息）
      const cfgRes = await fetch(`/api/user?user_id=${userId}`);
      if (cfgRes.ok) {
        const cfgData = await cfgRes.json();
        if (cfgData.config) {
          setConfig({
            enabledPaymentTypes: cfgData.config.enabledPaymentTypes ?? ['alipay', 'wxpay'],
            minAmount: cfgData.config.minAmount ?? 1,
            maxAmount: cfgData.config.maxAmount ?? 1000,
            maxDailyAmount: cfgData.config.maxDailyAmount ?? 0,
            methodLimits: cfgData.config.methodLimits,
            helpImageUrl: cfgData.config.helpImageUrl ?? null,
            helpText: cfgData.config.helpText ?? null,
            stripePublishableKey: cfgData.config.stripePublishableKey ?? null,
          });
        }
      } else if (cfgRes.status === 404) {
        setUserNotFound(true);
        return;
      }

      // 有 token 时才尝试获取用户详情和订单
      if (token) {
        const meRes = await fetch(`/api/orders/my?token=${encodeURIComponent(token)}`);
        if (meRes.ok) {
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
            balance: typeof meUser.balance === 'number' ? meUser.balance : undefined,
          });

          if (Array.isArray(meData.orders)) {
            setMyOrders(meData.orders);
            setOrdersPage(1);
            setOrdersHasMore((meData.total_pages ?? 1) > 1);
          } else {
            setMyOrders([]);
            setOrdersPage(1);
            setOrdersHasMore(false);
          }
          return;
        }
      }

      // 无 token 或 token 失效：只显示用户 ID，不展示隐私信息（不显示余额）
      setUserInfo({ id: userId, username: `用户 #${userId}` });
      setMyOrders([]);
      setOrdersPage(1);
      setOrdersHasMore(false);
    } catch {
      // ignore and keep page usable
    }
  };

  const loadMoreOrders = async () => {
    if (!token || ordersLoadingMore || !ordersHasMore) return;
    const nextPage = ordersPage + 1;
    setOrdersLoadingMore(true);
    try {
      const res = await fetch(`/api/orders/my?token=${encodeURIComponent(token)}&page=${nextPage}&page_size=20`);
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.orders) && data.orders.length > 0) {
        setMyOrders((prev) => [...prev, ...data.orders]);
        setOrdersPage(nextPage);
        setOrdersHasMore(nextPage < (data.total_pages ?? 1));
      } else {
        setOrdersHasMore(false);
      }
    } catch {
      // ignore
    } finally {
      setOrdersLoadingMore(false);
    }
  };

  useEffect(() => {
    loadUserAndOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, token]);

  useEffect(() => {
    if (step !== 'result' || finalStatus !== 'COMPLETED') return;
    // 立即在后台刷新余额，2.2s 显示结果页后再切回表单（届时余额已更新）
    loadUserAndOrders();
    const timer = setTimeout(() => {
      setStep('form');
      setOrderResult(null);
      setFinalStatus('');
      setError('');
    }, 2200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, finalStatus]);

  if (!effectiveUserId || Number.isNaN(effectiveUserId) || effectiveUserId <= 0) {
    return (
      <div className={`flex min-h-screen items-center justify-center p-4 ${isDark ? 'bg-slate-950' : 'bg-slate-50'}`}>
        <div className="text-center text-red-500">
          <p className="text-lg font-medium">无效的用户 ID</p>
          <p className="mt-2 text-sm text-gray-500">请从 Sub2API 平台正确访问充值页面</p>
        </div>
      </div>
    );
  }

  if (userNotFound) {
    return (
      <div className={`flex min-h-screen items-center justify-center p-4 ${isDark ? 'bg-slate-950' : 'bg-slate-50'}`}>
        <div className="text-center text-red-500">
          <p className="text-lg font-medium">用户不存在</p>
          <p className="mt-2 text-sm text-gray-500">请检查链接是否正确，或联系管理员</p>
        </div>
      </div>
    );
  }

  const buildScopedUrl = (path: string, forceOrdersTab = false) => {
    const params = new URLSearchParams();
    if (effectiveUserId) params.set('user_id', String(effectiveUserId));
    if (token) params.set('token', token);
    params.set('theme', theme);
    params.set('ui_mode', uiMode);
    if (forceOrdersTab) params.set('tab', 'orders');
    return `${path}?${params.toString()}`;
  };

  const pcOrdersUrl = buildScopedUrl('/pay/orders');
  const mobileOrdersUrl = buildScopedUrl('/pay', true);
  const ordersUrl = isMobile ? mobileOrdersUrl : pcOrdersUrl;

  const handleSubmit = async (amount: number, paymentType: string) => {
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: effectiveUserId,
          amount,
          payment_type: paymentType,
          src_host: srcHost,
          src_url: srcUrl,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        const codeMessages: Record<string, string> = {
          USER_INACTIVE: '账户已被禁用，无法充值，请联系管理员',
          TOO_MANY_PENDING: '您有过多待支付订单，请先完成或取消现有订单后再试',
          USER_NOT_FOUND: '用户不存在，请检查链接是否正确',
          DAILY_LIMIT_EXCEEDED: data.error,
          METHOD_DAILY_LIMIT_EXCEEDED: data.error,
          PAYMENT_GATEWAY_ERROR: data.error,
        };
        setError(codeMessages[data.code] || data.error || '创建订单失败');
        return;
      }

      setOrderResult({
        orderId: data.orderId,
        amount: data.amount,
        payAmount: data.payAmount,
        status: data.status,
        paymentType: data.paymentType || paymentType,
        payUrl: data.payUrl,
        qrCode: data.qrCode,
        clientSecret: data.clientSecret,
        expiresAt: data.expiresAt,
      });

      setStep('paying');
    } catch {
      setError('网络错误，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = (status: string) => {
    setFinalStatus(status);
    setStep('result');
    if (isMobile) {
      setActiveMobileTab('orders');
    }
  };

  const handleBack = () => {
    setStep('form');
    setOrderResult(null);
    setFinalStatus('');
    setError('');
  };

  return (
    <PayPageLayout
      isDark={isDark}
      isEmbedded={isEmbedded}
      maxWidth={isMobile ? 'sm' : 'lg'}
      title="Sub2API 余额充值"
      subtitle="安全支付，自动到账"
      actions={
        !isMobile ? (
          <>
            <button
              type="button"
              onClick={loadUserAndOrders}
              className={[
                'inline-flex items-center rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                isDark
                  ? 'border-slate-600 text-slate-200 hover:bg-slate-800'
                  : 'border-slate-300 text-slate-700 hover:bg-slate-100',
              ].join(' ')}
            >
              刷新
            </button>
            <a
              href={ordersUrl}
              className={[
                'inline-flex items-center rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                isDark
                  ? 'border-slate-600 text-slate-200 hover:bg-slate-800'
                  : 'border-slate-300 text-slate-700 hover:bg-slate-100',
              ].join(' ')}
            >
              我的订单
            </a>
          </>
        ) : undefined
      }
    >
      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</div>}

      {step === 'form' && isMobile && (
        <div
          className={[
            'mb-4 grid grid-cols-2 rounded-xl border p-1',
            isDark ? 'border-slate-700 bg-slate-800/70' : 'border-slate-300 bg-slate-100/90',
          ].join(' ')}
        >
          <button
            type="button"
            onClick={() => setActiveMobileTab('pay')}
            className={[
              'rounded-lg px-3 py-2 text-sm font-semibold transition-all duration-200',
              activeMobileTab === 'pay'
                ? isDark
                  ? 'bg-indigo-500/30 text-indigo-100 ring-1 ring-indigo-300/35 shadow-sm'
                  : 'bg-white text-slate-900 ring-1 ring-slate-300 shadow-md shadow-slate-300/50'
                : isDark
                  ? 'text-slate-400 hover:text-slate-200'
                  : 'text-slate-500 hover:text-slate-700',
            ].join(' ')}
          >
            充值
          </button>
          <button
            type="button"
            onClick={() => setActiveMobileTab('orders')}
            className={[
              'rounded-lg px-3 py-2 text-sm font-semibold transition-all duration-200',
              activeMobileTab === 'orders'
                ? isDark
                  ? 'bg-indigo-500/30 text-indigo-100 ring-1 ring-indigo-300/35 shadow-sm'
                  : 'bg-white text-slate-900 ring-1 ring-slate-300 shadow-md shadow-slate-300/50'
                : isDark
                  ? 'text-slate-400 hover:text-slate-200'
                  : 'text-slate-500 hover:text-slate-700',
            ].join(' ')}
          >
            我的订单
          </button>
        </div>
      )}

      {step === 'form' && config.enabledPaymentTypes.length === 0 && (
        <div className="flex items-center justify-center py-12">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
          <span className={['ml-3 text-sm', isDark ? 'text-slate-400' : 'text-gray-500'].join(' ')}>加载中...</span>
        </div>
      )}

      {step === 'form' && config.enabledPaymentTypes.length > 0 && (
        <>
          {isMobile ? (
            activeMobileTab === 'pay' ? (
              <PaymentForm
                userId={effectiveUserId}
                userName={userInfo?.username}
                userBalance={userInfo?.balance}
                enabledPaymentTypes={config.enabledPaymentTypes}
                methodLimits={config.methodLimits}
                minAmount={config.minAmount}
                maxAmount={config.maxAmount}
                onSubmit={handleSubmit}
                loading={loading}
                dark={isDark}
              />
            ) : (
              <MobileOrderList
                isDark={isDark}
                hasToken={hasToken}
                orders={myOrders}
                hasMore={ordersHasMore}
                loadingMore={ordersLoadingMore}
                onRefresh={loadUserAndOrders}
                onLoadMore={loadMoreOrders}
              />
            )
          ) : (
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.8fr)]">
              <div className="min-w-0">
                <PaymentForm
                  userId={effectiveUserId}
                  userName={userInfo?.username}
                  userBalance={userInfo?.balance}
                  enabledPaymentTypes={config.enabledPaymentTypes}
                  methodLimits={config.methodLimits}
                  minAmount={config.minAmount}
                  maxAmount={config.maxAmount}
                  onSubmit={handleSubmit}
                  loading={loading}
                  dark={isDark}
                />
              </div>
              <div className="space-y-4">
                <div
                  className={[
                    'rounded-2xl border p-4',
                    isDark ? 'border-slate-700 bg-slate-800/70' : 'border-slate-200 bg-slate-50',
                  ].join(' ')}
                >
                  <div className={['text-xs', isDark ? 'text-slate-400' : 'text-slate-500'].join(' ')}>支付说明</div>
                  <ul className={['mt-2 space-y-1 text-sm', isDark ? 'text-slate-300' : 'text-slate-600'].join(' ')}>
                    <li>订单完成后会自动到账</li>
                    <li>如需历史记录请查看「我的订单」</li>
                    {config.maxDailyAmount > 0 && <li>每日最大充值 ¥{config.maxDailyAmount.toFixed(2)}</li>}
                    {!hasToken && (
                      <li className={isDark ? 'text-amber-200' : 'text-amber-700'}>当前链接无 token，订单查询受限</li>
                    )}
                  </ul>
                </div>

                {hasHelpContent && (
                  <div
                    className={[
                      'rounded-2xl border p-4',
                      isDark ? 'border-slate-700 bg-slate-800/70' : 'border-slate-200 bg-slate-50',
                    ].join(' ')}
                  >
                    <div className={['text-xs', isDark ? 'text-slate-400' : 'text-slate-500'].join(' ')}>Support</div>
                    {helpImageUrl && (
                      <img
                        src={helpImageUrl}
                        alt="help"
                        onClick={() => setHelpImageOpen(true)}
                        className="mt-3 max-h-40 w-full cursor-zoom-in rounded-lg object-contain bg-white/70 p-2"
                      />
                    )}
                    {helpText && (
                      <div
                        className={[
                          'mt-3 space-y-1 text-sm leading-6',
                          isDark ? 'text-slate-300' : 'text-slate-600',
                        ].join(' ')}
                      >
                        {helpText.split('\\n').map((line, i) => (
                          <p key={i}>{line}</p>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {step === 'paying' && orderResult && (
        <PaymentQRCode
          orderId={orderResult.orderId}
          token={token || undefined}
          payUrl={orderResult.payUrl}
          qrCode={orderResult.qrCode}
          clientSecret={orderResult.clientSecret}
          stripePublishableKey={config.stripePublishableKey}
          paymentType={orderResult.paymentType}
          amount={orderResult.amount}
          payAmount={orderResult.payAmount}
          expiresAt={orderResult.expiresAt}
          onStatusChange={handleStatusChange}
          onBack={handleBack}
          dark={isDark}
          isEmbedded={isEmbedded}
          isMobile={isMobile}
        />
      )}

      {step === 'result' && <OrderStatus status={finalStatus} onBack={handleBack} dark={isDark} />}

      {helpImageOpen && helpImageUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
          onClick={() => setHelpImageOpen(false)}
        >
          <img
            src={helpImageUrl}
            alt="help"
            className="max-h-[90vh] max-w-full rounded-xl object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </PayPageLayout>
  );
}

export default function PayPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <div className="text-gray-500">加载中...</div>
        </div>
      }
    >
      <PayContent />
    </Suspense>
  );
}
