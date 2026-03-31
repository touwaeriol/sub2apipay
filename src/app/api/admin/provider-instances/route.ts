import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminToken, unauthorizedResponse } from '@/lib/admin-auth';
import { prisma } from '@/lib/db';
import { encrypt, decrypt } from '@/lib/crypto';

/** Fields whose values should be masked when returning to the client */
const SENSITIVE_PATTERNS = ['key', 'pkey', 'secret', 'private', 'password'];

function isSensitiveField(fieldName: string): boolean {
  const lower = fieldName.toLowerCase();
  return SENSITIVE_PATTERNS.some((p) => lower.includes(p));
}

/**
 * Decrypt config JSON and mask sensitive fields (show only last 4 chars).
 */
function decryptAndMaskConfig(encryptedConfig: string): Record<string, string> {
  const config: Record<string, string> = JSON.parse(decrypt(encryptedConfig));
  const masked: Record<string, string> = {};
  for (const [key, value] of Object.entries(config)) {
    if (isSensitiveField(key) && value && value.length > 4) {
      masked[key] = '*'.repeat(value.length - 4) + value.slice(-4);
    } else if (isSensitiveField(key) && value) {
      masked[key] = '****';
    } else {
      masked[key] = value;
    }
  }
  return masked;
}

// GET: List all instances (optionally filter by providerKey)
export async function GET(request: NextRequest) {
  if (!(await verifyAdminToken(request))) return unauthorizedResponse(request);

  try {
    const providerKey = request.nextUrl.searchParams.get('providerKey');

    const instances = await prisma.paymentProviderInstance.findMany({
      where: providerKey ? { providerKey } : undefined,
      orderBy: { sortOrder: 'asc' },
    });

    const result = instances.map((inst) => ({
      ...inst,
      config: decryptAndMaskConfig(inst.config),
    }));

    return NextResponse.json({ instances: result });
  } catch (error) {
    console.error('Failed to list provider instances:', error instanceof Error ? error.message : String(error));
    return NextResponse.json({ error: '获取支付实例列表失败' }, { status: 500 });
  }
}

// POST: Create a new instance
export async function POST(request: NextRequest) {
  if (!(await verifyAdminToken(request))) return unauthorizedResponse(request);

  try {
    const body = await request.json();
    const { providerKey, name, config, enabled, sortOrder } = body;

    // Validate required fields
    if (!providerKey || typeof providerKey !== 'string') {
      return NextResponse.json({ error: '缺少必填字段: providerKey' }, { status: 400 });
    }
    if (!name || typeof name !== 'string' || name.trim() === '') {
      return NextResponse.json({ error: '缺少必填字段: name' }, { status: 400 });
    }
    if (!config || typeof config !== 'object') {
      return NextResponse.json({ error: '缺少必填字段: config (必须是对象)' }, { status: 400 });
    }

    const validProviders = ['easypay', 'alipay', 'wxpay', 'stripe'];
    if (!validProviders.includes(providerKey)) {
      return NextResponse.json({ error: `无效的 providerKey，可选值: ${validProviders.join(', ')}` }, { status: 400 });
    }

    if (sortOrder !== undefined && (!Number.isInteger(sortOrder) || sortOrder < 0)) {
      return NextResponse.json({ error: 'sortOrder 必须是非负整数' }, { status: 400 });
    }

    // Encrypt config before storing
    const encryptedConfig = encrypt(JSON.stringify(config));

    const instance = await prisma.paymentProviderInstance.create({
      data: {
        providerKey,
        name: name.trim(),
        config: encryptedConfig,
        enabled: enabled ?? true,
        sortOrder: sortOrder ?? 0,
      },
    });

    return NextResponse.json(
      {
        ...instance,
        config: decryptAndMaskConfig(instance.config),
      },
      { status: 201 },
    );
  } catch (error) {
    console.error('Failed to create provider instance:', error instanceof Error ? error.message : String(error));
    return NextResponse.json({ error: '创建支付实例失败' }, { status: 500 });
  }
}
