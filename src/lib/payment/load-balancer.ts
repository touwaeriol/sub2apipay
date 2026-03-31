import { prisma } from '@/lib/db';
import { decrypt } from '@/lib/crypto';
import { getBizDayStartUTC } from '@/lib/time/biz-day';

// Round-robin counter (in-memory, resets on restart)
const rrCounters = new Map<string, number>();

export type LoadBalanceStrategy = 'round-robin' | 'least-amount';

/**
 * Select an instance for a given provider key based on the configured strategy.
 * Returns the instance ID and decrypted config.
 */
export async function selectInstance(
  providerKey: string,
  strategy: LoadBalanceStrategy = 'round-robin',
): Promise<{ instanceId: string; config: Record<string, string> } | null> {
  const instances = await prisma.paymentProviderInstance.findMany({
    where: { providerKey, enabled: true },
    orderBy: { sortOrder: 'asc' },
  });

  if (instances.length === 0) return null;

  if (strategy === 'least-amount') {
    // Pick the instance with the least paid amount today
    const todayStart = getBizDayStartUTC();
    const amounts = await Promise.all(
      instances.map(async (inst) => {
        const agg = await prisma.order.aggregate({
          where: {
            providerInstanceId: inst.id,
            status: { in: ['PAID', 'RECHARGING', 'COMPLETED'] },
            paidAt: { gte: todayStart },
          },
          _sum: { payAmount: true },
        });
        return { instance: inst, amount: Number(agg._sum.payAmount ?? 0) };
      }),
    );
    amounts.sort((a, b) => a.amount - b.amount);
    const selected = amounts[0].instance;
    return { instanceId: selected.id, config: JSON.parse(decrypt(selected.config)) };
  }

  // Round-robin
  const counter = rrCounters.get(providerKey) ?? 0;
  const selected = instances[counter % instances.length];
  rrCounters.set(providerKey, counter + 1);
  return { instanceId: selected.id, config: JSON.parse(decrypt(selected.config)) };
}

/**
 * Get the config for a specific instance by ID (for callback verification).
 */
export async function getInstanceConfig(instanceId: string): Promise<Record<string, string> | null> {
  const instance = await prisma.paymentProviderInstance.findUnique({
    where: { id: instanceId },
  });
  if (!instance) return null;
  return JSON.parse(decrypt(instance.config));
}
