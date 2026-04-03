import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyAdminToken, unauthorizedResponse } from '@/lib/admin-auth';
import { processRefund } from '@/lib/order/service';
import { handleApiError } from '@/lib/utils/api';
import { resolveLocale } from '@/lib/locale';

const refundSchema = z.object({
  order_id: z.string().min(1),
  amount: z.number().positive().optional(),
  reason: z.string().optional(),
  force: z.boolean().optional().default(false),
  deduct_balance: z.boolean().optional().default(true),
});

export async function POST(request: NextRequest) {
  if (!(await verifyAdminToken(request))) return unauthorizedResponse(request);

  const locale = resolveLocale(request.nextUrl.searchParams.get('lang'));

  try {
    const body = await request.json();
    const parsed = refundSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: locale === 'en' ? 'Invalid parameters' : '参数错误', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const result = await processRefund({
      orderId: parsed.data.order_id,
      amount: parsed.data.amount,
      reason: parsed.data.reason,
      force: parsed.data.force,
      deductBalance: parsed.data.deduct_balance,
      locale,
    });

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error, locale === 'en' ? 'Refund failed' : '退款失败', request);
  }
}
