import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createOrder, OrderError } from '@/lib/order/service';
import { getEnv } from '@/lib/config';

const createOrderSchema = z.object({
  user_id: z.number().int().positive(),
  amount: z.number().positive(),
  payment_type: z.string().min(1),
  src_host: z.string().max(253).optional(),
  src_url: z.string().max(2048).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const env = getEnv();
    const body = await request.json();
    const parsed = createOrderSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: '参数错误', details: parsed.error.flatten().fieldErrors }, { status: 400 });
    }

    const { user_id, amount, payment_type, src_host, src_url } = parsed.data;

    // Validate amount range
    if (amount < env.MIN_RECHARGE_AMOUNT || amount > env.MAX_RECHARGE_AMOUNT) {
      return NextResponse.json(
        { error: `充值金额需在 ${env.MIN_RECHARGE_AMOUNT} - ${env.MAX_RECHARGE_AMOUNT} 之间` },
        { status: 400 },
      );
    }

    // Validate payment type is enabled
    if (!env.ENABLED_PAYMENT_TYPES.includes(payment_type)) {
      return NextResponse.json({ error: `不支持的支付方式: ${payment_type}` }, { status: 400 });
    }

    const clientIp =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || '127.0.0.1';

    const result = await createOrder({
      userId: user_id,
      amount,
      paymentType: payment_type,
      clientIp,
      srcHost: src_host,
      srcUrl: src_url,
    });

    // 不向客户端暴露 userName / userBalance 等隐私字段
    const { userName: _u, userBalance: _b, ...safeResult } = result;
    return NextResponse.json(safeResult);
  } catch (error) {
    if (error instanceof OrderError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    console.error('Create order error:', error);
    return NextResponse.json({ error: '创建订单失败，请稍后重试' }, { status: 500 });
  }
}
