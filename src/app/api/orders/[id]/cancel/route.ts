import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { cancelOrder, OrderError } from '@/lib/order/service';

const cancelSchema = z.object({
  user_id: z.number().int().positive(),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const parsed = cancelSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: '参数错误', details: parsed.error.flatten().fieldErrors }, { status: 400 });
    }

    await cancelOrder(id, parsed.data.user_id);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof OrderError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    console.error('Cancel order error:', error);
    return NextResponse.json({ error: '取消订单失败' }, { status: 500 });
  }
}
