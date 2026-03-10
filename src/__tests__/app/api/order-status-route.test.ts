import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mockFindUnique = vi.fn();
const mockVerifyAdminToken = vi.fn();

vi.mock('@/lib/db', () => ({
  prisma: {
    order: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
    },
  },
}));

vi.mock('@/lib/config', () => ({
  getEnv: () => ({
    ADMIN_TOKEN: 'test-admin-token',
  }),
}));

vi.mock('@/lib/admin-auth', () => ({
  verifyAdminToken: (...args: unknown[]) => mockVerifyAdminToken(...args),
}));

import { GET } from '@/app/api/orders/[id]/route';
import { createOrderStatusAccessToken } from '@/lib/order/status-access';

function createRequest(orderId: string, accessToken?: string) {
  const url = new URL(`https://pay.example.com/api/orders/${orderId}`);
  if (accessToken) {
    url.searchParams.set('access_token', accessToken);
  }
  return new NextRequest(url);
}

describe('GET /api/orders/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyAdminToken.mockResolvedValue(false);
    mockFindUnique.mockResolvedValue({
      id: 'order-001',
      status: 'PENDING',
      expiresAt: new Date('2026-03-10T00:00:00.000Z'),
      paidAt: null,
      completedAt: null,
    });
  });

  it('rejects requests without access token', async () => {
    const response = await GET(createRequest('order-001'), { params: Promise.resolve({ id: 'order-001' }) });
    expect(response.status).toBe(401);
  });

  it('returns order status with valid access token', async () => {
    const token = createOrderStatusAccessToken('order-001');
    const response = await GET(createRequest('order-001', token), { params: Promise.resolve({ id: 'order-001' }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.id).toBe('order-001');
    expect(data.paymentSuccess).toBe(false);
  });

  it('allows admin-authenticated access as fallback', async () => {
    mockVerifyAdminToken.mockResolvedValue(true);
    const response = await GET(createRequest('order-001'), { params: Promise.resolve({ id: 'order-001' }) });

    expect(response.status).toBe(200);
  });
});
