import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mockGetCurrentUserByToken = vi.fn();

vi.mock('@/lib/sub2api/client', () => ({
  getCurrentUserByToken: (...args: unknown[]) => mockGetCurrentUserByToken(...args),
}));

const mockOrderFindMany = vi.fn();
const mockOrderCount = vi.fn();
const mockOrderGroupBy = vi.fn();
const mockInstanceFindMany = vi.fn();

vi.mock('@/lib/db', () => ({
  prisma: {
    order: {
      findMany: (...args: unknown[]) => mockOrderFindMany(...args),
      count: (...args: unknown[]) => mockOrderCount(...args),
      groupBy: (...args: unknown[]) => mockOrderGroupBy(...args),
    },
    paymentProviderInstance: {
      findMany: (...args: unknown[]) => mockInstanceFindMany(...args),
    },
  },
}));

vi.mock('@/lib/order/status', () => ({
  deriveOrderState: () => ({
    paymentSuccess: true,
    rechargeSuccess: true,
    rechargeStatus: 'success',
  }),
  isRechargeRetryable: () => false,
}));

import { GET } from '@/app/api/orders/my/route';

function createRequest(params?: Record<string, string>) {
  const qs = new URLSearchParams({ token: 'test-token', ...params });
  return new NextRequest(`https://pay.example.com/api/orders/my?${qs}`);
}

describe('GET /api/orders/my - canRefundRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentUserByToken.mockResolvedValue({
      id: 1,
      username: 'testuser',
      email: 'test@example.com',
      balance: 100,
    });
    mockOrderCount.mockResolvedValue(0);
    mockOrderGroupBy.mockResolvedValue([]);
    mockOrderFindMany.mockResolvedValue([]);
    mockInstanceFindMany.mockResolvedValue([]);
  });

  it('returns 400 when token is missing', async () => {
    const res = await GET(new NextRequest('https://pay.example.com/api/orders/my'));
    expect(res.status).toBe(400);
  });

  it('returns 401 when auth fails', async () => {
    mockGetCurrentUserByToken.mockRejectedValue(new Error('invalid token'));
    const res = await GET(createRequest());
    expect(res.status).toBe(401);
  });

  it('canRefundRequest = true when orderType=balance + status=COMPLETED + refundEnabled=true', async () => {
    mockOrderFindMany.mockResolvedValue([
      {
        id: 'order-001',
        amount: 100,
        status: 'COMPLETED',
        paymentType: 'alipay',
        createdAt: new Date(),
        paidAt: new Date(),
        completedAt: new Date(),
        orderType: 'balance',
        providerInstanceId: 'inst-001',
      },
    ]);
    mockOrderCount.mockResolvedValue(1);
    mockOrderGroupBy.mockResolvedValue([{ status: 'COMPLETED', _count: 1 }]);
    mockInstanceFindMany.mockResolvedValue([{ id: 'inst-001', refundEnabled: true }]);

    const res = await GET(createRequest());
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.orders[0].canRefundRequest).toBe(true);
  });

  it('canRefundRequest = false when orderType=subscription', async () => {
    mockOrderFindMany.mockResolvedValue([
      {
        id: 'order-002',
        amount: 50,
        status: 'COMPLETED',
        paymentType: 'alipay',
        createdAt: new Date(),
        paidAt: new Date(),
        completedAt: new Date(),
        orderType: 'subscription',
        providerInstanceId: 'inst-001',
      },
    ]);
    mockOrderCount.mockResolvedValue(1);
    mockOrderGroupBy.mockResolvedValue([{ status: 'COMPLETED', _count: 1 }]);
    mockInstanceFindMany.mockResolvedValue([{ id: 'inst-001', refundEnabled: true }]);

    const res = await GET(createRequest());
    const data = await res.json();

    expect(data.orders[0].canRefundRequest).toBe(false);
  });

  it('canRefundRequest = false when status is not COMPLETED', async () => {
    mockOrderFindMany.mockResolvedValue([
      {
        id: 'order-003',
        amount: 100,
        status: 'PENDING',
        paymentType: 'alipay',
        createdAt: new Date(),
        paidAt: null,
        completedAt: null,
        orderType: 'balance',
        providerInstanceId: 'inst-001',
      },
    ]);
    mockOrderCount.mockResolvedValue(1);
    mockOrderGroupBy.mockResolvedValue([{ status: 'PENDING', _count: 1 }]);
    mockInstanceFindMany.mockResolvedValue([{ id: 'inst-001', refundEnabled: true }]);

    const res = await GET(createRequest());
    const data = await res.json();

    expect(data.orders[0].canRefundRequest).toBe(false);
  });

  it('canRefundRequest = false when refundEnabled=false', async () => {
    mockOrderFindMany.mockResolvedValue([
      {
        id: 'order-004',
        amount: 100,
        status: 'COMPLETED',
        paymentType: 'alipay',
        createdAt: new Date(),
        paidAt: new Date(),
        completedAt: new Date(),
        orderType: 'balance',
        providerInstanceId: 'inst-001',
      },
    ]);
    mockOrderCount.mockResolvedValue(1);
    mockOrderGroupBy.mockResolvedValue([{ status: 'COMPLETED', _count: 1 }]);
    mockInstanceFindMany.mockResolvedValue([{ id: 'inst-001', refundEnabled: false }]);

    const res = await GET(createRequest());
    const data = await res.json();

    expect(data.orders[0].canRefundRequest).toBe(false);
  });

  it('canRefundRequest = false when providerInstanceId is null', async () => {
    mockOrderFindMany.mockResolvedValue([
      {
        id: 'order-005',
        amount: 100,
        status: 'COMPLETED',
        paymentType: 'alipay',
        createdAt: new Date(),
        paidAt: new Date(),
        completedAt: new Date(),
        orderType: 'balance',
        providerInstanceId: null,
      },
    ]);
    mockOrderCount.mockResolvedValue(1);
    mockOrderGroupBy.mockResolvedValue([{ status: 'COMPLETED', _count: 1 }]);

    const res = await GET(createRequest());
    const data = await res.json();

    expect(data.orders[0].canRefundRequest).toBe(false);
  });

  it('canRefundRequest = false when instance not found in DB', async () => {
    mockOrderFindMany.mockResolvedValue([
      {
        id: 'order-006',
        amount: 100,
        status: 'COMPLETED',
        paymentType: 'alipay',
        createdAt: new Date(),
        paidAt: new Date(),
        completedAt: new Date(),
        orderType: 'balance',
        providerInstanceId: 'inst-missing',
      },
    ]);
    mockOrderCount.mockResolvedValue(1);
    mockOrderGroupBy.mockResolvedValue([{ status: 'COMPLETED', _count: 1 }]);
    // 实例查询不返回 inst-missing
    mockInstanceFindMany.mockResolvedValue([]);

    const res = await GET(createRequest());
    const data = await res.json();

    expect(data.orders[0].canRefundRequest).toBe(false);
  });

  it('mixed orders: only balance+COMPLETED+refundEnabled gets canRefundRequest=true', async () => {
    mockOrderFindMany.mockResolvedValue([
      {
        id: 'order-a',
        amount: 100,
        status: 'COMPLETED',
        paymentType: 'alipay',
        createdAt: new Date(),
        paidAt: new Date(),
        completedAt: new Date(),
        orderType: 'balance',
        providerInstanceId: 'inst-001',
      },
      {
        id: 'order-b',
        amount: 50,
        status: 'COMPLETED',
        paymentType: 'alipay',
        createdAt: new Date(),
        paidAt: new Date(),
        completedAt: new Date(),
        orderType: 'subscription',
        providerInstanceId: 'inst-001',
      },
      {
        id: 'order-c',
        amount: 100,
        status: 'PENDING',
        paymentType: 'alipay',
        createdAt: new Date(),
        paidAt: null,
        completedAt: null,
        orderType: 'balance',
        providerInstanceId: 'inst-001',
      },
    ]);
    mockOrderCount.mockResolvedValue(3);
    mockOrderGroupBy.mockResolvedValue([
      { status: 'COMPLETED', _count: 2 },
      { status: 'PENDING', _count: 1 },
    ]);
    mockInstanceFindMany.mockResolvedValue([{ id: 'inst-001', refundEnabled: true }]);

    const res = await GET(createRequest());
    const data = await res.json();

    expect(data.orders[0].canRefundRequest).toBe(true); // balance + COMPLETED + refundEnabled
    expect(data.orders[1].canRefundRequest).toBe(false); // subscription
    expect(data.orders[2].canRefundRequest).toBe(false); // PENDING
  });
});
