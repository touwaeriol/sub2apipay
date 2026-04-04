import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mockGetCurrentUserByToken = vi.fn();
const mockGetUser = vi.fn();
const mockGetSystemConfig = vi.fn();
const mockQueryMethodLimits = vi.fn();
const mockGetSupportedTypes = vi.fn();

vi.mock('@/lib/sub2api/client', () => ({
  getCurrentUserByToken: (...args: unknown[]) => mockGetCurrentUserByToken(...args),
  getUser: (...args: unknown[]) => mockGetUser(...args),
}));

vi.mock('@/lib/config', () => ({
  getEnv: () => ({
    MIN_RECHARGE_AMOUNT: 1,
    MAX_RECHARGE_AMOUNT: 1000,
    MAX_DAILY_RECHARGE_AMOUNT: 10000,
    PAY_HELP_IMAGE_URL: undefined,
    PAY_HELP_TEXT: undefined,
    STRIPE_PUBLISHABLE_KEY: 'pk_test',
  }),
}));

vi.mock('@/lib/order/limits', () => ({
  queryMethodLimits: (...args: unknown[]) => mockQueryMethodLimits(...args),
}));

vi.mock('@/lib/payment', () => ({
  initPaymentProviders: vi.fn(),
  ensureDBProviders: vi.fn().mockResolvedValue(undefined),
  paymentRegistry: {
    getSupportedTypes: (...args: unknown[]) => mockGetSupportedTypes(...args),
  },
}));

vi.mock('@/lib/pay-utils', () => ({
  getPaymentDisplayInfo: (type: string) => ({
    channel: type === 'alipay_direct' ? 'alipay' : type,
    provider: type,
  }),
}));

vi.mock('@/lib/locale', () => ({
  resolveLocale: () => 'zh',
}));

vi.mock('@/lib/system-config', () => ({
  getSystemConfig: (...args: unknown[]) => mockGetSystemConfig(...args),
}));

vi.mock('@/lib/payment/resolve-enabled-types', () => ({
  resolveEnabledPaymentTypes: (supported: string[], configured: string | undefined) => {
    if (!configured || configured.trim() === '') return supported;
    const set = new Set(
      configured
        .split(',')
        .map((s: string) => s.trim())
        .filter(Boolean),
    );
    return supported.filter((t: string) => set.has(t));
  },
}));

import { GET } from '@/app/api/user/route';

function createRequest(params?: Record<string, string>) {
  const qs = new URLSearchParams({ user_id: '1', token: 'test-token', ...params });
  return new NextRequest(`https://pay.example.com/api/user?${qs}`);
}

describe('GET /api/user', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentUserByToken.mockResolvedValue({ id: 1, status: 'active' });
    mockGetUser.mockResolvedValue({ id: 1, status: 'active' });
    mockGetSupportedTypes.mockReturnValue(['alipay', 'wxpay', 'stripe']);
    mockQueryMethodLimits.mockResolvedValue({
      alipay: { maxDailyAmount: 1000 },
      wxpay: { maxDailyAmount: 1000 },
      stripe: { maxDailyAmount: 1000 },
    });
    mockGetSystemConfig.mockImplementation(async (key: string) => {
      if (key === 'ENABLED_PAYMENT_TYPES') return undefined;
      if (key === 'BALANCE_PAYMENT_DISABLED') return 'false';
      return undefined;
    });
  });

  // ── Auth tests ──

  it('returns 400 for invalid user_id', async () => {
    const res = await GET(new NextRequest('https://pay.example.com/api/user?user_id=abc&token=t'));
    expect(res.status).toBe(400);
  });

  it('returns 400 for missing user_id', async () => {
    const res = await GET(new NextRequest('https://pay.example.com/api/user?token=t'));
    expect(res.status).toBe(400);
  });

  it('returns 400 for user_id <= 0', async () => {
    const res = await GET(new NextRequest('https://pay.example.com/api/user?user_id=0&token=t'));
    expect(res.status).toBe(400);
  });

  it('returns 401 for missing token', async () => {
    const res = await GET(new NextRequest('https://pay.example.com/api/user?user_id=1'));
    expect(res.status).toBe(401);
  });

  it('returns 401 for invalid token', async () => {
    mockGetCurrentUserByToken.mockRejectedValue(new Error('Failed'));
    const res = await GET(createRequest());
    expect(res.status).toBe(401);
  });

  it('returns 403 when token user_id does not match requested user_id', async () => {
    mockGetCurrentUserByToken.mockResolvedValue({ id: 999, status: 'active' });
    const res = await GET(createRequest());
    expect(res.status).toBe(403);
  });

  it('returns 404 for USER_NOT_FOUND', async () => {
    mockGetCurrentUserByToken.mockResolvedValue({ id: 1, status: 'active' });
    mockGetSystemConfig.mockRejectedValue(new Error('USER_NOT_FOUND'));

    const res = await GET(createRequest());
    expect(res.status).toBe(404);
  });

  // ── Payment type filtering tests ──

  it('filters enabled payment types by ENABLED_PAYMENT_TYPES config', async () => {
    mockGetSystemConfig.mockImplementation(async (key: string) => {
      if (key === 'ENABLED_PAYMENT_TYPES') return 'alipay,wxpay';
      if (key === 'BALANCE_PAYMENT_DISABLED') return 'false';
      return undefined;
    });

    const response = await GET(createRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.config.enabledPaymentTypes).toEqual(['alipay', 'wxpay']);
    expect(mockQueryMethodLimits).toHaveBeenCalledWith(['alipay', 'wxpay']);
  });

  it('falls back to supported payment types when ENABLED_PAYMENT_TYPES is empty', async () => {
    mockGetSystemConfig.mockImplementation(async (key: string) => {
      if (key === 'ENABLED_PAYMENT_TYPES') return '   ';
      if (key === 'BALANCE_PAYMENT_DISABLED') return 'false';
      return undefined;
    });

    const response = await GET(createRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.config.enabledPaymentTypes).toEqual(['alipay', 'wxpay', 'stripe']);
    expect(mockQueryMethodLimits).toHaveBeenCalledWith(['alipay', 'wxpay', 'stripe']);
  });

  it('falls back to supported payment types when ENABLED_PAYMENT_TYPES is undefined', async () => {
    const response = await GET(createRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.config.enabledPaymentTypes).toEqual(['alipay', 'wxpay', 'stripe']);
    expect(mockQueryMethodLimits).toHaveBeenCalledWith(['alipay', 'wxpay', 'stripe']);
  });

  // ── Config defaults tests ──

  it('returns balanceDisabled from system config', async () => {
    mockGetSystemConfig.mockImplementation(async (key: string) => {
      if (key === 'BALANCE_PAYMENT_DISABLED') return 'true';
      return undefined;
    });

    const response = await GET(createRequest());
    const data = await response.json();
    expect(data.config.balanceDisabled).toBe(true);
  });

  it('defaults maxPendingOrders to 3 when config is missing', async () => {
    const response = await GET(createRequest());
    const data = await response.json();
    expect(data.config.maxPendingOrders).toBe(3);
  });

  it('uses configured maxPendingOrders when available', async () => {
    mockGetSystemConfig.mockImplementation(async (key: string) => {
      if (key === 'MAX_PENDING_ORDERS') return '5';
      return undefined;
    });

    const response = await GET(createRequest());
    const data = await response.json();
    expect(data.config.maxPendingOrders).toBe(5);
  });

  // ── Sublabel conflict detection ──

  it('generates sublabel overrides when multiple types share same label', async () => {
    // alipay and alipay_direct both have channel "alipay" in the mock
    mockGetSupportedTypes.mockReturnValue(['alipay', 'alipay_direct', 'stripe']);
    mockQueryMethodLimits.mockResolvedValue({});

    const response = await GET(createRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    // Both should have sublabel overrides since they share the "alipay" channel label
    expect(data.config.sublabelOverrides).toBeTruthy();
    expect(data.config.sublabelOverrides.alipay).toBeDefined();
    expect(data.config.sublabelOverrides.alipay_direct).toBeDefined();
  });

  it('returns null sublabelOverrides when no conflicts', async () => {
    // Each type has a unique channel label
    mockGetSupportedTypes.mockReturnValue(['stripe']);
    mockQueryMethodLimits.mockResolvedValue({});

    const response = await GET(createRequest());
    const data = await response.json();

    expect(data.config.sublabelOverrides).toBeNull();
  });

  // ── Response structure ──

  it('returns correct user and config structure', async () => {
    const response = await GET(createRequest());
    const data = await response.json();

    expect(data.user).toEqual({ id: 1, status: 'active' });
    expect(data.config).toHaveProperty('enabledPaymentTypes');
    expect(data.config).toHaveProperty('minAmount');
    expect(data.config).toHaveProperty('maxAmount');
    expect(data.config).toHaveProperty('maxDailyAmount');
    expect(data.config).toHaveProperty('methodLimits');
    expect(data.config).toHaveProperty('balanceDisabled');
    expect(data.config).toHaveProperty('maxPendingOrders');
  });
});
