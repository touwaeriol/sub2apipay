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
    const response = await fetch(`${env.SUB2API_BASE_URL}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) return false;
    const data = await response.json();
    return data.data?.role === 'admin';
  } catch {
    return false;
  }
}

export async function verifyAdminToken(request: NextRequest): Promise<boolean> {
  const token = request.nextUrl.searchParams.get('token');
  if (!token) return false;

  // 1. 本地 admin token
  if (isLocalAdminToken(token)) return true;

  // 2. Sub2API 管理员 token
  return isSub2ApiAdmin(token);
}

export function unauthorizedResponse() {
  return NextResponse.json({ error: '未授权' }, { status: 401 });
}
