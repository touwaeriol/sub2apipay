'use client';

import { useSearchParams, usePathname } from 'next/navigation';
import { Suspense } from 'react';
import { resolveLocale } from '@/lib/locale';

const NAV_ITEMS = [
  { path: '/admin', label: { zh: '订单管理', en: 'Orders' } },
  { path: '/admin/dashboard', label: { zh: '数据概览', en: 'Dashboard' } },
  { path: '/admin/channels', label: { zh: '渠道管理', en: 'Channels' } },
  { path: '/admin/subscriptions', label: { zh: '订阅管理', en: 'Subscriptions' } },
];

function AdminNav() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const token = searchParams.get('token') || '';
  const theme = searchParams.get('theme') || 'light';
  const uiMode = searchParams.get('ui_mode') || 'standalone';
  const locale = resolveLocale(searchParams.get('lang'));
  const isDark = theme === 'dark';

  const buildUrl = (path: string) => {
    const params = new URLSearchParams();
    if (token) params.set('token', token);
    params.set('theme', theme);
    params.set('ui_mode', uiMode);
    if (locale !== 'zh') params.set('lang', locale);
    return `${path}?${params.toString()}`;
  };

  const isActive = (navPath: string) => {
    if (navPath === '/admin') return pathname === '/admin';
    return pathname.startsWith(navPath);
  };

  return (
    <nav
      className={[
        'mb-4 flex flex-wrap gap-1 rounded-xl border p-1',
        isDark ? 'border-slate-700 bg-slate-800/70' : 'border-slate-200 bg-slate-100/90',
      ].join(' ')}
    >
      {NAV_ITEMS.map((item) => (
        <a
          key={item.path}
          href={buildUrl(item.path)}
          className={[
            'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
            isActive(item.path)
              ? isDark
                ? 'bg-indigo-500/30 text-indigo-100 ring-1 ring-indigo-300/35'
                : 'bg-white text-slate-900 ring-1 ring-slate-300 shadow-sm'
              : isDark
                ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/70',
          ].join(' ')}
        >
          {item.label[locale]}
        </a>
      ))}
    </nav>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense>
      <AdminNav />
      {children}
    </Suspense>
  );
}
