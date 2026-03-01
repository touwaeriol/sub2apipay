import Stripe from 'stripe';
import { Prisma } from '@prisma/client';
import { getEnv } from '@/lib/config';
import type {
  PaymentProvider,
  PaymentType,
  CreatePaymentRequest,
  CreatePaymentResponse,
  QueryOrderResponse,
  PaymentNotification,
  RefundRequest,
  RefundResponse,
} from '@/lib/payment/types';

export class StripeProvider implements PaymentProvider {
  readonly name = 'stripe';
  readonly supportedTypes: PaymentType[] = ['stripe'];

  private client: Stripe | null = null;

  private getClient(): Stripe {
    if (this.client) return this.client;
    const env = getEnv();
    if (!env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY not configured');
    this.client = new Stripe(env.STRIPE_SECRET_KEY);
    return this.client;
  }

  async createPayment(request: CreatePaymentRequest): Promise<CreatePaymentResponse> {
    const stripe = this.getClient();
    const env = getEnv();

    const timeoutMinutes = Math.max(30, env.ORDER_TIMEOUT_MINUTES); // Stripe minimum is 30 minutes

    const session = await stripe.checkout.sessions.create(
      {
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'cny',
              product_data: { name: request.subject },
              unit_amount: Math.round(new Prisma.Decimal(request.amount).mul(100).toNumber()),
            },
            quantity: 1,
          },
        ],
        metadata: { orderId: request.orderId },
        expires_at: Math.floor(Date.now() / 1000) + timeoutMinutes * 60,
        success_url: `${env.NEXT_PUBLIC_APP_URL}/pay/result?order_id=${request.orderId}&status=success`,
        cancel_url: `${env.NEXT_PUBLIC_APP_URL}/pay/result?order_id=${request.orderId}&status=cancelled`,
      },
      { idempotencyKey: `checkout-${request.orderId}` },
    );

    return {
      tradeNo: session.id,
      checkoutUrl: session.url || undefined,
    };
  }

  async queryOrder(tradeNo: string): Promise<QueryOrderResponse> {
    const stripe = this.getClient();
    const session = await stripe.checkout.sessions.retrieve(tradeNo);

    let status: QueryOrderResponse['status'] = 'pending';
    if (session.payment_status === 'paid') status = 'paid';
    else if (session.status === 'expired') status = 'failed';

    return {
      tradeNo: session.id,
      status,
      amount: new Prisma.Decimal(session.amount_total || 0).div(100).toNumber(),
    };
  }

  async verifyNotification(rawBody: string | Buffer, headers: Record<string, string>): Promise<PaymentNotification | null> {
    const stripe = this.getClient();
    const env = getEnv();
    if (!env.STRIPE_WEBHOOK_SECRET) throw new Error('STRIPE_WEBHOOK_SECRET not configured');

    const sig = headers['stripe-signature'] || '';
    const event = stripe.webhooks.constructEvent(
      typeof rawBody === 'string' ? Buffer.from(rawBody) : rawBody,
      sig,
      env.STRIPE_WEBHOOK_SECRET,
    );

    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
      const session = event.data.object as Stripe.Checkout.Session;
      return {
        tradeNo: session.id,
        orderId: session.metadata?.orderId || '',
        amount: new Prisma.Decimal(session.amount_total || 0).div(100).toNumber(),
        status: session.payment_status === 'paid' ? 'success' : 'failed',
        rawData: event,
      };
    }

    if (event.type === 'checkout.session.async_payment_failed') {
      const session = event.data.object as Stripe.Checkout.Session;
      return {
        tradeNo: session.id,
        orderId: session.metadata?.orderId || '',
        amount: new Prisma.Decimal(session.amount_total || 0).div(100).toNumber(),
        status: 'failed',
        rawData: event,
      };
    }

    // Unknown event — return null (caller returns 200 to Stripe)
    return null;
  }

  async refund(request: RefundRequest): Promise<RefundResponse> {
    const stripe = this.getClient();

    // Retrieve checkout session to find the payment intent
    const session = await stripe.checkout.sessions.retrieve(request.tradeNo);
    if (!session.payment_intent) throw new Error('No payment intent found for session');

    const refund = await stripe.refunds.create({
      payment_intent: typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent.id,
      amount: Math.round(new Prisma.Decimal(request.amount).mul(100).toNumber()),
      reason: 'requested_by_customer',
    });

    return {
      refundId: refund.id,
      status: refund.status === 'succeeded' ? 'success' : 'pending',
    };
  }

  async cancelPayment(tradeNo: string): Promise<void> {
    const stripe = this.getClient();
    await stripe.checkout.sessions.expire(tradeNo);
  }
}
