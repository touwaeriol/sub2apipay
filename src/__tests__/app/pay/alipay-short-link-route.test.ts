import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ORDER_STATUS } from '@/lib/constants';

const mockFindUnique = vi.fn();
const mockBuildAlipayPaymentUrl = vi.fn();

vi.mock('@/lib/db', () => ({
  prisma: {
    order: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
    },
  },
}));

vi.mock('@/lib/config', () => ({
  getEnv: () => ({
    NEXT_PUBLIC_APP_URL: 'https://pay.example.com',
    PRODUCT_NAME: 'Sub2API Balance Recharge',
    ALIPAY_NOTIFY_URL: 'https://pay.example.com/api/alipay/notify',
    ALIPAY_RETURN_URL: 'https://pay.example.com/pay/result',
    ADMIN_TOKEN: 'test-admin-token',
  }),
}));

vi.mock('@/lib/alipay/provider', () => ({
  buildAlipayPaymentUrl: (...args: unknown[]) => mockBuildAlipayPaymentUrl(...args),
}));

import { GET } from '@/app/pay/[orderId]/route';
import { buildOrderResultUrl } from '@/lib/order/status-access';

function createRequest(userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)') {
  return new NextRequest('https://pay.example.com/pay/order-001', {
    headers: { 'user-agent': userAgent },
  });
}

function createPendingOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'order-001',
    amount: 88,
    payAmount: 100.5,
    paymentType: 'alipay_direct',
    status: ORDER_STATUS.PENDING,
    expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    paidAt: null,
    completedAt: null,
    ...overrides,
  };
}

describe('GET /pay/[orderId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBuildAlipayPaymentUrl.mockReturnValue('https://openapi.alipay.com/gateway.do?mock=1');
  });

  it('returns 404 error page when order does not exist', async () => {
    mockFindUnique.mockResolvedValue(null);

    const response = await GET(createRequest(), {
      params: Promise.resolve({ orderId: 'missing-order' }),
    });

    const html = await response.text();

    expect(response.status).toBe(404);
    expect(html).toContain('订单不存在');
    expect(html).toContain('missing-order');
    expect(mockBuildAlipayPaymentUrl).not.toHaveBeenCalled();
  });

  it('rejects non-alipay orders', async () => {
    mockFindUnique.mockResolvedValue(
      createPendingOrder({
        paymentType: 'wxpay_direct',
      }),
    );

    const response = await GET(createRequest(), {
      params: Promise.resolve({ orderId: 'order-001' }),
    });

    const html = await response.text();

    expect(response.status).toBe(400);
    expect(html).toContain('支付方式不匹配');
    expect(mockBuildAlipayPaymentUrl).not.toHaveBeenCalled();
  });

  it('returns success status page for completed orders', async () => {
    mockFindUnique.mockResolvedValue(
      createPendingOrder({
        status: ORDER_STATUS.COMPLETED,
        paidAt: new Date('2026-03-09T10:00:00Z'),
        completedAt: new Date('2026-03-09T10:00:03Z'),
      }),
    );

    const response = await GET(createRequest(), {
      params: Promise.resolve({ orderId: 'order-001' }),
    });

    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('充值成功');
    expect(html).toContain('余额已到账');
    expect(html).toContain('order_id=order-001');
    expect(html).toContain('access_token=');
    expect(mockBuildAlipayPaymentUrl).not.toHaveBeenCalled();
  });

  it('returns paid-but-recharge-failed status page for failed paid orders', async () => {
    mockFindUnique.mockResolvedValue(
      createPendingOrder({
        status: ORDER_STATUS.FAILED,
        paidAt: new Date('2026-03-09T10:00:00Z'),
      }),
    );

    const response = await GET(createRequest(), {
      params: Promise.resolve({ orderId: 'order-001' }),
    });

    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('支付成功');
    expect(html).toContain('余额充值暂未完成');
    expect(mockBuildAlipayPaymentUrl).not.toHaveBeenCalled();
  });

  it('returns expired status page when order is timed out', async () => {
    mockFindUnique.mockResolvedValue(
      createPendingOrder({
        expiresAt: new Date(Date.now() - 1000),
      }),
    );

    const response = await GET(createRequest(), {
      params: Promise.resolve({ orderId: 'order-001' }),
    });

    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('订单超时');
    expect(html).toContain('订单已超时');
    expect(mockBuildAlipayPaymentUrl).not.toHaveBeenCalled();
  });

  it('builds desktop redirect page with service-generated alipay url and no manual pay button', async () => {
    mockBuildAlipayPaymentUrl.mockReturnValue('https://openapi.alipay.com/gateway.do?desktop=1');
    mockFindUnique.mockResolvedValue(createPendingOrder());

    const response = await GET(createRequest(), {
      params: Promise.resolve({ orderId: 'order-001' }),
    });

    const html = await response.text();
    const expectedReturnUrl = buildOrderResultUrl('https://pay.example.com', 'order-001');

    expect(response.status).toBe(200);
    expect(html).toContain('正在拉起支付宝');
    expect(html).toContain('https://openapi.alipay.com/gateway.do?desktop=1');
    expect(html).toContain('http-equiv="refresh"');
    expect(html).not.toContain('立即前往支付宝');
    expect(html).toContain('查看订单结果');
    expect(html).toContain('order_id=order-001');
    expect(html).toContain('access_token=');
    expect(mockBuildAlipayPaymentUrl).toHaveBeenCalledWith({
      orderId: 'order-001',
      amount: 100.5,
      subject: 'Sub2API Balance Recharge 100.50 CNY',
      notifyUrl: 'https://pay.example.com/api/alipay/notify',
      returnUrl: expectedReturnUrl,
      isMobile: false,
    });
  });

  it('builds mobile redirect page with wap alipay url', async () => {
    mockBuildAlipayPaymentUrl.mockReturnValue('https://openapi.alipay.com/gateway.do?mobile=1');
    mockFindUnique.mockResolvedValue(
      createPendingOrder({
        payAmount: null,
        amount: 88,
      }),
    );

    const response = await GET(
      createRequest(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
      ),
      {
        params: Promise.resolve({ orderId: 'order-001' }),
      },
    );

    const html = await response.text();
    const expectedReturnUrl = buildOrderResultUrl('https://pay.example.com', 'order-001');

    expect(response.status).toBe(200);
    expect(html).toContain('正在拉起支付宝');
    expect(html).toContain('https://openapi.alipay.com/gateway.do?mobile=1');
    expect(html).not.toContain('立即前往支付宝');
    expect(mockBuildAlipayPaymentUrl).toHaveBeenCalledWith({
      orderId: 'order-001',
      amount: 88,
      subject: 'Sub2API Balance Recharge 88.00 CNY',
      notifyUrl: 'https://pay.example.com/api/alipay/notify',
      returnUrl: expectedReturnUrl,
      isMobile: true,
    });
  });

  it('omits returnUrl for Alipay app requests to avoid extra close step', async () => {
    mockBuildAlipayPaymentUrl.mockReturnValue('https://openapi.alipay.com/gateway.do?alipayapp=1');
    mockFindUnique.mockResolvedValue(createPendingOrder({ payAmount: 66 }));

    const response = await GET(
      createRequest(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 AlipayClient/10.5.90',
      ),
      {
        params: Promise.resolve({ orderId: 'order-001' }),
      },
    );

    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('https://openapi.alipay.com/gateway.do?alipayapp=1');
    expect(html).toContain('window.location.replace(payUrl)');
    expect(html).toContain('<noscript><meta http-equiv="refresh"');
    expect(html).not.toContain('立即前往支付宝');
    expect(mockBuildAlipayPaymentUrl).toHaveBeenCalledWith({
      orderId: 'order-001',
      amount: 66,
      subject: 'Sub2API Balance Recharge 66.00 CNY',
      notifyUrl: 'https://pay.example.com/api/alipay/notify',
      returnUrl: null,
      isMobile: true,
    });
  });
});
