import { NextResponse } from 'next/server';
import { queryMethodLimits } from '@/lib/order/limits';
import { initPaymentProviders, paymentRegistry } from '@/lib/payment';
import { getNextBizDayStartUTC } from '@/lib/time/biz-day';

/**
 * GET /api/limits
 * 返回各支付渠道今日限额使用情况，公开接口（无需鉴权）。
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
export async function GET() {
  initPaymentProviders();
  const types = paymentRegistry.getSupportedTypes();
  const methods = await queryMethodLimits(types);
  const resetAt = getNextBizDayStartUTC();

  return NextResponse.json({ methods, resetAt });
}
