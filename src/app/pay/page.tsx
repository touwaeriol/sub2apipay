'use client';

import { useSearchParams } from 'next/navigation';
import { useState, useEffect, Suspense, useCallback } from 'react';
import PaymentForm from '@/components/PaymentForm';
import PaymentQRCode from '@/components/PaymentQRCode';
import OrderStatus from '@/components/OrderStatus';
import PayPageLayout from '@/components/PayPageLayout';
import MobileOrderList from '@/components/MobileOrderList';
import MainTabs from '@/components/MainTabs';
import ChannelGrid from '@/components/ChannelGrid';
import SubscriptionPlanCard from '@/components/SubscriptionPlanCard';
import SubscriptionConfirm from '@/components/SubscriptionConfirm';
import UserSubscriptions from '@/components/UserSubscriptions';
import PurchaseFlow from '@/components/PurchaseFlow';
import { resolveLocale, pickLocaleText, applyLocaleToSearchParams } from '@/lib/locale';
import { detectDeviceIsMobile, applySublabelOverrides, type UserInfo, type MyOrder } from '@/lib/pay-utils';
import type { PublicOrderStatusSnapshot } from '@/lib/order/status';
import type { MethodLimitInfo } from '@/components/PaymentForm';
import type { ChannelInfo } from '@/components/ChannelGrid';
import type { PlanInfo } from '@/components/SubscriptionPlanCard';
import type { UserSub } from '@/components/UserSubscriptions';

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
  statusAccessToken: string;
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
  const token = (searchParams.get('token') || '').trim();
  const theme = searchParams.get('theme') === 'dark' ? 'dark' : 'light';
  const uiMode = searchParams.get('ui_mode') || 'standalone';
  const tab = searchParams.get('tab');
  const srcHost = searchParams.get('src_host') || undefined;
  const srcUrl = searchParams.get('src_url') || undefined;
  const locale = resolveLocale(searchParams.get('lang'));
  const isDark = theme === 'dark';

  const [isIframeContext, setIsIframeContext] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [step, setStep] = useState<'form' | 'paying' | 'result'>('form');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [subscriptionError, setSubscriptionError] = useState('');
  const [orderResult, setOrderResult] = useState<OrderResult | null>(null);
  const [finalOrderState, setFinalOrderState] = useState<PublicOrderStatusSnapshot | null>(null);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [resolvedUserId, setResolvedUserId] = useState<number | null>(null);
  const [myOrders, setMyOrders] = useState<MyOrder[]>([]);
  const [ordersPage, setOrdersPage] = useState(1);
  const [ordersHasMore, setOrdersHasMore] = useState(false);
  const [ordersLoadingMore, setOrdersLoadingMore] = useState(false);
  const [activeMobileTab, setActiveMobileTab] = useState<'pay' | 'orders'>('pay');
  const [pendingCount, setPendingCount] = useState(0);

  // 新增状态
  const [mainTab, setMainTab] = useState<'topup' | 'subscribe'>('topup');
  const [channels, setChannels] = useState<ChannelInfo[]>([]);
  const [plans, setPlans] = useState<PlanInfo[]>([]);
  const [userSubscriptions, setUserSubscriptions] = useState<UserSub[]>([]);
  const [showTopUpForm, setShowTopUpForm] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<PlanInfo | null>(null);
  const [channelsLoaded, setChannelsLoaded] = useState(false);

  const [config, setConfig] = useState<AppConfig>({
    enabledPaymentTypes: [],
    minAmount: 1,
    maxAmount: 1000,
    maxDailyAmount: 0,
  });
  const [userNotFound, setUserNotFound] = useState(false);
  const [helpImageOpen, setHelpImageOpen] = useState(false);

  const hasToken = token.length > 0;
  const isEmbedded = uiMode === 'embedded' && isIframeContext;
  const helpImageUrl = (config.helpImageUrl || '').trim();
  const helpText = (config.helpText || '').trim();
  const hasHelpContent = Boolean(helpImageUrl || helpText);

  // 通用帮助/客服信息区块
  const renderHelpSection = () => {
    if (!hasHelpContent) return null;
    return (
      <div className={[
        'mt-6 rounded-2xl border p-4',
        isDark ? 'border-slate-700 bg-slate-800/70' : 'border-slate-200 bg-slate-50',
      ].join(' ')}>
        <div className={['text-xs font-medium', isDark ? 'text-slate-400' : 'text-slate-500'].join(' ')}>
          {pickLocaleText(locale, '帮助', 'Support')}
        </div>
        {helpImageUrl && (
          <img src={helpImageUrl} alt="help" onClick={() => setHelpImageOpen(true)} className="mt-3 max-h-40 w-full cursor-zoom-in rounded-lg object-contain bg-white/70 p-2" />
        )}
        {helpText && (
          <div className={['mt-3 space-y-1 text-sm leading-6', isDark ? 'text-slate-300' : 'text-slate-600'].join(' ')}>
            {helpText.split('\n').map((line, i) => (<p key={i}>{line}</p>))}
          </div>
        )}
      </div>
    );
  };

  const MAX_PENDING = 3;
  const pendingBlocked = pendingCount >= MAX_PENDING;

  // 是否有渠道配置（决定是直接显示充值表单还是渠道卡片+弹窗）
  const hasChannels = channels.length > 0;
  // 是否有可售卖套餐
  const hasPlans = plans.length > 0;

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

  const loadUserAndOrders = useCallback(async () => {
    if (!token) return;
    setUserNotFound(false);
    try {
      const meRes = await fetch(`/api/orders/my?token=${encodeURIComponent(token)}`);
      if (!meRes.ok) {
        setUserNotFound(true);
        return;
      }

      const meData = await meRes.json();
      const meUser = meData.user || {};
      const meId = Number(meUser.id);
      if (!Number.isInteger(meId) || meId <= 0) {
        setUserNotFound(true);
        return;
      }

      setResolvedUserId(meId);
      setPendingCount(meData.summary?.pending ?? 0);

      setUserInfo({
        id: meId,
        username:
          (typeof meUser.displayName === 'string' && meUser.displayName.trim()) ||
          (typeof meUser.username === 'string' && meUser.username.trim()) ||
          pickLocaleText(locale, `用户 #${meId}`, `User #${meId}`),
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

      const cfgRes = await fetch(`/api/user?user_id=${meId}&token=${encodeURIComponent(token)}`);
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
          if (cfgData.config.sublabelOverrides) {
            applySublabelOverrides(cfgData.config.sublabelOverrides);
          }
        }
      }
    } catch {}
  }, [token, locale]);

  // 加载渠道和订阅套餐
  const loadChannelsAndPlans = useCallback(async () => {
    if (!token) return;
    try {
      const [chRes, plRes, subRes] = await Promise.all([
        fetch(`/api/channels?token=${encodeURIComponent(token)}`),
        fetch(`/api/subscription-plans?token=${encodeURIComponent(token)}`),
        fetch(`/api/subscriptions/my?token=${encodeURIComponent(token)}`),
      ]);

      if (chRes.ok) {
        const chData = await chRes.json();
        setChannels(chData.channels ?? []);
      }
      if (plRes.ok) {
        const plData = await plRes.json();
        setPlans(plData.plans ?? []);
      }
      if (subRes.ok) {
        const subData = await subRes.json();
        setUserSubscriptions(subData.subscriptions ?? []);
      }
    } catch {} finally {
      setChannelsLoaded(true);
    }
  }, [token]);

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
    } finally {
      setOrdersLoadingMore(false);
    }
  };

  useEffect(() => {
    loadUserAndOrders();
    loadChannelsAndPlans();
  }, [loadUserAndOrders, loadChannelsAndPlans]);

  useEffect(() => {
    if (step !== 'result' || finalOrderState?.status !== 'COMPLETED') return;
    loadUserAndOrders();
    loadChannelsAndPlans();
    const timer = setTimeout(() => {
      setStep('form');
      setOrderResult(null);
      setFinalOrderState(null);
      setError('');
      setSubscriptionError('');
      setSelectedPlan(null);
    }, 2200);
    return () => clearTimeout(timer);
  }, [step, finalOrderState, loadUserAndOrders, loadChannelsAndPlans]);

  // 检查订单完成后是否是订阅分组消失的情况
  useEffect(() => {
    if (step !== 'result' || !finalOrderState) return;
    if (
      finalOrderState.status === 'FAILED' &&
      finalOrderState.failedReason?.includes('SUBSCRIPTION_GROUP_GONE')
    ) {
      setSubscriptionError(
        pickLocaleText(
          locale,
          '您已成功支付，但订阅分组已下架，无法自动开通。请联系客服处理，提供订单号。',
          'Payment successful, but the subscription group has been removed. Please contact support with your order ID.',
        ),
      );
    }
  }, [step, finalOrderState, locale]);

  if (!hasToken) {
    return (
      <div className={`flex min-h-screen items-center justify-center p-4 ${isDark ? 'bg-slate-950' : 'bg-slate-50'}`}>
        <div className="text-center text-red-500">
          <p className="text-lg font-medium">{pickLocaleText(locale, '缺少认证信息', 'Missing authentication info')}</p>
          <p className="mt-2 text-sm text-gray-500">
            {pickLocaleText(locale, '请从 Sub2API 平台正确访问充值页面', 'Please open the recharge page from the Sub2API platform')}
          </p>
        </div>
      </div>
    );
  }

  if (userNotFound) {
    return (
      <div className={`flex min-h-screen items-center justify-center p-4 ${isDark ? 'bg-slate-950' : 'bg-slate-50'}`}>
        <div className="text-center text-red-500">
          <p className="text-lg font-medium">{pickLocaleText(locale, '用户不存在', 'User not found')}</p>
          <p className="mt-2 text-sm text-gray-500">
            {pickLocaleText(locale, '请检查链接是否正确，或联系管理员', 'Please check whether the link is correct or contact the administrator')}
          </p>
        </div>
      </div>
    );
  }

  const buildScopedUrl = (path: string, forceOrdersTab = false) => {
    const params = new URLSearchParams();
    if (token) params.set('token', token);
    params.set('theme', theme);
    params.set('ui_mode', uiMode);
    if (forceOrdersTab) params.set('tab', 'orders');
    if (srcHost) params.set('src_host', srcHost);
    if (srcUrl) params.set('src_url', srcUrl);
    applyLocaleToSearchParams(params, locale);
    return `${path}?${params.toString()}`;
  };

  const pcOrdersUrl = buildScopedUrl('/pay/orders');
  const mobileOrdersUrl = buildScopedUrl('/pay', true);
  const ordersUrl = isMobile ? mobileOrdersUrl : pcOrdersUrl;

  // ── 余额充值提交 ──
  const handleSubmit = async (amount: number, paymentType: string) => {
    if (pendingBlocked) {
      setError(
        pickLocaleText(
          locale,
          `您有 ${pendingCount} 个待支付订单，请先完成或取消后再试（最多 ${MAX_PENDING} 个）`,
          `You have ${pendingCount} pending orders. Please complete or cancel them first (maximum ${MAX_PENDING}).`,
        ),
      );
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          amount,
          payment_type: paymentType,
          is_mobile: isMobile,
          src_host: srcHost,
          src_url: srcUrl,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        const codeMessages: Record<string, string> = {
          INVALID_TOKEN: pickLocaleText(locale, '认证已失效，请重新从平台进入充值页面', 'Authentication expired'),
          USER_INACTIVE: pickLocaleText(locale, '账户已被禁用，无法充值', 'Account is disabled'),
          TOO_MANY_PENDING: pickLocaleText(locale, '待支付订单过多，请先处理', 'Too many pending orders'),
          USER_NOT_FOUND: pickLocaleText(locale, '用户不存在', 'User not found'),
          DAILY_LIMIT_EXCEEDED: data.error,
          METHOD_DAILY_LIMIT_EXCEEDED: data.error,
          PAYMENT_GATEWAY_ERROR: data.error,
        };
        setError(codeMessages[data.code] || data.error || pickLocaleText(locale, '创建订单失败', 'Failed to create order'));
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
        statusAccessToken: data.statusAccessToken,
      });
      setStep('paying');
    } catch {
      setError(pickLocaleText(locale, '网络错误，请稍后重试', 'Network error'));
    } finally {
      setLoading(false);
    }
  };

  // ── 订阅下单 ──
  const handleSubscriptionSubmit = async (paymentType: string) => {
    if (!selectedPlan) return;
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          amount: selectedPlan.price,
          payment_type: paymentType,
          is_mobile: isMobile,
          src_host: srcHost,
          src_url: srcUrl,
          order_type: 'subscription',
          plan_id: selectedPlan.id,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || pickLocaleText(locale, '创建订阅订单失败', 'Failed to create subscription order'));
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
        statusAccessToken: data.statusAccessToken,
      });
      setStep('paying');
    } catch {
      setError(pickLocaleText(locale, '网络错误，请稍后重试', 'Network error'));
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = (order: PublicOrderStatusSnapshot) => {
    setFinalOrderState(order);
    setStep('result');
    if (isMobile) setActiveMobileTab('orders');
  };

  const handleBack = () => {
    setStep('form');
    setOrderResult(null);
    setFinalOrderState(null);
    setError('');
    setSubscriptionError('');
    setSelectedPlan(null);
    setShowTopUpForm(false);
  };

  // ── 渲染 ──
  const showMainTabs = channelsLoaded && (hasChannels || hasPlans);
  const pageTitle = showMainTabs
    ? pickLocaleText(locale, '选择适合你的 订阅套餐', 'Choose Your Plan')
    : pickLocaleText(locale, 'Sub2API 余额充值', 'Sub2API Balance Recharge');
  const pageSubtitle = showMainTabs
    ? pickLocaleText(locale, '通过支付购买或兑换码激活获取订阅服务', 'Subscribe via payment or activation code')
    : pickLocaleText(locale, '安全支付，自动到账', 'Secure payment, automatic crediting');

  return (
    <PayPageLayout
      isDark={isDark}
      isEmbedded={isEmbedded}
      maxWidth={showMainTabs ? 'full' : isMobile ? 'sm' : 'lg'}
      title={pageTitle}
      subtitle={pageSubtitle}
      locale={locale}
      actions={
        !isMobile ? (
          <>
            <button
              type="button"
              onClick={() => { loadUserAndOrders(); loadChannelsAndPlans(); }}
              className={[
                'inline-flex items-center rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                isDark ? 'border-slate-600 text-slate-200 hover:bg-slate-800' : 'border-slate-300 text-slate-700 hover:bg-slate-100',
              ].join(' ')}
            >
              {pickLocaleText(locale, '刷新', 'Refresh')}
            </button>
            <a
              href={ordersUrl}
              className={[
                'inline-flex items-center rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                isDark ? 'border-slate-600 text-slate-200 hover:bg-slate-800' : 'border-slate-300 text-slate-700 hover:bg-slate-100',
              ].join(' ')}
            >
              {pickLocaleText(locale, '我的订单', 'My Orders')}
            </a>
          </>
        ) : undefined
      }
    >
      {/* 订阅分组消失的常驻错误 */}
      {subscriptionError && (
        <div className={[
          'mb-4 rounded-lg border-2 p-4 text-sm',
          isDark ? 'border-red-600 bg-red-900/40 text-red-300' : 'border-red-400 bg-red-50 text-red-700',
        ].join(' ')}>
          <div className="font-semibold mb-1">{pickLocaleText(locale, '订阅开通失败', 'Subscription Failed')}</div>
          <div>{subscriptionError}</div>
          {orderResult && (
            <div className="mt-2 text-xs opacity-80">
              {pickLocaleText(locale, '订单号', 'Order ID')}: {orderResult.orderId}
            </div>
          )}
        </div>
      )}

      {error && (
        <div className={[
          'mb-4 rounded-lg border p-3 text-sm',
          isDark ? 'border-red-700 bg-red-900/30 text-red-400' : 'border-red-200 bg-red-50 text-red-600',
        ].join(' ')}>
          {error}
        </div>
      )}

      {/* ── 表单阶段 ── */}
      {step === 'form' && (
        <>
          {/* 移动端 Tab：充值/订单 */}
          {isMobile && (
            <div className={[
              'mb-4 grid grid-cols-2 rounded-xl border p-1',
              isDark ? 'border-slate-700 bg-slate-800/70' : 'border-slate-300 bg-slate-100/90',
            ].join(' ')}>
              <button
                type="button"
                onClick={() => setActiveMobileTab('pay')}
                className={[
                  'rounded-lg px-3 py-2 text-sm font-semibold transition-all duration-200',
                  activeMobileTab === 'pay'
                    ? isDark ? 'bg-indigo-500/30 text-indigo-100 ring-1 ring-indigo-300/35 shadow-sm' : 'bg-white text-slate-900 ring-1 ring-slate-300 shadow-md shadow-slate-300/50'
                    : isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-700',
                ].join(' ')}
              >
                {pickLocaleText(locale, '充值', 'Recharge')}
              </button>
              <button
                type="button"
                onClick={() => setActiveMobileTab('orders')}
                className={[
                  'rounded-lg px-3 py-2 text-sm font-semibold transition-all duration-200',
                  activeMobileTab === 'orders'
                    ? isDark ? 'bg-indigo-500/30 text-indigo-100 ring-1 ring-indigo-300/35 shadow-sm' : 'bg-white text-slate-900 ring-1 ring-slate-300 shadow-md shadow-slate-300/50'
                    : isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-700',
                ].join(' ')}
              >
                {pickLocaleText(locale, '我的订单', 'My Orders')}
              </button>
            </div>
          )}

          {/* 加载中 */}
          {!channelsLoaded && config.enabledPaymentTypes.length === 0 && (
            <div className="flex items-center justify-center py-12">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
              <span className={['ml-3 text-sm', isDark ? 'text-slate-400' : 'text-gray-500'].join(' ')}>
                {pickLocaleText(locale, '加载中...', 'Loading...')}
              </span>
            </div>
          )}

          {/* ── 有渠道配置：新版UI ── */}
          {channelsLoaded && showMainTabs && (activeMobileTab === 'pay' || !isMobile) && !selectedPlan && !showTopUpForm && (
            <>
              <MainTabs activeTab={mainTab} onTabChange={setMainTab} showSubscribeTab={hasPlans} isDark={isDark} locale={locale} />

              {mainTab === 'topup' && (
                <div className="mt-6">
                  {/* 按量付费说明 banner */}
                  <div className={[
                    'mb-6 rounded-2xl border p-6',
                    isDark
                      ? 'border-emerald-500/20 bg-gradient-to-r from-emerald-500/10 to-purple-500/10'
                      : 'border-emerald-500/20 bg-gradient-to-r from-emerald-50 to-purple-50',
                  ].join(' ')}>
                    <div className="flex items-start gap-4">
                      <div className={[
                        'flex-shrink-0 rounded-lg p-2',
                        isDark ? 'bg-emerald-500/20' : 'bg-emerald-500/15',
                      ].join(' ')}>
                        <svg className="h-6 w-6 text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                        </svg>
                      </div>
                      <div className="flex-1">
                        <h3 className={['text-lg font-semibold mb-2', isDark ? 'text-emerald-400' : 'text-emerald-700'].join(' ')}>
                          {pickLocaleText(locale, '按量付费模式', 'Pay-as-you-go')}
                        </h3>
                        <p className={['text-sm mb-4', isDark ? 'text-slate-400' : 'text-slate-500'].join(' ')}>
                          {pickLocaleText(
                            locale,
                            '无需订阅，充值即用，按实际消耗扣费。余额所有渠道通用，可自由切换。价格以美元计价（当前比例：1美元≈1人民币）',
                            'No subscription needed. Top up and use. Charged by actual usage. Balance works across all channels. Priced in USD (current rate: 1 USD ≈ 1 CNY)',
                          )}
                        </p>
                        <div className="flex flex-wrap gap-4 text-sm">
                          <div className={['flex items-center gap-2', isDark ? 'text-slate-400' : 'text-slate-500'].join(' ')}>
                            <svg className="h-4 w-4 text-green-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                              <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
                              <polyline points="17 6 23 6 23 12" />
                            </svg>
                            <span>{pickLocaleText(locale, '倍率越低越划算', 'Lower rate = better value')}</span>
                          </div>
                          <div className={['flex items-center gap-2', isDark ? 'text-slate-400' : 'text-slate-500'].join(' ')}>
                            <svg className="h-4 w-4 text-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                            </svg>
                            <span>{pickLocaleText(locale, '0.15倍率 = 1元可用约6.67美元额度', '0.15 rate = 1 CNY ≈ $6.67 quota')}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {hasChannels ? (
                    <ChannelGrid
                      channels={channels}
                      onTopUp={() => setShowTopUpForm(true)}
                      isDark={isDark}
                      locale={locale}
                      userBalance={userInfo?.balance}
                    />
                  ) : (
                    <PaymentForm
                      userId={resolvedUserId ?? 0}
                      userName={userInfo?.username}
                      userBalance={userInfo?.balance}
                      enabledPaymentTypes={config.enabledPaymentTypes}
                      methodLimits={config.methodLimits}
                      minAmount={config.minAmount}
                      maxAmount={config.maxAmount}
                      onSubmit={handleSubmit}
                      loading={loading}
                      dark={isDark}
                      pendingBlocked={pendingBlocked}
                      pendingCount={pendingCount}
                      locale={locale}
                    />
                  )}

                  {/* 用户已有订阅 */}
                  {userSubscriptions.length > 0 && (
                    <div className="mt-8">
                      <h3 className={['text-lg font-semibold mb-3', isDark ? 'text-slate-200' : 'text-slate-800'].join(' ')}>
                        {pickLocaleText(locale, '我的订阅', 'My Subscriptions')}
                      </h3>
                      <UserSubscriptions
                        subscriptions={userSubscriptions}
                        onRenew={(groupId) => {
                          const plan = plans.find((p) => p.groupId === groupId);
                          if (plan) {
                            setSelectedPlan(plan);
                            setMainTab('subscribe');
                          }
                        }}
                        isDark={isDark}
                        locale={locale}
                      />
                    </div>
                  )}

                  {renderHelpSection()}
                </div>
              )}

              {mainTab === 'subscribe' && (
                <div className="mt-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {plans.map((plan) => (
                      <SubscriptionPlanCard
                        key={plan.id}
                        plan={plan}
                        onSubscribe={() => setSelectedPlan(plan)}
                        isDark={isDark}
                        locale={locale}
                      />
                    ))}
                  </div>

                  {/* 用户已有订阅 */}
                  {userSubscriptions.length > 0 && (
                    <div className="mt-8">
                      <h3 className={['text-lg font-semibold mb-3', isDark ? 'text-slate-200' : 'text-slate-800'].join(' ')}>
                        {pickLocaleText(locale, '我的订阅', 'My Subscriptions')}
                      </h3>
                      <UserSubscriptions
                        subscriptions={userSubscriptions}
                        onRenew={(groupId) => {
                          const plan = plans.find((p) => p.groupId === groupId);
                          if (plan) setSelectedPlan(plan);
                        }}
                        isDark={isDark}
                        locale={locale}
                      />
                    </div>
                  )}

                  {renderHelpSection()}
                </div>
              )}

              <PurchaseFlow isDark={isDark} locale={locale} />
            </>
          )}

          {/* 点击"立即充值"后：直接显示 PaymentForm（含金额选择） */}
          {showTopUpForm && step === 'form' && (
            <div>
              <button
                type="button"
                onClick={() => setShowTopUpForm(false)}
                className={['mb-4 text-sm', isDark ? 'text-emerald-400 hover:text-emerald-300' : 'text-emerald-600 hover:text-emerald-500'].join(' ')}
              >
                ← {pickLocaleText(locale, '返回', 'Back')}
              </button>
              <PaymentForm
                userId={resolvedUserId ?? 0}
                userName={userInfo?.username}
                userBalance={userInfo?.balance}
                enabledPaymentTypes={config.enabledPaymentTypes}
                methodLimits={config.methodLimits}
                minAmount={config.minAmount}
                maxAmount={config.maxAmount}
                onSubmit={handleSubmit}
                loading={loading}
                dark={isDark}
                pendingBlocked={pendingBlocked}
                pendingCount={pendingCount}
                locale={locale}
              />
              {renderHelpSection()}
            </div>
          )}

          {/* 订阅确认页 */}
          {selectedPlan && step === 'form' && (
            <>
              <SubscriptionConfirm
                plan={selectedPlan}
                paymentTypes={config.enabledPaymentTypes}
                onBack={() => setSelectedPlan(null)}
                onSubmit={handleSubscriptionSubmit}
                loading={loading}
                isDark={isDark}
                locale={locale}
              />
              {renderHelpSection()}
            </>
          )}

          {/* ── 无渠道配置：传统充值UI ── */}
          {channelsLoaded && !showMainTabs && config.enabledPaymentTypes.length > 0 && !selectedPlan && (
            <>
              {isMobile ? (
                activeMobileTab === 'pay' ? (
                  <PaymentForm
                    userId={resolvedUserId ?? 0}
                    userName={userInfo?.username}
                    userBalance={userInfo?.balance}
                    enabledPaymentTypes={config.enabledPaymentTypes}
                    methodLimits={config.methodLimits}
                    minAmount={config.minAmount}
                    maxAmount={config.maxAmount}
                    onSubmit={handleSubmit}
                    loading={loading}
                    dark={isDark}
                    pendingBlocked={pendingBlocked}
                    pendingCount={pendingCount}
                    locale={locale}
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
                    locale={locale}
                  />
                )
              ) : (
                <div className="grid gap-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.8fr)]">
                  <div className="min-w-0">
                    <PaymentForm
                      userId={resolvedUserId ?? 0}
                      userName={userInfo?.username}
                      userBalance={userInfo?.balance}
                      enabledPaymentTypes={config.enabledPaymentTypes}
                      methodLimits={config.methodLimits}
                      minAmount={config.minAmount}
                      maxAmount={config.maxAmount}
                      onSubmit={handleSubmit}
                      loading={loading}
                      dark={isDark}
                      pendingBlocked={pendingBlocked}
                      pendingCount={pendingCount}
                      locale={locale}
                    />
                  </div>
                  <div className="space-y-4">
                    <div className={['rounded-2xl border p-4', isDark ? 'border-slate-700 bg-slate-800/70' : 'border-slate-200 bg-slate-50'].join(' ')}>
                      <div className={['text-xs', isDark ? 'text-slate-400' : 'text-slate-500'].join(' ')}>
                        {pickLocaleText(locale, '支付说明', 'Payment Notes')}
                      </div>
                      <ul className={['mt-2 space-y-1 text-sm', isDark ? 'text-slate-300' : 'text-slate-600'].join(' ')}>
                        <li>{pickLocaleText(locale, '订单完成后会自动到账', 'Balance will be credited automatically')}</li>
                        <li>{pickLocaleText(locale, '如需历史记录请查看「我的订单」', 'Check "My Orders" for history')}</li>
                        {config.maxDailyAmount > 0 && (
                          <li>{pickLocaleText(locale, '每日最大充值', 'Max daily recharge')} ¥{config.maxDailyAmount.toFixed(2)}</li>
                        )}
                      </ul>
                    </div>
                    {hasHelpContent && (
                      <div className={['rounded-2xl border p-4', isDark ? 'border-slate-700 bg-slate-800/70' : 'border-slate-200 bg-slate-50'].join(' ')}>
                        <div className={['text-xs', isDark ? 'text-slate-400' : 'text-slate-500'].join(' ')}>
                          {pickLocaleText(locale, '帮助', 'Support')}
                        </div>
                        {helpImageUrl && (
                          <img src={helpImageUrl} alt="help" onClick={() => setHelpImageOpen(true)} className="mt-3 max-h-40 w-full cursor-zoom-in rounded-lg object-contain bg-white/70 p-2" />
                        )}
                        {helpText && (
                          <div className={['mt-3 space-y-1 text-sm leading-6', isDark ? 'text-slate-300' : 'text-slate-600'].join(' ')}>
                            {helpText.split('\n').map((line, i) => (<p key={i}>{line}</p>))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          {/* 移动端订单列表 */}
          {isMobile && activeMobileTab === 'orders' && showMainTabs && (
            <MobileOrderList
              isDark={isDark}
              hasToken={hasToken}
              orders={myOrders}
              hasMore={ordersHasMore}
              loadingMore={ordersLoadingMore}
              onRefresh={loadUserAndOrders}
              onLoadMore={loadMoreOrders}
              locale={locale}
            />
          )}
        </>
      )}

      {/* ── 支付阶段 ── */}
      {step === 'paying' && orderResult && (
        <>
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
            statusAccessToken={orderResult.statusAccessToken}
            onStatusChange={handleStatusChange}
            onBack={handleBack}
            dark={isDark}
            isEmbedded={isEmbedded}
            isMobile={isMobile}
            locale={locale}
          />
          {renderHelpSection()}
        </>
      )}

      {/* ── 结果阶段 ── */}
      {step === 'result' && orderResult && finalOrderState && (
        <OrderStatus
          orderId={orderResult.orderId}
          order={finalOrderState}
          statusAccessToken={orderResult.statusAccessToken}
          onStateChange={setFinalOrderState}
          onBack={handleBack}
          dark={isDark}
          locale={locale}
        />
      )}

      {/* 帮助图片放大 */}
      {helpImageOpen && helpImageUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm" onClick={() => setHelpImageOpen(false)}>
          <img src={helpImageUrl} alt="help" className="max-h-[90vh] max-w-full rounded-xl object-contain shadow-2xl" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </PayPageLayout>
  );
}

function PayPageFallback() {
  const searchParams = useSearchParams();
  const locale = resolveLocale(searchParams.get('lang'));
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-gray-500">{pickLocaleText(locale, '加载中...', 'Loading...')}</div>
    </div>
  );
}

export default function PayPage() {
  return (
    <Suspense fallback={<PayPageFallback />}>
      <PayContent />
    </Suspense>
  );
}
