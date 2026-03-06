import { NextRequest } from 'next/server';
import { handlePaymentNotify } from '@/lib/order/service';
import { paymentRegistry } from '@/lib/payment';
import type { PaymentType } from '@/lib/payment';
import { getEnv } from '@/lib/config';
import { extractHeaders } from '@/lib/utils/api';

export async function POST(request: NextRequest) {
  try {
    // 微信支付未配置时，直接返回成功（避免旧回调重试产生错误日志）
    const env = getEnv();
    if (!env.WXPAY_PUBLIC_KEY || !env.WXPAY_MCH_ID) {
      return Response.json({ code: 'SUCCESS', message: '成功' });
    }

    const provider = paymentRegistry.getProvider('wxpay_direct' as PaymentType);
    const rawBody = await request.text();
    const headers = extractHeaders(request);

    const notification = await provider.verifyNotification(rawBody, headers);
    if (!notification) {
      return Response.json({ code: 'SUCCESS', message: '成功' });
    }
    const success = await handlePaymentNotify(notification, provider.name);
    return Response.json(
      success ? { code: 'SUCCESS', message: '成功' } : { code: 'FAIL', message: '处理失败' },
      { status: success ? 200 : 500 },
    );
  } catch (error) {
    console.error('Wxpay notify error:', error);
    return Response.json(
      { code: 'FAIL', message: '处理失败' },
      { status: 500 },
    );
  }
}
