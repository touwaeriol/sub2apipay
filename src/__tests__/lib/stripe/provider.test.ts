import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/config', () => ({
  getEnv: () => ({
    STRIPE_SECRET_KEY: 'sk_test_fake_key',
    STRIPE_WEBHOOK_SECRET: 'whsec_test_fake_secret',
    NEXT_PUBLIC_APP_URL: 'https://pay.example.com',
    ORDER_TIMEOUT_MINUTES: 5,
  }),
}));

const mockSessionCreate = vi.fn();
const mockSessionRetrieve = vi.fn();
const mockRefundCreate = vi.fn();
const mockWebhooksConstructEvent = vi.fn();

vi.mock('stripe', () => {
  const StripeMock = function (this: Record<string, unknown>) {
    this.checkout = {
      sessions: {
        create: mockSessionCreate,
        retrieve: mockSessionRetrieve,
      },
    };
    this.refunds = {
      create: mockRefundCreate,
    };
    this.webhooks = {
      constructEvent: mockWebhooksConstructEvent,
    };
  };
  return { default: StripeMock };
});

import { StripeProvider } from '@/lib/stripe/provider';
import type { CreatePaymentRequest, RefundRequest } from '@/lib/payment/types';

describe('StripeProvider', () => {
  let provider: StripeProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new StripeProvider();
  });

  describe('metadata', () => {
    it('should have name "stripe"', () => {
      expect(provider.name).toBe('stripe');
    });

    it('should support "stripe" payment type', () => {
      expect(provider.supportedTypes).toEqual(['stripe']);
    });
  });

  describe('createPayment', () => {
    it('should create a checkout session and return checkoutUrl', async () => {
      mockSessionCreate.mockResolvedValue({
        id: 'cs_test_abc123',
        url: 'https://checkout.stripe.com/pay/cs_test_abc123',
      });

      const request: CreatePaymentRequest = {
        orderId: 'order-001',
        amount: 99.99,
        paymentType: 'stripe',
        subject: 'Sub2API Balance Recharge 99.99 CNY',
        clientIp: '127.0.0.1',
      };

      const result = await provider.createPayment(request);

      expect(result.tradeNo).toBe('cs_test_abc123');
      expect(result.checkoutUrl).toBe('https://checkout.stripe.com/pay/cs_test_abc123');
      expect(mockSessionCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'payment',
          payment_method_types: ['card'],
          metadata: { orderId: 'order-001' },
          expires_at: expect.any(Number),
          line_items: [
            expect.objectContaining({
              price_data: expect.objectContaining({
                currency: 'cny',
                unit_amount: 9999,
              }),
              quantity: 1,
            }),
          ],
        }),
        expect.objectContaining({
          idempotencyKey: 'checkout-order-001',
        }),
      );
    });

    it('should handle session with null url', async () => {
      mockSessionCreate.mockResolvedValue({
        id: 'cs_test_no_url',
        url: null,
      });

      const request: CreatePaymentRequest = {
        orderId: 'order-002',
        amount: 10,
        paymentType: 'stripe',
        subject: 'Test',
      };

      const result = await provider.createPayment(request);
      expect(result.tradeNo).toBe('cs_test_no_url');
      expect(result.checkoutUrl).toBeUndefined();
    });
  });

  describe('queryOrder', () => {
    it('should return paid status for paid session', async () => {
      mockSessionRetrieve.mockResolvedValue({
        id: 'cs_test_abc123',
        payment_status: 'paid',
        amount_total: 9999,
      });

      const result = await provider.queryOrder('cs_test_abc123');
      expect(result.tradeNo).toBe('cs_test_abc123');
      expect(result.status).toBe('paid');
      expect(result.amount).toBe(99.99);
    });

    it('should return failed status for expired session', async () => {
      mockSessionRetrieve.mockResolvedValue({
        id: 'cs_test_expired',
        payment_status: 'unpaid',
        status: 'expired',
        amount_total: 5000,
      });

      const result = await provider.queryOrder('cs_test_expired');
      expect(result.status).toBe('failed');
      expect(result.amount).toBe(50);
    });

    it('should return pending status for unpaid session', async () => {
      mockSessionRetrieve.mockResolvedValue({
        id: 'cs_test_pending',
        payment_status: 'unpaid',
        status: 'open',
        amount_total: 1000,
      });

      const result = await provider.queryOrder('cs_test_pending');
      expect(result.status).toBe('pending');
    });
  });

  describe('verifyNotification', () => {
    it('should verify and parse checkout.session.completed event', async () => {
      const mockEvent = {
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test_abc123',
            metadata: { orderId: 'order-001' },
            amount_total: 9999,
            payment_status: 'paid',
          },
        },
      };

      mockWebhooksConstructEvent.mockReturnValue(mockEvent);

      const result = await provider.verifyNotification('{"raw":"body"}', { 'stripe-signature': 'sig_test_123' });

      expect(result).not.toBeNull();
      expect(result!.tradeNo).toBe('cs_test_abc123');
      expect(result!.orderId).toBe('order-001');
      expect(result!.amount).toBe(99.99);
      expect(result!.status).toBe('success');
    });

    it('should return failed status for unpaid session', async () => {
      const mockEvent = {
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test_unpaid',
            metadata: { orderId: 'order-002' },
            amount_total: 5000,
            payment_status: 'unpaid',
          },
        },
      };

      mockWebhooksConstructEvent.mockReturnValue(mockEvent);

      const result = await provider.verifyNotification('body', { 'stripe-signature': 'sig' });
      expect(result).not.toBeNull();
      expect(result!.status).toBe('failed');
    });

    it('should return null for unhandled event types', async () => {
      mockWebhooksConstructEvent.mockReturnValue({
        type: 'payment_intent.created',
        data: { object: {} },
      });

      const result = await provider.verifyNotification('body', { 'stripe-signature': 'sig' });
      expect(result).toBeNull();
    });
  });

  describe('refund', () => {
    it('should refund via payment intent from session', async () => {
      mockSessionRetrieve.mockResolvedValue({
        id: 'cs_test_abc123',
        payment_intent: 'pi_test_payment_intent',
      });

      mockRefundCreate.mockResolvedValue({
        id: 're_test_refund_001',
        status: 'succeeded',
      });

      const request: RefundRequest = {
        tradeNo: 'cs_test_abc123',
        orderId: 'order-001',
        amount: 50,
        reason: 'customer request',
      };

      const result = await provider.refund(request);
      expect(result.refundId).toBe('re_test_refund_001');
      expect(result.status).toBe('success');
      expect(mockRefundCreate).toHaveBeenCalledWith({
        payment_intent: 'pi_test_payment_intent',
        amount: 5000,
        reason: 'requested_by_customer',
      });
    });

    it('should handle payment intent as object', async () => {
      mockSessionRetrieve.mockResolvedValue({
        id: 'cs_test_abc123',
        payment_intent: { id: 'pi_test_obj_intent', amount: 10000 },
      });

      mockRefundCreate.mockResolvedValue({
        id: 're_test_refund_002',
        status: 'pending',
      });

      const result = await provider.refund({
        tradeNo: 'cs_test_abc123',
        orderId: 'order-002',
        amount: 100,
      });

      expect(result.status).toBe('pending');
      expect(mockRefundCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          payment_intent: 'pi_test_obj_intent',
        }),
      );
    });

    it('should throw if no payment intent found', async () => {
      mockSessionRetrieve.mockResolvedValue({
        id: 'cs_test_no_pi',
        payment_intent: null,
      });

      await expect(
        provider.refund({
          tradeNo: 'cs_test_no_pi',
          orderId: 'order-003',
          amount: 20,
        }),
      ).rejects.toThrow('No payment intent found');
    });
  });
});
