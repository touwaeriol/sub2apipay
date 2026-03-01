import { describe, it, expect, beforeEach } from 'vitest';
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

class MockProvider implements PaymentProvider {
  readonly name: string;
  readonly supportedTypes: PaymentType[];

  constructor(name: string, types: PaymentType[]) {
    this.name = name;
    this.supportedTypes = types;
  }

  async createPayment(_request: CreatePaymentRequest): Promise<CreatePaymentResponse> {
    return { tradeNo: 'mock-trade-no' };
  }
  async queryOrder(_tradeNo: string): Promise<QueryOrderResponse> {
    return { tradeNo: 'mock', status: 'pending', amount: 0 };
  }
  async verifyNotification(_rawBody: string | Buffer, _headers: Record<string, string>): Promise<PaymentNotification> {
    return { tradeNo: 'mock', orderId: 'mock', amount: 0, status: 'success', rawData: {} };
  }
  async refund(_request: RefundRequest): Promise<RefundResponse> {
    return { refundId: 'mock', status: 'success' };
  }
}

import { PaymentProviderRegistry } from '@/lib/payment/registry';

describe('PaymentProviderRegistry', () => {
  let registry: PaymentProviderRegistry;

  beforeEach(() => {
    registry = new PaymentProviderRegistry();
  });

  it('should register and retrieve a provider', () => {
    const provider = new MockProvider('test-pay', ['alipay']);
    registry.register(provider);
    expect(registry.getProvider('alipay')).toBe(provider);
  });

  it('should throw for unregistered payment type', () => {
    expect(() => registry.getProvider('stripe')).toThrow('No payment provider registered for type: stripe');
  });

  it('should register a provider for multiple types', () => {
    const provider = new MockProvider('multi-pay', ['alipay', 'wxpay']);
    registry.register(provider);
    expect(registry.getProvider('alipay')).toBe(provider);
    expect(registry.getProvider('wxpay')).toBe(provider);
  });

  it('hasProvider should return correct boolean', () => {
    expect(registry.hasProvider('stripe')).toBe(false);
    const provider = new MockProvider('stripe-mock', ['stripe']);
    registry.register(provider);
    expect(registry.hasProvider('stripe')).toBe(true);
  });

  it('getSupportedTypes should list registered types', () => {
    const p1 = new MockProvider('easy', ['alipay', 'wxpay']);
    const p2 = new MockProvider('stripe', ['stripe']);
    registry.register(p1);
    registry.register(p2);
    const types = registry.getSupportedTypes();
    expect(types).toContain('alipay');
    expect(types).toContain('wxpay');
    expect(types).toContain('stripe');
  });

  it('later registration should override earlier for same type', () => {
    const p1 = new MockProvider('old-provider', ['alipay']);
    const p2 = new MockProvider('new-provider', ['alipay']);
    registry.register(p1);
    registry.register(p2);
    expect(registry.getProvider('alipay').name).toBe('new-provider');
  });
});
