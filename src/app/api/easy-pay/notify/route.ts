import { NextRequest } from 'next/server';
import { handlePaymentNotify } from '@/lib/order/service';
import { EasyPayProvider } from '@/lib/easy-pay/provider';

const easyPayProvider = new EasyPayProvider();

export async function GET(request: NextRequest) {
  try {
    const rawBody = request.nextUrl.searchParams.toString();
    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      headers[key] = value;
    });

    const notification = await easyPayProvider.verifyNotification(rawBody, headers);
    const success = await handlePaymentNotify(notification, easyPayProvider.name);
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
