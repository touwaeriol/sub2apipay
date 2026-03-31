import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminToken, unauthorizedResponse } from '@/lib/admin-auth';
import { prisma } from '@/lib/db';
import { encrypt, decrypt } from '@/lib/crypto';

const SENSITIVE_PATTERNS = ['key', 'pkey', 'secret', 'private', 'password'];
const VALID_PROVIDERS = ['easypay', 'alipay', 'wxpay', 'stripe'];
const PENDING_STATUSES = ['PENDING', 'PAID', 'RECHARGING'] as const;

function isSensitiveField(fieldName: string): boolean {
  const lower = fieldName.toLowerCase();
  return SENSITIVE_PATTERNS.some((p) => lower.includes(p));
}

function maskValue(value: string): string {
  if (!value) return '****';
  return value.length > 4 ? '*'.repeat(value.length - 4) + value.slice(-4) : '****';
}

function decryptAndMaskConfig(encryptedConfig: string): Record<string, string> {
  const config: Record<string, string> = JSON.parse(decrypt(encryptedConfig));
  const masked: Record<string, string> = {};
  for (const [key, value] of Object.entries(config)) {
    masked[key] = isSensitiveField(key) && value ? maskValue(value) : value;
  }
  return masked;
}

function isMaskedValue(value: string): boolean {
  return /\*{4,}/.test(value);
}

function mergeConfigWithExisting(
  newConfig: Record<string, string>,
  existingConfig: Record<string, string>,
): Record<string, string> {
  const merged: Record<string, string> = {};
  for (const [key, value] of Object.entries(newConfig)) {
    merged[key] =
      typeof value === 'string' && isMaskedValue(value) && key in existingConfig ? existingConfig[key] : value;
  }
  return merged;
}

function hasCredentialChange(merged: Record<string, string>, existing: Record<string, string>): boolean {
  return Object.entries(merged).some(([key, value]) => isSensitiveField(key) && value !== existing[key]);
}

async function getPendingOrderCount(instanceId: string): Promise<number> {
  return prisma.order.count({
    where: { providerInstanceId: instanceId, status: { in: ['PENDING', 'PAID', 'RECHARGING'] } },
  });
}

async function checkCredentialChangeAllowed(
  instanceId: string,
  merged: Record<string, string>,
  existing: Record<string, string>,
): Promise<NextResponse | null> {
  if (!hasCredentialChange(merged, existing)) return null;

  const pendingCount = await getPendingOrderCount(instanceId);
  if (pendingCount === 0) return null;

  return NextResponse.json(
    {
      error: `该实例有 ${pendingCount} 个进行中的订单，修改凭证可能导致回调验签失败。请等待订单完成后再修改，或先禁用该实例。`,
    },
    { status: 409 },
  );
}

// GET
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await verifyAdminToken(request))) return unauthorizedResponse(request);

  try {
    const { id } = await params;
    const instance = await prisma.paymentProviderInstance.findUnique({ where: { id } });
    if (!instance) return NextResponse.json({ error: '支付实例不存在' }, { status: 404 });

    return NextResponse.json({ ...instance, config: decryptAndMaskConfig(instance.config) });
  } catch (error) {
    console.error('Failed to get provider instance:', error instanceof Error ? error.message : String(error));
    return NextResponse.json({ error: '获取支付实例失败' }, { status: 500 });
  }
}

// PUT
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await verifyAdminToken(request))) return unauthorizedResponse(request);

  try {
    const { id } = await params;
    const body = await request.json();
    const { providerKey, name, config, enabled, sortOrder, supportedTypes } = body;

    const existing = await prisma.paymentProviderInstance.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: '支付实例不存在' }, { status: 404 });

    const data: Record<string, unknown> = {};

    if (providerKey !== undefined) {
      if (!VALID_PROVIDERS.includes(providerKey)) {
        return NextResponse.json(
          { error: `无效的 providerKey，可选值: ${VALID_PROVIDERS.join(', ')}` },
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
      const existingConfig: Record<string, string> = JSON.parse(decrypt(existing.config));
      const mergedConfig = mergeConfigWithExisting(config as Record<string, string>, existingConfig);
      data.config = encrypt(JSON.stringify(mergedConfig));

      const blocked = await checkCredentialChangeAllowed(id, mergedConfig, existingConfig);
      if (blocked) return blocked;
    }

    if (enabled !== undefined) data.enabled = enabled;
    if (supportedTypes !== undefined) data.supportedTypes = supportedTypes;
    if (sortOrder !== undefined) {
      if (!Number.isInteger(sortOrder) || sortOrder < 0) {
        return NextResponse.json({ error: 'sortOrder 必须是非负整数' }, { status: 400 });
      }
      data.sortOrder = sortOrder;
    }

    const updated = await prisma.paymentProviderInstance.update({ where: { id }, data });
    return NextResponse.json({ ...updated, config: decryptAndMaskConfig(updated.config) });
  } catch (error) {
    console.error('Failed to update provider instance:', error instanceof Error ? error.message : String(error));
    return NextResponse.json({ error: '更新支付实例失败' }, { status: 500 });
  }
}

// DELETE
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await verifyAdminToken(request))) return unauthorizedResponse(request);

  try {
    const { id } = await params;
    const existing = await prisma.paymentProviderInstance.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: '支付实例不存在' }, { status: 404 });

    const pendingCount = await getPendingOrderCount(id);
    if (pendingCount > 0) {
      return NextResponse.json(
        { error: `该实例有 ${pendingCount} 个进行中的订单，无法删除。请等待订单完成或先禁用该实例。` },
        { status: 409 },
      );
    }

    await prisma.paymentProviderInstance.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete provider instance:', error instanceof Error ? error.message : String(error));
    return NextResponse.json({ error: '删除支付实例失败' }, { status: 500 });
  }
}
