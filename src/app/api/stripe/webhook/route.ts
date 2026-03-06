import { NextRequest, NextResponse } from 'next/server';
import { paymentRegistry } from '@/lib/payment';
import type { PaymentType } from '@/lib/payment';
import { handlePaymentNotify } from '@/lib/order/service';
import { extractHeaders } from '@/lib/utils/api';

// Stripe needs raw body - ensure Next.js doesn't parse it
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const provider = paymentRegistry.getProvider('stripe' as PaymentType);

    const rawBody = Buffer.from(await request.arrayBuffer());
    const headers = extractHeaders(request);

    const notification = await provider.verifyNotification(rawBody, headers);
    if (!notification) {
      // Unknown event type — acknowledge receipt
      return NextResponse.json({ received: true });
    }
    await handlePaymentNotify(notification, provider.name);

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Stripe webhook error:', error);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 400 });
  }
}
