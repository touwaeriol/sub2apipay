import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyAdminToken, unauthorizedResponse } from '@/lib/admin-auth';
import { processRefund, OrderError } from '@/lib/order/service';

const refundSchema = z.object({
  order_id: z.string().min(1),
  reason: z.string().optional(),
  force: z.boolean().optional().default(false),
});

export async function POST(request: NextRequest) {
  if (!verifyAdminToken(request)) return unauthorizedResponse();

  try {
    const body = await request.json();
    const parsed = refundSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: '参数错误', details: parsed.error.flatten().fieldErrors }, { status: 400 });
    }

    const result = await processRefund({
      orderId: parsed.data.order_id,
      reason: parsed.data.reason,
      force: parsed.data.force,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof OrderError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    console.error('Refund error:', error);
    return NextResponse.json({ error: '退款失败' }, { status: 500 });
  }
}
