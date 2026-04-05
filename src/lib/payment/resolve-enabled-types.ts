import { prisma } from '@/lib/db';
import { getSystemConfig } from '@/lib/system-config';
import { initPaymentProviders, paymentRegistry } from '@/lib/payment';

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

interface EnabledProviderInstance {
  providerKey: string;
  supportedTypes: string | null;
}

function parseSupportedTypes(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((type) => type.trim())
    .filter(Boolean);
}

export function filterEnabledPaymentTypesByInstances(
  enabledTypes: string[],
  enabledInstances: EnabledProviderInstance[],
): string[] {
  if (enabledTypes.length === 0 || enabledInstances.length === 0) return enabledTypes;

  const instancesByProvider = new Map<string, EnabledProviderInstance[]>();
  for (const instance of enabledInstances) {
    const instances = instancesByProvider.get(instance.providerKey) || [];
    instances.push(instance);
    instancesByProvider.set(instance.providerKey, instances);
  }

  return enabledTypes.filter((type) => {
    const providerKey = paymentRegistry.getProviderKey(type);
    if (!providerKey) return false;

    const providerInstances = instancesByProvider.get(providerKey);
    if (!providerInstances || providerInstances.length === 0) {
      // No DB instances for this provider: keep legacy env-based fallback behavior.
      return true;
    }

    return providerInstances.some((instance) => {
      const supportedTypes = parseSupportedTypes(instance.supportedTypes);
      return supportedTypes.length === 0 || supportedTypes.includes(type);
    });
  });
}

/**
 * 获取当前启用的支付类型（结合 registry 支持类型 + 数据库 ENABLED_PAYMENT_TYPES 配置）。
 */
export async function getEnabledPaymentTypes(): Promise<string[]> {
  initPaymentProviders();
  const supportedTypes = paymentRegistry.getSupportedTypes();
  const configuredTypes = await getSystemConfig('ENABLED_PAYMENT_TYPES');
  const enabledTypes = resolveEnabledPaymentTypes(supportedTypes, configuredTypes);
  if (enabledTypes.length === 0) return enabledTypes;

  const enabledInstances = await prisma.paymentProviderInstance.findMany({
    where: { enabled: true },
    select: { providerKey: true, supportedTypes: true },
  });

  return filterEnabledPaymentTypesByInstances(enabledTypes, enabledInstances);
}
