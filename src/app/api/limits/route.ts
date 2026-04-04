import { NextRequest, NextResponse } from 'next/server';
import { queryMethodLimits } from '@/lib/order/limits';
import { ensureDBProviders, paymentRegistry } from '@/lib/payment';
import { getNextBizDayStartUTC } from '@/lib/time/biz-day';
import { getCurrentUserByToken } from '@/lib/sub2api/client';

/**
 * GET /api/limits?token=xxx
 * 返回各支付渠道今日限额使用情况。
 *
 * Response:
 * {
 *   methods: {
 *     alipay: { dailyLimit: 10000, used: 3500, remaining: 6500, available: true },
 *     wxpay:  { dailyLimit: 10000, used: 10000, remaining: 0,    available: false },
 *     stripe: { dailyLimit: 0,     used: 500,  remaining: null,  available: true }
 *   },
 *   resetAt: "2026-03-02T16:00:00.000Z"  // 业务时区（Asia/Shanghai）次日零点对应的 UTC 时间
 * }
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')?.trim();
  if (!token) {
    return NextResponse.json({ error: 'token is required' }, { status: 400 });
  }

  try {
    await getCurrentUserByToken(token);
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  await ensureDBProviders();
  const types = paymentRegistry.getSupportedTypes();
  const methods = await queryMethodLimits(types);
  const resetAt = getNextBizDayStartUTC();

  return NextResponse.json({ methods, resetAt });
}
