import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createOrder } from '@/lib/order/service';
import { getEnv } from '@/lib/config';
import { paymentRegistry } from '@/lib/payment';
import { getCurrentUserByToken } from '@/lib/sub2api/client';
import { handleApiError } from '@/lib/utils/api';

const createOrderSchema = z.object({
  token: z.string().min(1),
  amount: z.number().positive(),
  payment_type: z.string().min(1),
  src_host: z.string().max(253).optional(),
  src_url: z.string().max(2048).optional(),
  is_mobile: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const env = getEnv();
    const body = await request.json();
    const parsed = createOrderSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: '参数错误', details: parsed.error.flatten().fieldErrors }, { status: 400 });
    }

    const { token, amount, payment_type, src_host, src_url, is_mobile } = parsed.data;

    // 通过 token 解析用户身份
    let userId: number;
    try {
      const user = await getCurrentUserByToken(token);
      userId = user.id;
    } catch {
      return NextResponse.json({ error: '无效的 token，请重新登录', code: 'INVALID_TOKEN' }, { status: 401 });
    }

    // Validate amount range
    if (amount < env.MIN_RECHARGE_AMOUNT || amount > env.MAX_RECHARGE_AMOUNT) {
      return NextResponse.json(
        { error: `充值金额需在 ${env.MIN_RECHARGE_AMOUNT} - ${env.MAX_RECHARGE_AMOUNT} 之间` },
        { status: 400 },
      );
    }

    // Validate payment type is enabled
    if (!paymentRegistry.getSupportedTypes().includes(payment_type)) {
      return NextResponse.json({ error: `不支持的支付方式: ${payment_type}` }, { status: 400 });
    }

    const clientIp =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || '127.0.0.1';

    const result = await createOrder({
      userId,
      amount,
      paymentType: payment_type,
      clientIp,
      isMobile: is_mobile,
      srcHost: src_host,
      srcUrl: src_url,
    });

    // 不向客户端暴露 userName / userBalance 等隐私字段
    const { userName: _u, userBalance: _b, ...safeResult } = result;
    return NextResponse.json(safeResult);
  } catch (error) {
    return handleApiError(error, '创建订单失败，请稍后重试');
  }
}
