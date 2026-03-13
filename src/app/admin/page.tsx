'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import PayPageLayout from '@/components/PayPageLayout';
import { resolveLocale } from '@/lib/locale';

const MODULES = [
  {
    path: '/admin/dashboard',
    label: { zh: '数据概览', en: 'Dashboard' },
    desc: { zh: '收入统计与订单趋势', en: 'Revenue statistics and order trends' },
    icon: (
      <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
      </svg>
    ),
  },
  {
    path: '/admin/orders',
    label: { zh: '订单管理', en: 'Order Management' },
    desc: { zh: '查看和管理所有充值订单', en: 'View and manage all recharge orders' },
    icon: (
      <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15a2.25 2.25 0 012.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
      </svg>
    ),
  },
  {
    path: '/admin/channels',
    label: { zh: '渠道管理', en: 'Channel Management' },
    desc: { zh: '配置 API 渠道与倍率', en: 'Configure API channels and rate multipliers' },
    icon: (
      <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 13.5V3.75m0 9.75a1.5 1.5 0 010 3m0-3a1.5 1.5 0 000 3m-3.75 0h7.5m-7.5 0H3m4.5 0a1.5 1.5 0 010 3m0-3a1.5 1.5 0 000 3m7.5-12a1.5 1.5 0 010 3m0-3a1.5 1.5 0 000 3m-3.75 0h7.5m-7.5 0H3m4.5 0a1.5 1.5 0 010 3m0-3a1.5 1.5 0 000 3M18 13.5V3.75m0 9.75a1.5 1.5 0 010 3m0-3a1.5 1.5 0 000 3m-3.75 0h7.5M14.25 16.5H21m-4.5 0a1.5 1.5 0 010 3m0-3a1.5 1.5 0 000 3" />
      </svg>
    ),
  },
  {
    path: '/admin/subscriptions',
    label: { zh: '订阅管理', en: 'Subscription Management' },
    desc: { zh: '管理订阅套餐与用户订阅', en: 'Manage subscription plans and user subscriptions' },
    icon: (
      <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
      </svg>
    ),
  },
];

function AdminOverviewContent() {
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
          title: 'Admin Panel',
          subtitle: 'Manage orders, analytics, channels and subscriptions',
        }
      : {
          missingToken: '缺少管理员凭证',
          missingTokenHint: '请从 Sub2API 平台正确访问管理页面',
          title: '管理后台',
          subtitle: '订单、数据、渠道与订阅的统一管理入口',
        };

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

  const navParams = new URLSearchParams();
  if (token) navParams.set('token', token);
  if (locale === 'en') navParams.set('lang', 'en');
  if (isDark) navParams.set('theme', 'dark');
  if (isEmbedded) navParams.set('ui_mode', 'embedded');

  return (
    <PayPageLayout isDark={isDark} isEmbedded={isEmbedded} maxWidth="full" title={text.title} subtitle={text.subtitle} locale={locale}>
      <div className="grid gap-4 sm:grid-cols-2">
        {MODULES.map((mod) => (
          <a
            key={mod.path}
            href={`${mod.path}?${navParams}`}
            className={[
              'group flex items-start gap-4 rounded-xl border p-5 transition-all',
              isDark
                ? 'border-slate-700 bg-slate-800/70 hover:border-indigo-500/50 hover:bg-slate-800'
                : 'border-slate-200 bg-white shadow-sm hover:border-blue-300 hover:shadow-md',
            ].join(' ')}
          >
            <div
              className={[
                'flex h-12 w-12 shrink-0 items-center justify-center rounded-lg transition-colors',
                isDark
                  ? 'bg-slate-700 text-slate-300 group-hover:bg-indigo-500/20 group-hover:text-indigo-300'
                  : 'bg-slate-100 text-slate-500 group-hover:bg-blue-50 group-hover:text-blue-600',
              ].join(' ')}
            >
              {mod.icon}
            </div>
            <div className="min-w-0 flex-1">
              <h3
                className={[
                  'text-base font-semibold transition-colors',
                  isDark ? 'text-slate-100 group-hover:text-indigo-200' : 'text-slate-900 group-hover:text-blue-700',
                ].join(' ')}
              >
                {mod.label[locale]}
              </h3>
              <p className={`mt-1 text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{mod.desc[locale]}</p>
            </div>
            <svg
              className={[
                'mt-1 h-5 w-5 shrink-0 transition-transform group-hover:translate-x-0.5',
                isDark ? 'text-slate-600' : 'text-slate-300',
              ].join(' ')}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </a>
        ))}
      </div>
    </PayPageLayout>
  );
}

function AdminOverviewFallback() {
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
    <Suspense fallback={<AdminOverviewFallback />}>
      <AdminOverviewContent />
    </Suspense>
  );
}
