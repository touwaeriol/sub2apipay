import { NextRequest } from 'next/server';
import { handlePaymentNotify } from '@/lib/order/service';
import { paymentRegistry } from '@/lib/payment';
import type { PaymentType } from '@/lib/payment';
import { getEnv } from '@/lib/config';
import { extractHeaders } from '@/lib/utils/api';

export async function POST(request: NextRequest) {
  try {
    // 官方支付宝未配置时，直接返回成功（避免旧回调重试产生错误日志）
    const env = getEnv();
    if (!env.ALIPAY_APP_ID || !env.ALIPAY_PRIVATE_KEY) {
      return new Response('success', { headers: { 'Content-Type': 'text/plain' } });
    }

    const provider = paymentRegistry.getProvider('alipay_direct' as PaymentType);
    const rawBody = await request.text();
    const headers = extractHeaders(request);

    const notification = await provider.verifyNotification(rawBody, headers);
    if (!notification) {
      return new Response('success', { headers: { 'Content-Type': 'text/plain' } });
    }
    const success = await handlePaymentNotify(notification, provider.name);
    return new Response(success ? 'success' : 'fail', {
      headers: { 'Content-Type': 'text/plain' },
    });
  } catch (error) {
    console.error('Alipay notify error:', error);
    return new Response('fail', {
      headers: { 'Content-Type': 'text/plain' },
    });
  }
}
