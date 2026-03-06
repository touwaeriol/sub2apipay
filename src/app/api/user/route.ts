import { NextRequest, NextResponse } from 'next/server';
import { getUser, getCurrentUserByToken } from '@/lib/sub2api/client';
import { getEnv } from '@/lib/config';
import { queryMethodLimits } from '@/lib/order/limits';
import { initPaymentProviders, paymentRegistry } from '@/lib/payment';
import { PAYMENT_TYPE_META } from '@/lib/pay-utils';

export async function GET(request: NextRequest) {
  const userId = Number(request.nextUrl.searchParams.get('user_id'));
  if (!userId || isNaN(userId) || userId <= 0) {
    return NextResponse.json({ error: '无效的用户 ID' }, { status: 400 });
  }

  const token = request.nextUrl.searchParams.get('token')?.trim();
  if (!token) {
    return NextResponse.json({ error: '缺少 token 参数' }, { status: 401 });
  }

  try {
    // 验证 token 并确保请求的 user_id 与 token 对应的用户匹配
    let tokenUser;
    try {
      tokenUser = await getCurrentUserByToken(token);
    } catch {
      return NextResponse.json({ error: '无效的 token' }, { status: 401 });
    }

    if (tokenUser.id !== userId) {
      return NextResponse.json({ error: '无权访问该用户信息' }, { status: 403 });
    }

    const env = getEnv();
    initPaymentProviders();
    const enabledTypes = paymentRegistry.getSupportedTypes();
    const [user, methodLimits] = await Promise.all([getUser(userId), queryMethodLimits(enabledTypes)]);

    // 收集 sublabel 覆盖
    const sublabelOverrides: Record<string, string> = {};

    // 1. 检测同 label 冲突：多个启用渠道有相同的显示名，自动标记默认 sublabel（provider 名）
    const labelCount = new Map<string, string[]>();
    for (const type of enabledTypes) {
      const meta = PAYMENT_TYPE_META[type];
      if (!meta) continue;
      const types = labelCount.get(meta.label) || [];
      types.push(type);
      labelCount.set(meta.label, types);
    }
    for (const [, types] of labelCount) {
      if (types.length > 1) {
        for (const type of types) {
          const meta = PAYMENT_TYPE_META[type];
          if (meta) sublabelOverrides[type] = meta.provider;
        }
      }
    }

    // 2. 用户手动配置的 PAYMENT_SUBLABEL_* 优先级最高，覆盖自动生成的
    if (env.PAYMENT_SUBLABEL_ALIPAY) sublabelOverrides.alipay = env.PAYMENT_SUBLABEL_ALIPAY;
    if (env.PAYMENT_SUBLABEL_ALIPAY_DIRECT) sublabelOverrides.alipay_direct = env.PAYMENT_SUBLABEL_ALIPAY_DIRECT;
    if (env.PAYMENT_SUBLABEL_WXPAY) sublabelOverrides.wxpay = env.PAYMENT_SUBLABEL_WXPAY;
    if (env.PAYMENT_SUBLABEL_WXPAY_DIRECT) sublabelOverrides.wxpay_direct = env.PAYMENT_SUBLABEL_WXPAY_DIRECT;
    if (env.PAYMENT_SUBLABEL_STRIPE) sublabelOverrides.stripe = env.PAYMENT_SUBLABEL_STRIPE;

    return NextResponse.json({
      user: {
        id: user.id,
        status: user.status,
      },
      config: {
        enabledPaymentTypes: enabledTypes,
        minAmount: env.MIN_RECHARGE_AMOUNT,
        maxAmount: env.MAX_RECHARGE_AMOUNT,
        maxDailyAmount: env.MAX_DAILY_RECHARGE_AMOUNT,
        methodLimits,
        helpImageUrl: env.PAY_HELP_IMAGE_URL ?? null,
        helpText: env.PAY_HELP_TEXT ?? null,
        stripePublishableKey:
          enabledTypes.includes('stripe') && env.STRIPE_PUBLISHABLE_KEY
            ? env.STRIPE_PUBLISHABLE_KEY
            : null,
        sublabelOverrides: Object.keys(sublabelOverrides).length > 0 ? sublabelOverrides : null,
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
