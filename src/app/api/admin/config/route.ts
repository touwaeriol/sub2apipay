import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminToken, unauthorizedResponse } from '@/lib/admin-auth';
import { getAllSystemConfigs, setSystemConfigs } from '@/lib/system-config';

const SENSITIVE_PATTERNS = ['KEY', 'SECRET', 'PASSWORD', 'PRIVATE'];

function maskSensitiveValue(key: string, value: string): string {
  const isSensitive = SENSITIVE_PATTERNS.some((pattern) => key.toUpperCase().includes(pattern));
  if (!isSensitive) return value;
  if (value.length <= 4) return '****';
  return '*'.repeat(value.length - 4) + value.slice(-4);
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

export async function PUT(request: NextRequest) {
  if (!(await verifyAdminToken(request))) return unauthorizedResponse(request);

  try {
    const body = await request.json();
    const { configs } = body;

    if (!Array.isArray(configs) || configs.length === 0) {
      return NextResponse.json({ error: '缺少必填字段: configs 数组' }, { status: 400 });
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
    ]);

    // 校验每条配置
    for (const config of configs) {
      if (!config.key || config.value === undefined) {
        return NextResponse.json({ error: '每条配置必须包含 key 和 value' }, { status: 400 });
      }
      if (!ALLOWED_CONFIG_KEYS.has(config.key)) {
        return NextResponse.json({ error: `不允许修改配置项: ${config.key}` }, { status: 400 });
      }
    }

    await setSystemConfigs(
      configs.map((c: { key: string; value: string; group?: string; label?: string }) => ({
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
