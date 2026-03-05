import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/sub2api/client';
import { getEnv } from '@/lib/config';
import { queryMethodLimits } from '@/lib/order/limits';

export async function GET(request: NextRequest) {
  const userId = Number(request.nextUrl.searchParams.get('user_id'));
  if (!userId || isNaN(userId) || userId <= 0) {
    return NextResponse.json({ error: '无效的用户 ID' }, { status: 400 });
  }

  try {
    const env = getEnv();
    const [user, methodLimits] = await Promise.all([getUser(userId), queryMethodLimits(env.ENABLED_PAYMENT_TYPES)]);

    return NextResponse.json({
      user: {
        id: user.id,
        status: user.status,
      },
      config: {
        enabledPaymentTypes: env.ENABLED_PAYMENT_TYPES,
        minAmount: env.MIN_RECHARGE_AMOUNT,
        maxAmount: env.MAX_RECHARGE_AMOUNT,
        maxDailyAmount: env.MAX_DAILY_RECHARGE_AMOUNT,
        methodLimits,
        helpImageUrl: env.PAY_HELP_IMAGE_URL ?? null,
        helpText: env.PAY_HELP_TEXT ?? null,
        stripePublishableKey:
          env.ENABLED_PAYMENT_TYPES.includes('stripe') && env.STRIPE_PUBLISHABLE_KEY
            ? env.STRIPE_PUBLISHABLE_KEY
            : null,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === 'USER_NOT_FOUND') {
      return NextResponse.json({ error: '用户不存在' }, { status: 404 });
    }
    console.error('Get user error:', error);
    return NextResponse.json({ error: '获取用户信息失败' }, { status: 500 });
  }
}
