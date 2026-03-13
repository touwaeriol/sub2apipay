'use client';

import React from 'react';
import type { Locale } from '@/lib/locale';
import { pickLocaleText } from '@/lib/locale';
import { PlatformBadge, getPlatformStyle } from '@/lib/platform-style';

export interface ChannelInfo {
  id: string;
  groupId: number;
  name: string;
  platform: string;
  rateMultiplier: number;
  description: string | null;
  models: string[];
  features: string[];
}

interface ChannelCardProps {
  channel: ChannelInfo;
  onTopUp: () => void;
  isDark: boolean;
  locale: Locale;
  userBalance?: number;
}

export default function ChannelCard({ channel, onTopUp, isDark, locale }: ChannelCardProps) {
  const usableQuota = (1 / channel.rateMultiplier).toFixed(2);
  const platformStyle = getPlatformStyle(channel.platform);
  const tagCls = isDark ? platformStyle.modelTag.dark : platformStyle.modelTag.light;

  return (
    <div
      className={[
        'flex flex-col rounded-2xl border p-6 transition-shadow hover:shadow-lg',
        isDark ? 'border-slate-700 bg-slate-800/70' : 'border-slate-200 bg-white',
      ].join(' ')}
    >
      {/* Header: Platform badge + Name */}
      <div className="mb-4">
        <div className="mb-3 flex items-center gap-2">
          <PlatformBadge platform={channel.platform} />
          <h3 className={['text-lg font-bold', isDark ? 'text-slate-100' : 'text-slate-900'].join(' ')}>
            {channel.name}
          </h3>
        </div>

        {/* Rate display - prominent */}
        <div className="mb-3">
          <div className="flex items-baseline gap-2">
            <span className={['text-sm', isDark ? 'text-slate-400' : 'text-slate-500'].join(' ')}>
              {pickLocaleText(locale, '当前倍率', 'Rate')}
            </span>
            <div className="flex items-baseline">
              <span className="text-xl font-bold text-emerald-500">1</span>
              <span className={['mx-1.5 text-lg', isDark ? 'text-slate-500' : 'text-slate-400'].join(' ')}>:</span>
              <span className="text-xl font-bold text-emerald-500">{channel.rateMultiplier}</span>
            </div>
          </div>
          <p className={['mt-1 text-sm', isDark ? 'text-slate-400' : 'text-slate-500'].join(' ')}>
            {pickLocaleText(
              locale,
              <>1元可用约<span className="font-medium text-emerald-500">{usableQuota}</span>美元额度</>,
              <>1 CNY ≈ <span className="font-medium text-emerald-500">{usableQuota}</span> USD quota</>,
            )}
          </p>
        </div>

        {/* Description */}
        {channel.description && (
          <p className={['text-sm leading-relaxed', isDark ? 'text-slate-400' : 'text-slate-500'].join(' ')}>
            {channel.description}
          </p>
        )}
      </div>

      {/* Models */}
      {channel.models.length > 0 && (
        <div className="mb-4">
          <p className={['mb-2 text-xs', isDark ? 'text-slate-500' : 'text-slate-400'].join(' ')}>
            {pickLocaleText(locale, '支持模型', 'Supported Models')}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {channel.models.map((model) => (
              <span
                key={model}
                className={[
                  'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs',
                  tagCls,
                ].join(' ')}
              >
                <span className={['h-1.5 w-1.5 rounded-full', platformStyle.modelTag.dot].join(' ')} />
                {model}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Features */}
      {channel.features.length > 0 && (
        <div className="mb-5">
          <p className={['mb-2 text-xs', isDark ? 'text-slate-500' : 'text-slate-400'].join(' ')}>
            {pickLocaleText(locale, '功能特性', 'Features')}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {channel.features.map((feature) => (
              <span
                key={feature}
                className={[
                  'rounded-md px-2 py-1 text-xs',
                  isDark ? 'bg-emerald-500/10 text-emerald-400' : 'bg-emerald-50 text-emerald-700',
                ].join(' ')}
              >
                {feature}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Spacer to push button to bottom */}
      <div className="flex-1" />

      {/* Top-up button */}
      <button
        type="button"
        onClick={onTopUp}
        className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-600 active:bg-emerald-700"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
        {pickLocaleText(locale, '立即充值', 'Top Up Now')}
      </button>
    </div>
  );
}
