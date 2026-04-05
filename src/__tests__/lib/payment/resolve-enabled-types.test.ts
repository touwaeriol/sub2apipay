import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetSystemConfig = vi.fn();
const mockFindMany = vi.fn();
const mockGetSupportedTypes = vi.fn();
const mockGetProviderKey = vi.fn();

// Mock transitive dependencies to prevent env validation
vi.mock('@/lib/system-config', () => ({
  getSystemConfig: (...args: unknown[]) => mockGetSystemConfig(...args),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    paymentProviderInstance: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
    },
  },
}));

vi.mock('@/lib/payment', () => ({
  initPaymentProviders: vi.fn(),
  paymentRegistry: {
    getSupportedTypes: (...args: unknown[]) => mockGetSupportedTypes(...args),
    getProviderKey: (...args: unknown[]) => mockGetProviderKey(...args),
  },
}));

import {
  getEnabledPaymentTypes,
  resolveEnabledPaymentTypes,
} from '@/lib/payment/resolve-enabled-types';

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSystemConfig.mockResolvedValue(undefined);
  mockFindMany.mockResolvedValue([]);
  mockGetSupportedTypes.mockReturnValue([]);
  mockGetProviderKey.mockReturnValue(undefined);
});

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

describe('getEnabledPaymentTypes', () => {
  it('filters configured payment types by enabled provider instances', async () => {
    mockGetSupportedTypes.mockReturnValue(['alipay', 'wxpay', 'stripe']);
    mockGetProviderKey.mockImplementation((type: string) => {
      if (type === 'alipay' || type === 'wxpay') return 'easypay';
      if (type === 'stripe') return 'stripe';
      return undefined;
    });
    mockGetSystemConfig.mockResolvedValue('alipay,wxpay');
    mockFindMany.mockResolvedValue([{ providerKey: 'easypay', supportedTypes: 'wxpay' }]);

    await expect(getEnabledPaymentTypes()).resolves.toEqual(['wxpay']);
  });

  it('treats empty instance supportedTypes as wildcard', async () => {
    mockGetSupportedTypes.mockReturnValue(['alipay', 'wxpay']);
    mockGetProviderKey.mockReturnValue('easypay');
    mockGetSystemConfig.mockResolvedValue('alipay,wxpay');
    mockFindMany.mockResolvedValue([{ providerKey: 'easypay', supportedTypes: '' }]);

    await expect(getEnabledPaymentTypes()).resolves.toEqual(['alipay', 'wxpay']);
  });

  it('preserves payment types for providers without enabled instances', async () => {
    mockGetSupportedTypes.mockReturnValue(['alipay', 'wxpay', 'stripe']);
    mockGetProviderKey.mockImplementation((type: string) => {
      if (type === 'alipay' || type === 'wxpay') return 'easypay';
      if (type === 'stripe') return 'stripe';
      return undefined;
    });
    mockGetSystemConfig.mockResolvedValue('stripe');
    mockFindMany.mockResolvedValue([{ providerKey: 'easypay', supportedTypes: 'wxpay' }]);

    await expect(getEnabledPaymentTypes()).resolves.toEqual(['stripe']);
  });
});
