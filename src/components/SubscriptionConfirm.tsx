'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import type { Locale } from '@/lib/locale';
import { pickLocaleText } from '@/lib/locale';
import { getPaymentTypeLabel, getPaymentIconSrc } from '@/lib/pay-utils';
import type { PlanInfo } from '@/components/SubscriptionPlanCard';
import { formatValidityLabel } from '@/lib/subscription-utils';

interface SubscriptionConfirmProps {
  plan: PlanInfo;
  paymentTypes: string[];
  onBack: () => void;
  onSubmit: (paymentType: string) => void;
  loading: boolean;
  isDark: boolean;
  locale: Locale;
}

export default function SubscriptionConfirm({
  plan,
  paymentTypes,
  onBack,
  onSubmit,
  loading,
  isDark,
  locale,
}: SubscriptionConfirmProps) {
  const [selectedPayment, setSelectedPayment] = useState(paymentTypes[0] || '');

  const periodLabel = formatValidityLabel(plan.validityDays, plan.validityUnit ?? 'day', locale);

  const handleSubmit = () => {
    if (selectedPayment && !loading) {
      onSubmit(selectedPayment);
    }
  };

  return (
    <div className="mx-auto max-w-lg space-y-6">
      {/* Back link */}
      <button
        type="button"
        onClick={onBack}
        className={[
          'flex items-center gap-1 text-sm transition-colors',
          isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-700',
        ].join(' ')}
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        {pickLocaleText(locale, '返回套餐页面', 'Back to Plans')}
      </button>

      {/* Title */}
      <h2 className={['text-xl font-semibold', isDark ? 'text-slate-100' : 'text-slate-900'].join(' ')}>
        {pickLocaleText(locale, '确认订单', 'Confirm Order')}
      </h2>

      {/* Plan info card */}
      <div
        className={[
          'rounded-xl border p-4',
          isDark ? 'border-slate-700 bg-slate-800/80' : 'border-slate-200 bg-slate-50',
        ].join(' ')}
      >
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={['text-base font-semibold', isDark ? 'text-slate-100' : 'text-slate-900'].join(' ')}>
              {plan.name}
            </span>
            <span
              className={[
                'rounded-full px-2 py-0.5 text-xs font-medium',
                isDark ? 'bg-emerald-900/40 text-emerald-300' : 'bg-emerald-50 text-emerald-700',
              ].join(' ')}
            >
              {periodLabel}
            </span>
          </div>
        </div>
        {plan.features.length > 0 && (
          <ul className="space-y-1">
            {plan.features.map((feature) => (
              <li key={feature} className={['flex items-center gap-1.5 text-sm', isDark ? 'text-slate-400' : 'text-slate-500'].join(' ')}>
                <svg className="h-3.5 w-3.5 shrink-0 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                {feature}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Payment method selector */}
      <div>
        <label className={['mb-2 block text-sm font-medium', isDark ? 'text-slate-200' : 'text-slate-700'].join(' ')}>
          {pickLocaleText(locale, '支付方式', 'Payment Method')}
        </label>
        <div className="space-y-2">
          {paymentTypes.map((type) => {
            const isSelected = selectedPayment === type;
            const iconSrc = getPaymentIconSrc(type);
            return (
              <button
                key={type}
                type="button"
                onClick={() => setSelectedPayment(type)}
                className={[
                  'flex w-full items-center gap-3 rounded-xl border-2 px-4 py-3 text-left transition-all',
                  isSelected
                    ? 'border-emerald-500 ring-1 ring-emerald-500/30'
                    : isDark
                      ? 'border-slate-700 hover:border-slate-600'
                      : 'border-slate-200 hover:border-slate-300',
                  isSelected
                    ? isDark
                      ? 'bg-emerald-950/30'
                      : 'bg-emerald-50/50'
                    : isDark
                      ? 'bg-slate-800/60'
                      : 'bg-white',
                ].join(' ')}
              >
                {/* Radio indicator */}
                <span
                  className={[
                    'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2',
                    isSelected ? 'border-emerald-500' : isDark ? 'border-slate-600' : 'border-slate-300',
                  ].join(' ')}
                >
                  {isSelected && <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />}
                </span>

                {/* Icon */}
                {iconSrc && (
                  <Image src={iconSrc} alt="" width={24} height={24} className="h-6 w-6 shrink-0 object-contain" />
                )}

                {/* Label */}
                <span className={['text-sm font-medium', isDark ? 'text-slate-200' : 'text-slate-700'].join(' ')}>
                  {getPaymentTypeLabel(type, locale)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Amount to pay */}
      <div
        className={[
          'flex items-center justify-between rounded-xl border px-4 py-3',
          isDark ? 'border-slate-700 bg-slate-800/60' : 'border-slate-200 bg-slate-50',
        ].join(' ')}
      >
        <span className={['text-sm font-medium', isDark ? 'text-slate-300' : 'text-slate-600'].join(' ')}>
          {pickLocaleText(locale, '应付金额', 'Amount Due')}
        </span>
        <span className="text-xl font-bold text-emerald-500">¥{plan.price}</span>
      </div>

      {/* Submit button */}
      <button
        type="button"
        disabled={!selectedPayment || loading}
        onClick={handleSubmit}
        className={[
          'w-full rounded-xl py-3 text-sm font-bold text-white transition-colors',
          selectedPayment && !loading
            ? 'bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700'
            : isDark
              ? 'cursor-not-allowed bg-slate-700 text-slate-400'
              : 'cursor-not-allowed bg-slate-200 text-slate-400',
        ].join(' ')}
      >
        {loading
          ? pickLocaleText(locale, '处理中...', 'Processing...')
          : pickLocaleText(locale, '立即购买', 'Buy Now')}
      </button>
    </div>
  );
}
