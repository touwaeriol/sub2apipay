import { prisma } from '@/lib/db';
import { ORDER_STATUS } from '@/lib/constants';
import { ensureDBProviders, paymentRegistry } from '@/lib/payment';
import { getMethodFeeRate } from './fee';
import { getBizDayStartUTC } from '@/lib/time/biz-day';
import { getSystemConfig } from '@/lib/system-config';

/**
 * 获取指定支付渠道的每日全平台限额（0 = 不限制）。
 * 覆盖模式同 /api/user：getSystemConfig（DB → process.env） → provider 默认值。
 * 当 OVERRIDE_ENV_ENABLED=true 且无显式渠道配置时，跳过 provider 默认值。
 */
export async function getMethodDailyLimit(paymentType: string): Promise<number> {
  const configVal = await getSystemConfig(`MAX_DAILY_AMOUNT_${paymentType.toUpperCase()}`);
  if (configVal !== undefined) {
    const num = Number(configVal);
    if (Number.isFinite(num) && num >= 0) return num;
  }

  // 开启了在线配置覆盖 → 跳过 provider 硬编码默认值，使用全局限额
  const overrideEnabled = await getSystemConfig('OVERRIDE_ENV_ENABLED');
  if (overrideEnabled === 'true') return 0;

  // Provider 默认值（未开启在线配置时兜底）
  await ensureDBProviders();
  const providerDefault = paymentRegistry.getDefaultLimit(paymentType);
  if (providerDefault?.dailyMax !== undefined) return providerDefault.dailyMax;

  return 0;
}

/**
 * 获取指定支付渠道的单笔限额（0 = 使用全局 MAX_RECHARGE_AMOUNT）。
 * 覆盖模式同 /api/user：getSystemConfig（DB → process.env） → provider 默认值。
 * 当 OVERRIDE_ENV_ENABLED=true 且无显式渠道配置时，跳过 provider 默认值。
 */
export async function getMethodSingleLimit(paymentType: string): Promise<number> {
  const configVal = await getSystemConfig(`MAX_SINGLE_AMOUNT_${paymentType.toUpperCase()}`);
  if (configVal !== undefined) {
    const num = Number(configVal);
    if (Number.isFinite(num) && num >= 0) return num;
  }

  // 开启了在线配置覆盖 → 跳过 provider 硬编码默认值，使用全局限额
  const overrideEnabled = await getSystemConfig('OVERRIDE_ENV_ENABLED');
  if (overrideEnabled === 'true') return 0;

  // Provider 默认值（未开启在线配置时兜底）
  await ensureDBProviders();
  const providerDefault = paymentRegistry.getDefaultLimit(paymentType);
  if (providerDefault?.singleMax !== undefined) return providerDefault.singleMax;

  return 0;
}

export interface MethodLimitStatus {
  dailyLimit: number;
  used: number;
  remaining: number | null;
  available: boolean;
  singleMin: number;
  singleMax: number;
  feeRate: number;
}

interface InstanceChannelLimits {
  dailyLimit?: number;
  singleMin?: number;
  singleMax?: number;
}

/**
 * 聚合实例级限额：对每个支付类型，取所有实例中最宽松的单笔范围 + 检查日限额可用性。
 * 当剩余日额度 < 该实例的 singleMin 时，视为该实例不可用。
 */
async function aggregateInstanceLimits(paymentTypes: string[]): Promise<
  Record<
    string,
    {
      singleMin: number;
      singleMax: number;
      allInstancesDailyBlocked: boolean;
      maxRemainingCapacity: number | null;
      hasInstances: boolean;
    }
  >
> {
  const result: Record<
    string,
    {
      singleMin: number;
      singleMax: number;
      allInstancesDailyBlocked: boolean;
      maxRemainingCapacity: number | null;
      hasInstances: boolean;
    }
  > = {};

  const allInstances = await prisma.paymentProviderInstance.findMany({
    where: { enabled: true },
    select: { id: true, limits: true, supportedTypes: true },
  });

  if (allInstances.length === 0) {
    for (const type of paymentTypes) {
      result[type] = {
        singleMin: 0,
        singleMax: 0,
        allInstancesDailyBlocked: false,
        maxRemainingCapacity: null,
        hasInstances: false,
      };
    }
    return result;
  }

  const todayStart = getBizDayStartUTC();

  const usageRows = await prisma.order.groupBy({
    by: ['providerInstanceId'],
    where: {
      providerInstanceId: { in: allInstances.map((i) => i.id) },
      status: { in: [ORDER_STATUS.PAID, ORDER_STATUS.RECHARGING, ORDER_STATUS.COMPLETED] },
      paidAt: { gte: todayStart },
    },
    _sum: { payAmount: true },
  });
  const usageMap = new Map(usageRows.map((r) => [r.providerInstanceId, Number(r._sum.payAmount ?? 0)]));

  for (const type of paymentTypes) {
    const supporting = allInstances.filter((inst) => {
      if (!inst.supportedTypes) return true;
      const types = inst.supportedTypes
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      return types.length === 0 || types.includes(type);
    });

    if (supporting.length === 0) {
      result[type] = {
        singleMin: 0,
        singleMax: 0,
        allInstancesDailyBlocked: false,
        maxRemainingCapacity: null,
        hasInstances: false,
      };
      continue;
    }

    let aggSingleMin = Infinity;
    let aggSingleMax = 0;
    let allBlocked = true;
    let maxRemaining: number | null = null; // 所有可用实例中最大的剩余日额度

    for (const inst of supporting) {
      let channelLimits: InstanceChannelLimits | undefined;
      if (inst.limits) {
        try {
          const parsed = JSON.parse(inst.limits) as Record<string, InstanceChannelLimits>;
          channelLimits = parsed[type];
        } catch {
          /* ignore */
        }
      }

      // 单笔范围：取所有实例中最宽松的范围
      const instMin = channelLimits?.singleMin ?? 0;
      const instMax = channelLimits?.singleMax ?? 0;
      if (instMin > 0 && instMin < aggSingleMin) aggSingleMin = instMin;
      if (instMin === 0) aggSingleMin = 0;
      if (instMax > aggSingleMax) aggSingleMax = instMax;
      if (instMax === 0) aggSingleMax = 0;

      // 日限额：计算剩余容量，判断是否可用
      const instDailyLimit = channelLimits?.dailyLimit;
      if (!instDailyLimit || instDailyLimit <= 0) {
        // 无日限额限制
        allBlocked = false;
        maxRemaining = null; // null 表示至少有一个实例无限额
      } else {
        const used = usageMap.get(inst.id) ?? 0;
        const remaining = Math.max(0, instDailyLimit - used);
        const effectiveMin = instMin > 0 ? instMin : 0;

        if (remaining > effectiveMin) {
          // 剩余额度足够下一单（大于最小单笔）
          allBlocked = false;
          if (maxRemaining !== null) {
            maxRemaining = Math.max(maxRemaining, remaining);
          }
          // maxRemaining === null 时说明已有无限额实例，保持 null
        }
        // remaining <= effectiveMin: 该实例实质不可用，不影响 allBlocked
      }
    }

    if (aggSingleMin === Infinity) aggSingleMin = 0;

    result[type] = {
      singleMin: aggSingleMin,
      singleMax: aggSingleMax,
      allInstancesDailyBlocked: allBlocked,
      maxRemainingCapacity: maxRemaining,
      hasInstances: true,
    };
  }

  return result;
}

/**
 * 批量查询多个支付渠道的今日使用情况。
 * 聚合全局限额 + 实例级限额，一次性返回前端所需的可用性信息。
 */
export async function queryMethodLimits(paymentTypes: string[]): Promise<Record<string, MethodLimitStatus>> {
  const todayStart = getBizDayStartUTC();

  const [usageRows, instanceAgg] = await Promise.all([
    prisma.order.groupBy({
      by: ['paymentType'],
      where: {
        paymentType: { in: paymentTypes },
        status: { in: [ORDER_STATUS.PAID, ORDER_STATUS.RECHARGING, ORDER_STATUS.COMPLETED] },
        paidAt: { gte: todayStart },
      },
      _sum: { amount: true },
    }),
    aggregateInstanceLimits(paymentTypes),
  ]);

  const usageMap = Object.fromEntries(usageRows.map((row) => [row.paymentType, Number(row._sum.amount ?? 0)]));

  const result: Record<string, MethodLimitStatus> = {};
  for (const type of paymentTypes) {
    const globalDailyLimit = await getMethodDailyLimit(type);
    const globalSingleMax = await getMethodSingleLimit(type);
    const feeRate = getMethodFeeRate(type);
    const used = usageMap[type] ?? 0;
    const remaining = globalDailyLimit > 0 ? Math.max(0, globalDailyLimit - used) : null;

    const inst = instanceAgg[type];
    // 全局可用：全局日限额未超
    const globalAvailable = globalDailyLimit === 0 || used < globalDailyLimit;
    // 实例可用：无实例(走环境变量provider) 或 不是所有实例都被日限额阻塞
    const instanceAvailable = !inst?.hasInstances || !inst.allInstancesDailyBlocked;

    // 聚合单笔范围：实例级限额与全局取交集
    const singleMin = inst?.singleMin ?? 0;
    let singleMax = globalSingleMax;
    if (inst?.hasInstances && inst.singleMax > 0) {
      singleMax = singleMax > 0 ? Math.min(singleMax, inst.singleMax) : inst.singleMax;
    }

    // 实例剩余日容量约束：singleMax 不能超过最大剩余容量
    if (inst?.hasInstances && inst.maxRemainingCapacity !== null && inst.maxRemainingCapacity >= 0) {
      singleMax = singleMax > 0 ? Math.min(singleMax, inst.maxRemainingCapacity) : inst.maxRemainingCapacity;
    }

    // 全局剩余日容量约束
    if (remaining !== null && remaining >= 0) {
      singleMax = singleMax > 0 ? Math.min(singleMax, remaining) : remaining;
    }

    // 最终可用性：如果 singleMax < singleMin，该渠道实质不可用
    const effectivelyAvailable = globalAvailable && instanceAvailable && (singleMin === 0 || singleMax >= singleMin);

    result[type] = {
      dailyLimit: globalDailyLimit,
      used,
      remaining,
      available: effectivelyAvailable,
      singleMin,
      singleMax,
      feeRate,
    };
  }
  return result;
}
