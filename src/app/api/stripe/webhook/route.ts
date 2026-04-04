import { NextRequest, NextResponse } from 'next/server';
import { ensureDBProviders, paymentRegistry } from '@/lib/payment';
import type { PaymentType } from '@/lib/payment';
import { handlePaymentNotify } from '@/lib/order/service';
import { extractHeaders } from '@/lib/utils/api';

// Stripe needs raw body - ensure Next.js doesn't parse it
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    await ensureDBProviders();
    const provider = paymentRegistry.getProvider('stripe' as PaymentType);

    const rawBody = Buffer.from(await request.arrayBuffer());
    const headers = extractHeaders(request);

    const notification = await provider.verifyNotification(rawBody, headers);
    if (!notification) {
      // Unknown event type — acknowledge receipt
      return NextResponse.json({ received: true });
    }
    const success = await handlePaymentNotify(notification, provider.name);

    if (!success) {
      // 处理失败（充值未完成等），返回 500 让 Stripe 重试
      return NextResponse.json({ error: 'Processing failed, will retry' }, { status: 500 });
    }
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Stripe webhook error:', error);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 400 });
  }
}
