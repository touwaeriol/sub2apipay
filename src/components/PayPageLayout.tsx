import React from 'react';

interface PayPageLayoutProps {
  isDark: boolean;
  isEmbedded?: boolean;
  maxWidth?: 'sm' | 'full';
  title: string;
  subtitle: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}

export default function PayPageLayout({
  isDark,
  isEmbedded = false,
  maxWidth = 'full',
  title,
  subtitle,
  actions,
  children,
}: PayPageLayoutProps) {
  return (
    <div
      className={[
        'relative min-h-screen w-full overflow-hidden p-3 sm:p-4',
        isDark ? 'bg-slate-950 text-slate-100' : 'bg-slate-100 text-slate-900',
      ].join(' ')}
    >
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

      <div
        className={[
          'relative mx-auto w-full rounded-3xl border p-4 sm:p-6',
          maxWidth === 'sm' ? 'max-w-lg' : 'max-w-6xl',
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
              Sub2API Secure Pay
            </div>
            <h1
              className={[
                'text-2xl font-semibold tracking-tight',
                isDark ? 'text-slate-100' : 'text-slate-900',
              ].join(' ')}
            >
              {title}
            </h1>
            <p className={['mt-1 text-sm', isDark ? 'text-slate-400' : 'text-slate-500'].join(' ')}>
              {subtitle}
            </p>
          </div>
          {actions && (
            <div className="flex items-center gap-2">
              {actions}
            </div>
          )}
        </div>

        {children}
      </div>
    </div>
  );
}
