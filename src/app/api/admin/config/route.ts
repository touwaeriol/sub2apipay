import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminToken, unauthorizedResponse } from '@/lib/admin-auth';
import { getAllSystemConfigs, setSystemConfigs, getSystemConfig } from '@/lib/system-config';
import { prisma } from '@/lib/db';

const SENSITIVE_PATTERNS = ['KEY', 'SECRET', 'PASSWORD', 'PRIVATE'];
const MASK_RE = /\*{4,}/;

function maskSensitiveValue(key: string, value: string): string {
  const isSensitive = SENSITIVE_PATTERNS.some((pattern) => key.toUpperCase().includes(pattern));
  if (!isSensitive) return value;
  if (value.length <= 4) return '****';
  return '*'.repeat(value.length - 4) + value.slice(-4);
}

function parseCSV(value: string): string[] {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Check if any of the removed provider keys still have instances in DB.
 * Returns the blocked provider keys, or empty array if none.
 */
async function findBlockedProviders(removedProviders: string[]): Promise<string[]> {
  if (removedProviders.length === 0) return [];
  const groups = await prisma.paymentProviderInstance.groupBy({
    by: ['providerKey'],
    where: { providerKey: { in: removedProviders } },
    _count: true,
  });
  return groups.filter((g) => g._count > 0).map((g) => g.providerKey);
}

/**
 * Validate that ENABLED_PROVIDERS does not remove providers with existing instances.
 * Returns an error response if blocked, or null if OK.
 */
async function validateEnabledProviders(configs: { key: string; value: string }[]): Promise<NextResponse | null> {
  const entry = configs.find((c) => c.key === 'ENABLED_PROVIDERS');
  if (!entry) return null;

  const currentRaw = await getSystemConfig('ENABLED_PROVIDERS');
  if (!currentRaw) return null;

  const newSet = new Set(parseCSV(entry.value));
  const removed = parseCSV(currentRaw).filter((p) => !newSet.has(p));
  const blocked = await findBlockedProviders(removed);

  if (blocked.length > 0) {
    return NextResponse.json(
      { error: `无法关闭服务商类型 [${blocked.join(', ')}]：存在关联实例，请先删除所有实例` },
      { status: 409 },
    );
  }
  return null;
}

export async function GET(request: NextRequest) {
  if (!(await verifyAdminToken(request))) return unauthorizedResponse(request);

  try {
    const configs = await getAllSystemConfigs();
    const masked = configs.map((config) => ({
      ...config,
      value: maskSensitiveValue(config.key, config.value),
    }));
    return NextResponse.json({ configs: masked });
  } catch (error) {
    console.error('Failed to get system configs:', error instanceof Error ? error.message : String(error));
    return NextResponse.json({ error: '获取系统配置失败' }, { status: 500 });
  }
}

const ALLOWED_CONFIG_KEYS = new Set([
  'ENABLED_PAYMENT_TYPES',
  'RECHARGE_MIN_AMOUNT',
  'RECHARGE_MAX_AMOUNT',
  'DAILY_RECHARGE_LIMIT',
  'ORDER_TIMEOUT_MINUTES',
  'IFRAME_ALLOW_ORIGINS',
  'PRODUCT_NAME_PREFIX',
  'PRODUCT_NAME_SUFFIX',
  'BALANCE_PAYMENT_DISABLED',
  'CANCEL_RATE_LIMIT_ENABLED',
  'CANCEL_RATE_LIMIT_WINDOW',
  'CANCEL_RATE_LIMIT_UNIT',
  'CANCEL_RATE_LIMIT_MAX',
  'CANCEL_RATE_LIMIT_WINDOW_MODE',
  'MAX_PENDING_ORDERS',
  'LOAD_BALANCE_STRATEGY',
  'ENABLED_PROVIDERS',
  'SUB2API_ADMIN_API_KEY',
  'OVERRIDE_ENV_ENABLED',
  'DEFAULT_DEDUCT_BALANCE',
]);

export async function PUT(request: NextRequest) {
  if (!(await verifyAdminToken(request))) return unauthorizedResponse(request);

  try {
    const body = await request.json();
    const { configs } = body;

    if (!Array.isArray(configs) || configs.length === 0) {
      return NextResponse.json({ error: '缺少必填字段: configs 数组' }, { status: 400 });
    }

    for (const config of configs) {
      if (!config.key || config.value === undefined) {
        return NextResponse.json({ error: '每条配置必须包含 key 和 value' }, { status: 400 });
      }
      if (!ALLOWED_CONFIG_KEYS.has(config.key)) {
        return NextResponse.json({ error: `不允许修改配置项: ${config.key}` }, { status: 400 });
      }
    }

    const blocked = await validateEnabledProviders(configs);
    if (blocked) return blocked;

    // Skip masked sensitive values (user didn't change them)
    const filteredConfigs = configs.filter(
      (c: { key: string; value: string }) =>
        !(SENSITIVE_PATTERNS.some((p) => c.key.toUpperCase().includes(p)) && MASK_RE.test(c.value)),
    );

    await setSystemConfigs(
      filteredConfigs.map((c: { key: string; value: string; group?: string; label?: string }) => ({
        key: c.key,
        value: c.value,
        group: c.group,
        label: c.label,
      })),
    );

    return NextResponse.json({ success: true, updated: configs.length });
  } catch (error) {
    console.error('Failed to update system configs:', error instanceof Error ? error.message : String(error));
    return NextResponse.json({ error: '更新系统配置失败' }, { status: 500 });
  }
}
