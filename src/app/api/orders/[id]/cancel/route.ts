import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { cancelOrder } from '@/lib/order/service';
import { getCurrentUserByToken } from '@/lib/sub2api/client';
import { handleApiError } from '@/lib/utils/api';

const cancelSchema = z.object({
  token: z.string().min(1),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const parsed = cancelSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: '缺少 token 参数' }, { status: 400 });
    }

    let userId: number;
    try {
      const user = await getCurrentUserByToken(parsed.data.token);
      userId = user.id;
    } catch {
      return NextResponse.json({ error: '登录态已失效，无法取消订单' }, { status: 401 });
    }

    const outcome = await cancelOrder(id, userId);
    if (outcome === 'already_paid') {
      return NextResponse.json({ success: true, status: 'PAID', message: '订单已支付完成' });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, '取消订单失败');
  }
}
