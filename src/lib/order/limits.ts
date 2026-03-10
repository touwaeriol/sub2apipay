import { prisma } from '@/lib/db';
import { getEnv } from '@/lib/config';
import { ORDER_STATUS } from '@/lib/constants';
import { initPaymentProviders, paymentRegistry } from '@/lib/payment';
import { getMethodFeeRate } from './fee';
import { getBizDayStartUTC } from '@/lib/time/biz-day';

/**
 * 获取指定支付渠道的每日全平台限额（0 = 不限制）。
 * 优先级：环境变量显式配置 > provider 默认值 > process.env 兜底 > 0
 */
export function getMethodDailyLimit(paymentType: string): number {
  const env = getEnv();
  const key = `MAX_DAILY_AMOUNT_${paymentType.toUpperCase()}` as keyof typeof env;
  const val = env[key];
  if (typeof val === 'number') return val;

  initPaymentProviders();
  const providerDefault = paymentRegistry.getDefaultLimit(paymentType);
  if (providerDefault?.dailyMax !== undefined) return providerDefault.dailyMax;

  const raw = process.env[`MAX_DAILY_AMOUNT_${paymentType.toUpperCase()}`];
  if (raw !== undefined) {
    const num = Number(raw);
    return Number.isFinite(num) && num >= 0 ? num : 0;
  }
  return 0;
}

/**
 * 获取指定支付渠道的单笔限额（0 = 使用全局 MAX_RECHARGE_AMOUNT）。
 * 优先级：process.env MAX_SINGLE_AMOUNT_* > provider 默认值 > 0
 */
export function getMethodSingleLimit(paymentType: string): number {
  const raw = process.env[`MAX_SINGLE_AMOUNT_${paymentType.toUpperCase()}`];
  if (raw !== undefined) {
    const num = Number(raw);
    if (Number.isFinite(num) && num >= 0) return num;
  }

  initPaymentProviders();
  const providerDefault = paymentRegistry.getDefaultLimit(paymentType);
  if (providerDefault?.singleMax !== undefined) return providerDefault.singleMax;

  return 0;
}

export interface MethodLimitStatus {
  dailyLimit: number;
  used: number;
  remaining: number | null;
  available: boolean;
  singleMax: number;
  feeRate: number;
}

/**
 * 批量查询多个支付渠道的今日使用情况。
 * 一次 DB groupBy 完成，调用方按需传入渠道列表。
 */
export async function queryMethodLimits(paymentTypes: string[]): Promise<Record<string, MethodLimitStatus>> {
  const todayStart = getBizDayStartUTC();

  const usageRows = await prisma.order.groupBy({
    by: ['paymentType'],
    where: {
      paymentType: { in: paymentTypes },
      status: { in: [ORDER_STATUS.PAID, ORDER_STATUS.RECHARGING, ORDER_STATUS.COMPLETED] },
      paidAt: { gte: todayStart },
    },
    _sum: { amount: true },
  });

  const usageMap = Object.fromEntries(usageRows.map((row) => [row.paymentType, Number(row._sum.amount ?? 0)]));

  const result: Record<string, MethodLimitStatus> = {};
  for (const type of paymentTypes) {
    const dailyLimit = getMethodDailyLimit(type);
    const singleMax = getMethodSingleLimit(type);
    const feeRate = getMethodFeeRate(type);
    const used = usageMap[type] ?? 0;
    const remaining = dailyLimit > 0 ? Math.max(0, dailyLimit - used) : null;
    result[type] = {
      dailyLimit,
      used,
      remaining,
      available: dailyLimit === 0 || used < dailyLimit,
      singleMax,
      feeRate,
    };
  }
  return result;
}
