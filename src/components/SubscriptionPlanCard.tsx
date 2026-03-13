'use client';

import React from 'react';
import type { Locale } from '@/lib/locale';
import { pickLocaleText } from '@/lib/locale';
import { formatValidityLabel, formatValiditySuffix, type ValidityUnit } from '@/lib/subscription-utils';

export interface PlanInfo {
  id: string;
  groupId: number;
  name: string;
  price: number;
  originalPrice: number | null;
  validityDays: number;
  validityUnit?: ValidityUnit;
  features: string[];
  description: string | null;
  limits: {
    daily_limit_usd: number | null;
    weekly_limit_usd: number | null;
    monthly_limit_usd: number | null;
  } | null;
}

interface SubscriptionPlanCardProps {
  plan: PlanInfo;
  onSubscribe: (planId: string) => void;
  isDark: boolean;
  locale: Locale;
}

export default function SubscriptionPlanCard({ plan, onSubscribe, isDark, locale }: SubscriptionPlanCardProps) {
  const unit = plan.validityUnit ?? 'day';
  const periodLabel = formatValidityLabel(plan.validityDays, unit, locale);
  const periodSuffix = formatValiditySuffix(plan.validityDays, unit, locale);

  return (
    <div
      className={[
        'flex flex-col rounded-2xl border p-5 transition-shadow hover:shadow-lg',
        isDark ? 'border-slate-700 bg-slate-800/70' : 'border-slate-200 bg-white',
      ].join(' ')}
    >
      {/* Name + Period badge */}
      <div className="mb-3 flex items-center gap-2">
        <h3 className={['text-lg font-semibold', isDark ? 'text-slate-100' : 'text-slate-900'].join(' ')}>
          {plan.name}
        </h3>
        <span
          className={[
            'rounded-full px-2.5 py-0.5 text-xs font-medium',
            isDark ? 'bg-emerald-900/40 text-emerald-300' : 'bg-emerald-50 text-emerald-700',
          ].join(' ')}
        >
          {periodLabel}
        </span>
      </div>

      {/* Price */}
      <div className="mb-4 flex items-baseline gap-2">
        {plan.originalPrice !== null && (
          <span className={['text-sm line-through', isDark ? 'text-slate-500' : 'text-slate-400'].join(' ')}>
            ¥{plan.originalPrice}
          </span>
        )}
        <span className="text-3xl font-bold text-emerald-500">¥{plan.price}</span>
        <span className={['text-sm', isDark ? 'text-slate-400' : 'text-slate-500'].join(' ')}>
          {periodSuffix}
        </span>
      </div>

      {/* Description */}
      {plan.description && (
        <p className={['mb-3 text-sm leading-relaxed', isDark ? 'text-slate-400' : 'text-slate-500'].join(' ')}>
          {plan.description}
        </p>
      )}

      {/* Features */}
      {plan.features.length > 0 && (
        <ul className="mb-4 space-y-2">
          {plan.features.map((feature) => (
            <li key={feature} className={['flex items-start gap-2 text-sm', isDark ? 'text-slate-300' : 'text-slate-600'].join(' ')}>
              <svg className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              {feature}
            </li>
          ))}
        </ul>
      )}

      {/* Limits */}
      {plan.limits && (
        <div className={['mb-4 rounded-lg p-3 text-xs', isDark ? 'bg-slate-900/60 text-slate-400' : 'bg-slate-50 text-slate-500'].join(' ')}>
          <p className="mb-1 font-medium uppercase tracking-wide">
            {pickLocaleText(locale, '用量限制', 'Usage Limits')}
          </p>
          <div className="space-y-0.5">
            {plan.limits.daily_limit_usd !== null && (
              <p>{pickLocaleText(locale, `每日: $${plan.limits.daily_limit_usd}`, `Daily: $${plan.limits.daily_limit_usd}`)}</p>
            )}
            {plan.limits.weekly_limit_usd !== null && (
              <p>{pickLocaleText(locale, `每周: $${plan.limits.weekly_limit_usd}`, `Weekly: $${plan.limits.weekly_limit_usd}`)}</p>
            )}
            {plan.limits.monthly_limit_usd !== null && (
              <p>{pickLocaleText(locale, `每月: $${plan.limits.monthly_limit_usd}`, `Monthly: $${plan.limits.monthly_limit_usd}`)}</p>
            )}
          </div>
        </div>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Subscribe button */}
      <button
        type="button"
        onClick={() => onSubscribe(plan.id)}
        className="mt-2 w-full rounded-xl bg-emerald-500 py-2.5 text-sm font-bold text-white transition-colors hover:bg-emerald-600 active:bg-emerald-700"
      >
        {pickLocaleText(locale, '立即开通', 'Subscribe Now')}
      </button>
    </div>
  );
}
