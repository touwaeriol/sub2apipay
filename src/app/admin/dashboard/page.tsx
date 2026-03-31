'use client';

import { useSearchParams } from 'next/navigation';
import { useState, useEffect, useCallback, Suspense } from 'react';
import PayPageLayout from '@/components/PayPageLayout';
import DashboardStats from '@/components/admin/DashboardStats';
import DailyChart from '@/components/admin/DailyChart';
import Leaderboard from '@/components/admin/Leaderboard';
import PaymentMethodChart from '@/components/admin/PaymentMethodChart';
import { resolveLocale } from '@/lib/locale';

interface DashboardData {
  summary: {
    today: { amount: number; orderCount: number; paidCount: number };
    total: { amount: number; orderCount: number; paidCount: number };
    subscriptionToday?: { amount: number; orderCount: number; paidCount: number };
    subscriptionTotal?: { amount: number; orderCount: number; paidCount: number };
    successRate: number;
    avgAmount: number;
  };
  dailySeries: { date: string; amount: number; count: number }[];
  leaderboard: {
    userId: number;
    userName: string | null;
    userEmail: string | null;
    totalAmount: number;
    orderCount: number;
  }[];
  paymentMethods: { paymentType: string; amount: number; count: number; percentage: number }[];
  meta: { days: number; generatedAt: string };
}

const DAYS_OPTIONS = [7, 30, 90] as const;

function DashboardContent() {
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
          loadFailed: 'Failed to load data',
          title: 'Dashboard',
          subtitle: 'Recharge order analytics and insights',
          daySuffix: 'd',
          refresh: 'Refresh',
          loading: 'Loading...',
        }
      : {
          missingToken: '缺少管理员凭证',
          missingTokenHint: '请从 Sub2API 平台正确访问管理页面',
          invalidToken: '管理员凭证无效',
          requestFailed: '请求失败',
          loadFailed: '加载数据失败',
          title: '数据概览',
          subtitle: '充值订单统计与分析',
          daySuffix: '天',
          refresh: '刷新',
          loading: '加载中...',
        };

  const [days, setDays] = useState<number>(30);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/dashboard?token=${encodeURIComponent(token)}&days=${days}`);
      if (!res.ok) {
        if (res.status === 401) {
          setError(text.invalidToken);
          return;
        }
        throw new Error(text.requestFailed);
      }
      setData(await res.json());
    } catch {
      setError(text.loadFailed);
    } finally {
      setLoading(false);
    }
  }, [token, days]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (!token) {
    return (
      <div className={`flex min-h-screen items-center justify-center p-4 ${isDark ? 'bg-slate-950' : 'bg-slate-50'}`}>
        <div className="text-center text-red-500">
          <p className="text-lg font-medium">{text.missingToken}</p>
          <p className={`mt-2 text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{text.missingTokenHint}</p>
        </div>
      </div>
    );
  }

  const btnBase = [
    'inline-flex items-center rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
    isDark
      ? 'border-slate-600 text-slate-200 hover:bg-slate-800'
      : 'border-slate-300 text-slate-700 hover:bg-slate-100',
  ].join(' ');

  const btnActive = [
    'inline-flex items-center rounded-lg px-3 py-1.5 text-xs font-medium',
    isDark ? 'bg-indigo-500/30 text-indigo-200 ring-1 ring-indigo-400/40' : 'bg-blue-600 text-white',
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
          {DAYS_OPTIONS.map((d) => (
            <button key={d} type="button" onClick={() => setDays(d)} className={days === d ? btnActive : btnBase}>
              {d}
              {text.daySuffix}
            </button>
          ))}
          <button type="button" onClick={fetchData} className={btnBase}>
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

      {loading ? (
        <div className={`py-24 text-center ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>{text.loading}</div>
      ) : data ? (
        <div className="space-y-6">
          <DashboardStats summary={data.summary} dark={isDark} locale={locale} />
          <DailyChart data={data.dailySeries} dark={isDark} locale={locale} />
          <div className="grid gap-6 lg:grid-cols-2">
            <Leaderboard data={data.leaderboard} dark={isDark} locale={locale} />
            <PaymentMethodChart data={data.paymentMethods} dark={isDark} locale={locale} />
          </div>
        </div>
      ) : null}
    </PayPageLayout>
  );
}

function DashboardPageFallback() {
  const searchParams = useSearchParams();
  const locale = resolveLocale(searchParams.get('lang'));

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-slate-500">{locale === 'en' ? 'Loading...' : '加载中...'}</div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardPageFallback />}>
      <DashboardContent />
    </Suspense>
  );
}
