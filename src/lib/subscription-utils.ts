export type ValidityUnit = 'day' | 'week' | 'month';

/**
 * 根据数值和单位计算实际有效天数。
 * - day: 直接返回
 * - week: value * 7
 * - month: 从 fromDate 到 value 个月后同一天的天数差
 */
export function computeValidityDays(value: number, unit: ValidityUnit, fromDate?: Date): number {
  if (unit === 'day') return value;
  if (unit === 'week') return value * 7;

  // month: 计算到 value 个月后同一天的天数差
  const from = fromDate ?? new Date();
  const target = new Date(from);
  target.setMonth(target.getMonth() + value);
  return Math.round((target.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * 智能格式化有效期显示文本。
 * - unit=month, value=1 → 包月 / Monthly
 * - unit=month, value=3 → 包3月 / 3 Months
 * - unit=week, value=2 → 包2周 / 2 Weeks
 * - unit=day, value=30 → 包月 / Monthly (特殊处理)
 * - unit=day, value=90 → 包90天 / 90 Days
 */
export function formatValidityLabel(
  value: number,
  unit: ValidityUnit,
  locale: 'zh' | 'en',
): string {
  if (unit === 'month') {
    if (value === 1) return locale === 'zh' ? '包月' : 'Monthly';
    return locale === 'zh' ? `包${value}月` : `${value} Months`;
  }
  if (unit === 'week') {
    if (value === 1) return locale === 'zh' ? '包周' : 'Weekly';
    return locale === 'zh' ? `包${value}周` : `${value} Weeks`;
  }
  // day
  if (value === 30) return locale === 'zh' ? '包月' : 'Monthly';
  return locale === 'zh' ? `包${value}天` : `${value} Days`;
}

/**
 * 智能格式化有效期后缀（用于价格展示）。
 * - unit=month, value=1 → /月 / /mo
 * - unit=month, value=3 → /3月 / /3mo
 * - unit=week, value=2 → /2周 / /2wk
 * - unit=day, value=30 → /月 / /mo
 * - unit=day, value=90 → /90天 / /90d
 */
export function formatValiditySuffix(
  value: number,
  unit: ValidityUnit,
  locale: 'zh' | 'en',
): string {
  if (unit === 'month') {
    if (value === 1) return locale === 'zh' ? '/月' : '/mo';
    return locale === 'zh' ? `/${value}月` : `/${value}mo`;
  }
  if (unit === 'week') {
    if (value === 1) return locale === 'zh' ? '/周' : '/wk';
    return locale === 'zh' ? `/${value}周` : `/${value}wk`;
  }
  // day
  if (value === 30) return locale === 'zh' ? '/月' : '/mo';
  return locale === 'zh' ? `/${value}天` : `/${value}d`;
}

/**
 * 格式化有效期列表展示文本（管理后台表格用）。
 * - unit=day → "30 天"
 * - unit=week → "2 周"
 * - unit=month → "1 月"
 */
export function formatValidityDisplay(
  value: number,
  unit: ValidityUnit,
  locale: 'zh' | 'en',
): string {
  const unitLabels: Record<ValidityUnit, { zh: string; en: string }> = {
    day: { zh: '天', en: 'day(s)' },
    week: { zh: '周', en: 'week(s)' },
    month: { zh: '月', en: 'month(s)' },
  };
  const label = locale === 'zh' ? unitLabels[unit].zh : unitLabels[unit].en;
  return `${value} ${label}`;
}
