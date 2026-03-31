import React from 'react';
import type { Locale } from '@/lib/locale';

interface PayPageLayoutProps {
  isDark: boolean;
  isEmbedded?: boolean;
  maxWidth?: 'sm' | 'lg' | 'full';
  title: string;
  subtitle: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  locale?: Locale;
}

export default function PayPageLayout({
  isDark,
  isEmbedded = false,
  maxWidth = 'full',
  title,
  subtitle,
  actions,
  children,
  locale = 'zh',
}: PayPageLayoutProps) {
  const maxWidthClass = maxWidth === 'sm' ? 'max-w-lg' : maxWidth === 'lg' ? 'max-w-6xl' : '';

  return (
    <div
      data-theme={isDark ? 'dark' : 'light'}
      className={[
        'relative w-full overflow-hidden',
        isEmbedded ? 'min-h-screen p-2' : 'min-h-screen p-3 sm:p-4',
        isDark ? 'bg-slate-950 text-slate-100' : 'bg-slate-100 text-slate-900',
      ].join(' ')}
    >
      {!isEmbedded && (
        <>
          <div
            className={[
              'pointer-events-none absolute -left-20 -top-20 h-56 w-56 rounded-full blur-3xl',
              isDark ? 'bg-indigo-500/25' : 'bg-sky-300/35',
            ].join(' ')}
          />
          <div
            className={[
              'pointer-events-none absolute -right-24 bottom-0 h-64 w-64 rounded-full blur-3xl',
              isDark ? 'bg-cyan-400/20' : 'bg-indigo-200/45',
            ].join(' ')}
          />
        </>
      )}

      <div
        className={[
          'relative mx-auto w-full rounded-3xl border p-4 sm:p-6',
          maxWidthClass,
          isDark
            ? 'border-slate-700/70 bg-slate-900/85 shadow-2xl shadow-black/35'
            : 'border-slate-200/90 bg-white/95 shadow-2xl shadow-slate-300/45',
          isEmbedded ? '' : 'mt-6',
        ].join(' ')}
      >
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div
              className={[
                'mb-2 inline-flex items-center rounded-full px-3 py-1 text-[11px] font-medium',
                isDark ? 'bg-indigo-500/20 text-indigo-200' : 'bg-indigo-50 text-indigo-700',
              ].join(' ')}
            >
              {locale === 'en' ? 'Sub2API Secure Pay' : 'Sub2API 安全支付'}
            </div>
            <h1
              className={['text-2xl font-semibold tracking-tight', isDark ? 'text-slate-100' : 'text-slate-900'].join(
                ' ',
              )}
            >
              {title}
            </h1>
            <p className={['mt-1 text-sm', isDark ? 'text-slate-400' : 'text-slate-500'].join(' ')}>{subtitle}</p>
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>

        {children}
      </div>
    </div>
  );
}
