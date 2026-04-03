import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUserByToken } from '@/lib/sub2api/client';
import { requestRefund } from '@/lib/order/service';
import { resolveLocale } from '@/lib/locale';
import { handleApiError } from '@/lib/utils/api';

const refundRequestSchema = z.object({
  amount: z.number().positive(),
  reason: z.string().trim().optional(),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const locale = resolveLocale(request.nextUrl.searchParams.get('lang'));
  const token = request.nextUrl.searchParams.get('token')?.trim();
  if (!token) {
    return NextResponse.json({ error: locale === 'en' ? 'Missing token parameter' : '缺少 token 参数' }, { status: 401 });
  }

  try {
    const user = await getCurrentUserByToken(token);
    const body = await request.json().catch(() => ({}));
    const parsed = refundRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: locale === 'en' ? 'Invalid parameters' : '参数错误', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { id } = await params;
    const result = await requestRefund({
      orderId: id,
      userId: user.id,
      amount: parsed.data.amount,
      reason: parsed.data.reason,
      locale,
    });

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error, locale === 'en' ? 'Refund request failed' : '退款申请失败', request);
  }
}
