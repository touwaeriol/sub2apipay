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
  readonly providerKey = 'stripe';
  readonly supportedTypes: PaymentType[] = ['stripe'];
  readonly defaultLimits = {
    stripe: { singleMax: 0, dailyMax: 0 }, // 0 = unlimited
  };

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

    const amountInCents = Math.round(new Prisma.Decimal(request.amount).mul(100).toNumber());

    const pi = await stripe.paymentIntents.create(
      {
        amount: amountInCents,
        currency: 'cny',
        automatic_payment_methods: { enabled: true },
        metadata: { orderId: request.orderId },
        description: request.subject,
      },
      { idempotencyKey: `pi-${request.orderId}` },
    );

    return {
      tradeNo: pi.id,
      clientSecret: pi.client_secret || undefined,
    };
  }

  async queryOrder(tradeNo: string): Promise<QueryOrderResponse> {
    const stripe = this.getClient();
    const pi = await stripe.paymentIntents.retrieve(tradeNo);

    let status: QueryOrderResponse['status'] = 'pending';
    if (pi.status === 'succeeded') status = 'paid';
    else if (pi.status === 'canceled') status = 'failed';

    return {
      tradeNo: pi.id,
      status,
      amount: new Prisma.Decimal(pi.amount).div(100).toNumber(),
    };
  }

  async verifyNotification(
    rawBody: string | Buffer,
    headers: Record<string, string>,
  ): Promise<PaymentNotification | null> {
    const stripe = this.getClient();
    const env = getEnv();
    if (!env.STRIPE_WEBHOOK_SECRET) throw new Error('STRIPE_WEBHOOK_SECRET not configured');

    const sig = headers['stripe-signature'] || '';
    const event = stripe.webhooks.constructEvent(
      typeof rawBody === 'string' ? Buffer.from(rawBody) : rawBody,
      sig,
      env.STRIPE_WEBHOOK_SECRET,
    );

    if (event.type === 'payment_intent.succeeded') {
      const pi = event.data.object as Stripe.PaymentIntent;
      return {
        tradeNo: pi.id,
        orderId: pi.metadata?.orderId || '',
        amount: new Prisma.Decimal(pi.amount).div(100).toNumber(),
        status: 'success',
        rawData: event,
      };
    }

    if (event.type === 'payment_intent.payment_failed') {
      const pi = event.data.object as Stripe.PaymentIntent;
      return {
        tradeNo: pi.id,
        orderId: pi.metadata?.orderId || '',
        amount: new Prisma.Decimal(pi.amount).div(100).toNumber(),
        status: 'failed',
        rawData: event,
      };
    }

    // Unknown event — return null (caller returns 200 to Stripe)
    return null;
  }

  async refund(request: RefundRequest): Promise<RefundResponse> {
    const stripe = this.getClient();

    // tradeNo is now the PaymentIntent ID directly
    const refund = await stripe.refunds.create({
      payment_intent: request.tradeNo,
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
    await stripe.paymentIntents.cancel(tradeNo);
  }
}
