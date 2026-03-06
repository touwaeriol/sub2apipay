import { NextRequest } from 'next/server';
import { handlePaymentNotify } from '@/lib/order/service';
import { paymentRegistry } from '@/lib/payment';
import type { PaymentType } from '@/lib/payment';
import { extractHeaders } from '@/lib/utils/api';

export async function GET(request: NextRequest) {
  try {
    // EasyPay 注册为 'alipay' 和 'wxpay' 类型，任一均可获取同一 provider 实例
    const provider = paymentRegistry.getProvider('alipay' as PaymentType);
    const rawBody = request.nextUrl.searchParams.toString();
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
    console.error('EasyPay notify error:', error);
    return new Response('fail', {
      headers: { 'Content-Type': 'text/plain' },
    });
  }
}
