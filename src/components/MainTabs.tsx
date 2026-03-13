'use client';

import React from 'react';
import type { Locale } from '@/lib/locale';
import { pickLocaleText } from '@/lib/locale';

interface MainTabsProps {
  activeTab: 'topup' | 'subscribe';
  onTabChange: (tab: 'topup' | 'subscribe') => void;
  showSubscribeTab: boolean;
  showTopUpTab?: boolean;
  isDark: boolean;
  locale: Locale;
}

export default function MainTabs({ activeTab, onTabChange, showSubscribeTab, showTopUpTab = true, isDark, locale }: MainTabsProps) {
  if (!showSubscribeTab) return null;

  const tabs: { key: 'topup' | 'subscribe'; label: string }[] = [];
  if (showTopUpTab) {
    tabs.push({ key: 'topup', label: pickLocaleText(locale, '余额充值', 'Top Up') });
  }
  tabs.push({ key: 'subscribe', label: pickLocaleText(locale, '套餐订阅', 'Subscription') });

  // 只有一个 tab 时不显示切换器
  if (tabs.length <= 1) return null;

  return (
    <div
      className={[
        'inline-flex rounded-xl p-1',
        isDark ? 'bg-slate-800' : 'bg-slate-100',
      ].join(' ')}
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.key;
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onTabChange(tab.key)}
            className={[
              'rounded-lg px-5 py-2 text-sm font-medium transition-all',
              isActive
                ? isDark
                  ? 'bg-slate-700 text-slate-100 shadow-sm'
                  : 'bg-white text-slate-900 shadow-sm'
                : isDark
                  ? 'text-slate-400 hover:text-slate-200'
                  : 'text-slate-500 hover:text-slate-700',
            ].join(' ')}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
