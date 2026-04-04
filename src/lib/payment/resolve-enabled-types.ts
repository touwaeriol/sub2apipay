import { getSystemConfig } from '@/lib/system-config';
import { ensureDBProviders, paymentRegistry } from '@/lib/payment';

/**
 * 根据 ENABLED_PAYMENT_TYPES 配置过滤支持的支付类型。
 * configuredTypes 为 undefined 或空字符串时回退到全部支持类型。
 */
export function resolveEnabledPaymentTypes(supportedTypes: string[], configuredTypes: string | undefined): string[] {
  if (configuredTypes === undefined) return supportedTypes;

  const configuredTypeSet = new Set(
    configuredTypes
      .split(',')
      .map((type) => type.trim())
      .filter(Boolean),
  );
  if (configuredTypeSet.size === 0) return supportedTypes;

  return supportedTypes.filter((type) => configuredTypeSet.has(type));
}

/**
 * 获取当前启用的支付类型（结合 registry 支持类型 + 数据库 ENABLED_PAYMENT_TYPES 配置）。
 */
export async function getEnabledPaymentTypes(): Promise<string[]> {
  await ensureDBProviders();
  const supportedTypes = paymentRegistry.getSupportedTypes();
  const configuredTypes = await getSystemConfig('ENABLED_PAYMENT_TYPES');
  return resolveEnabledPaymentTypes(supportedTypes, configuredTypes);
}
