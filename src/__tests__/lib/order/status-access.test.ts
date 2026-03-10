
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/config', () => ({
  getEnv: () => ({
    ADMIN_TOKEN: 'test-admin-token',
  }),
}));

import {
  ORDER_STATUS_ACCESS_QUERY_KEY,
  buildOrderResultUrl,
  createOrderStatusAccessToken,
  verifyOrderStatusAccessToken,
} from '@/lib/order/status-access';

describe('order status access token helpers', () => {
  it('creates and verifies a token bound to the order id', () => {
    const token = createOrderStatusAccessToken('order-001');
    expect(token).toBeTruthy();
    expect(verifyOrderStatusAccessToken('order-001', token)).toBe(true);
    expect(verifyOrderStatusAccessToken('order-002', token)).toBe(false);
  });

  it('rejects missing or malformed tokens', () => {
    expect(verifyOrderStatusAccessToken('order-001', null)).toBe(false);
    expect(verifyOrderStatusAccessToken('order-001', undefined)).toBe(false);
    expect(verifyOrderStatusAccessToken('order-001', 'short')).toBe(false);
  });

  it('builds a result url with order id and access token', () => {
    const url = new URL(buildOrderResultUrl('https://pay.example.com', 'order-009'));
    expect(url.origin + url.pathname).toBe('https://pay.example.com/pay/result');
    expect(url.searchParams.get('order_id')).toBe('order-009');
    const token = url.searchParams.get(ORDER_STATUS_ACCESS_QUERY_KEY);
    expect(token).toBeTruthy();
    expect(verifyOrderStatusAccessToken('order-009', token)).toBe(true);
  });
});
