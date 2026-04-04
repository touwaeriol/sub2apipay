import { NextRequest } from 'next/server';
import { handlePaymentNotify } from '@/lib/order/service';
import { ensureDBProviders, paymentRegistry } from '@/lib/payment';
import type { PaymentType, PaymentProvider } from '@/lib/payment';
import { EasyPayProvider } from '@/lib/easy-pay/provider';
import { getInstanceConfig } from '@/lib/payment/load-balancer';
import { extractHeaders } from '@/lib/utils/api';

export async function GET(request: NextRequest) {
  try {
    const instId = request.nextUrl.searchParams.get('inst');

    let provider: PaymentProvider;
    if (instId) {
      // 多实例模式：根据实例 ID 获取配置
      const config = await getInstanceConfig(instId);
      if (!config) {
        return new Response('Invalid instance', { status: 400, headers: { 'Content-Type': 'text/plain' } });
      }
      provider = new EasyPayProvider(instId, config);
    } else {
      // 回退到环境变量单实例模式
      await ensureDBProviders();
      provider = paymentRegistry.getProvider('alipay' as PaymentType);
    }

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
