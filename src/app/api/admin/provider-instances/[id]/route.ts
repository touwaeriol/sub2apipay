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

/**
 * Check if a value looks like a masked placeholder (contains consecutive asterisks).
 */
function isMaskedValue(value: string): boolean {
  return /\*{4,}/.test(value);
}

// GET: Return a single instance with decrypted+masked config
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await verifyAdminToken(request))) return unauthorizedResponse(request);

  try {
    const { id } = await params;

    const instance = await prisma.paymentProviderInstance.findUnique({
      where: { id },
    });

    if (!instance) {
      return NextResponse.json({ error: '支付实例不存在' }, { status: 404 });
    }

    return NextResponse.json({
      ...instance,
      config: decryptAndMaskConfig(instance.config),
    });
  } catch (error) {
    console.error('Failed to get provider instance:', error instanceof Error ? error.message : String(error));
    return NextResponse.json({ error: '获取支付实例失败' }, { status: 500 });
  }
}

// PUT: Update an instance (re-encrypt config if changed)
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await verifyAdminToken(request))) return unauthorizedResponse(request);

  try {
    const { id } = await params;
    const body = await request.json();
    const { providerKey, name, config, enabled, sortOrder } = body;

    const existing = await prisma.paymentProviderInstance.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json({ error: '支付实例不存在' }, { status: 404 });
    }

    const data: Record<string, unknown> = {};

    if (providerKey !== undefined) {
      const validProviders = ['easypay', 'alipay', 'wxpay', 'stripe'];
      if (!validProviders.includes(providerKey)) {
        return NextResponse.json(
          { error: `无效的 providerKey，可选值: ${validProviders.join(', ')}` },
          { status: 400 },
        );
      }
      data.providerKey = providerKey;
    }

    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim() === '') {
        return NextResponse.json({ error: 'name 不能为空' }, { status: 400 });
      }
      data.name = name.trim();
    }

    if (config !== undefined) {
      if (typeof config !== 'object' || config === null) {
        return NextResponse.json({ error: 'config 必须是对象' }, { status: 400 });
      }

      // Decrypt existing config to merge unchanged masked fields
      const existingConfig: Record<string, string> = JSON.parse(decrypt(existing.config));
      const mergedConfig: Record<string, string> = {};

      for (const [key, value] of Object.entries(config as Record<string, string>)) {
        if (typeof value === 'string' && isMaskedValue(value) && key in existingConfig) {
          // Keep existing value for masked fields
          mergedConfig[key] = existingConfig[key];
        } else {
          mergedConfig[key] = value;
        }
      }

      data.config = encrypt(JSON.stringify(mergedConfig));
    }

    if (enabled !== undefined) data.enabled = enabled;
    if (sortOrder !== undefined) {
      if (!Number.isInteger(sortOrder) || sortOrder < 0) {
        return NextResponse.json({ error: 'sortOrder 必须是非负整数' }, { status: 400 });
      }
      data.sortOrder = sortOrder;
    }

    const updated = await prisma.paymentProviderInstance.update({
      where: { id },
      data,
    });

    return NextResponse.json({
      ...updated,
      config: decryptAndMaskConfig(updated.config),
    });
  } catch (error) {
    console.error('Failed to update provider instance:', error instanceof Error ? error.message : String(error));
    return NextResponse.json({ error: '更新支付实例失败' }, { status: 500 });
  }
}

// DELETE: Delete an instance
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await verifyAdminToken(request))) return unauthorizedResponse(request);

  try {
    const { id } = await params;

    const existing = await prisma.paymentProviderInstance.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json({ error: '支付实例不存在' }, { status: 404 });
    }

    await prisma.paymentProviderInstance.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete provider instance:', error instanceof Error ? error.message : String(error));
    return NextResponse.json({ error: '删除支付实例失败' }, { status: 500 });
  }
}
