import { describe, expect, it, vi } from 'vitest';

// Mock transitive dependencies to prevent env validation
vi.mock('@/lib/system-config', () => ({
  getSystemConfig: vi.fn(),
}));

vi.mock('@/lib/payment', () => ({
  initPaymentProviders: vi.fn(),
  ensureDBProviders: vi.fn().mockResolvedValue(undefined),
  paymentRegistry: { getSupportedTypes: () => [] },
}));

import { resolveEnabledPaymentTypes } from '@/lib/payment/resolve-enabled-types';

describe('resolveEnabledPaymentTypes', () => {
  const allTypes = ['alipay', 'wxpay', 'stripe'];

  it('returns all supported types when configuredTypes is undefined', () => {
    expect(resolveEnabledPaymentTypes(allTypes, undefined)).toEqual(allTypes);
  });

  it('returns all supported types when configuredTypes is empty string', () => {
    expect(resolveEnabledPaymentTypes(allTypes, '')).toEqual(allTypes);
  });

  it('returns all supported types when configuredTypes is whitespace', () => {
    expect(resolveEnabledPaymentTypes(allTypes, '   ')).toEqual(allTypes);
  });

  it('filters to configured types that exist in supported', () => {
    expect(resolveEnabledPaymentTypes(allTypes, 'alipay,stripe')).toEqual(['alipay', 'stripe']);
  });

  it('ignores configured types not in supported list', () => {
    expect(resolveEnabledPaymentTypes(allTypes, 'alipay,paypal')).toEqual(['alipay']);
  });

  it('handles whitespace around type names', () => {
    expect(resolveEnabledPaymentTypes(allTypes, ' alipay , wxpay ')).toEqual(['alipay', 'wxpay']);
  });

  it('preserves order from supported types', () => {
    expect(resolveEnabledPaymentTypes(allTypes, 'stripe,alipay')).toEqual(['alipay', 'stripe']);
  });

  it('returns empty array when no configured types match', () => {
    expect(resolveEnabledPaymentTypes(allTypes, 'paypal,bitcoin')).toEqual([]);
  });

  it('handles single type', () => {
    expect(resolveEnabledPaymentTypes(allTypes, 'wxpay')).toEqual(['wxpay']);
  });
});
