import { NextRequest, NextResponse } from 'next/server';
import { getEnv } from '@/lib/config';
import crypto from 'crypto';

function isLocalAdminToken(token: string): boolean {
  const env = getEnv();
  const expected = Buffer.from(env.ADMIN_TOKEN);
  const received = Buffer.from(token);

  if (expected.length !== received.length) return false;
  return crypto.timingSafeEqual(expected, received);
}

async function isSub2ApiAdmin(token: string): Promise<boolean> {
  try {
    const env = getEnv();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(`${env.SUB2API_BASE_URL}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!response.ok) return false;
    const data = await response.json();
    return data.data?.role === 'admin';
  } catch {
    return false;
  }
}

export async function verifyAdminToken(request: NextRequest): Promise<boolean> {
  // 优先从 Authorization: Bearer <token> header 获取
  let token: string | null = null;
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  }

  // Fallback: query parameter（向后兼容，已弃用）
  if (!token) {
    token = request.nextUrl.searchParams.get('token');
    if (token) {
      console.warn(
        '[DEPRECATED] Admin token passed via query parameter. Use "Authorization: Bearer <token>" header instead.',
      );
    }
  }

  if (!token) return false;

  // 1. 本地 admin token
  if (isLocalAdminToken(token)) return true;

  // 2. Sub2API 管理员 token
  return isSub2ApiAdmin(token);
}

export function unauthorizedResponse() {
  return NextResponse.json({ error: '未授权' }, { status: 401 });
}
