import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/config', () => ({
  getEnv: () => ({
    SUB2API_BASE_URL: 'https://test.sub2api.com',
    SUB2API_ADMIN_API_KEY: 'admin-testkey123',
  }),
}));

import { getUser, createAndRedeem, subtractBalance } from '@/lib/sub2api/client';

describe('Sub2API Client', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('getUser should return user data', async () => {
    const mockUser = {
      id: 1,
      username: 'testuser',
      email: 'test@example.com',
      status: 'active',
      balance: 100,
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: mockUser }),
    }) as typeof fetch;

    const user = await getUser(1);
    expect(user.username).toBe('testuser');
    expect(user.status).toBe('active');
  });

  it('getUser should throw USER_NOT_FOUND for 404', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    }) as typeof fetch;

    await expect(getUser(999)).rejects.toThrow('USER_NOT_FOUND');
  });

  it('createAndRedeem should send correct request', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          code: 1,
          redeem_code: {
            id: 1,
            code: 's2p_test123',
            type: 'balance',
            value: 100,
            status: 'used',
            used_by: 1,
          },
        }),
    }) as typeof fetch;

    const result = await createAndRedeem('s2p_test123', 100, 1, 'test notes');
    expect(result.code).toBe('s2p_test123');

    const fetchCall = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(fetchCall[0]).toContain('/redeem-codes/create-and-redeem');
    const headers = fetchCall[1].headers as Record<string, string>;
    expect(headers['Idempotency-Key']).toBe('sub2apipay:recharge:s2p_test123');
  });

  it('createAndRedeem should retry once on timeout', async () => {
    const timeoutError = Object.assign(new Error('timed out'), { name: 'TimeoutError' });
    global.fetch = vi
      .fn()
      .mockRejectedValueOnce(timeoutError)
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            redeem_code: {
              id: 2,
              code: 's2p_retry',
              type: 'balance',
              value: 88,
              status: 'used',
              used_by: 1,
            },
          }),
      }) as typeof fetch;

    const result = await createAndRedeem('s2p_retry', 88, 1, 'retry notes');

    expect(result.code).toBe('s2p_retry');
    expect((fetch as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(2);
  });

  it('subtractBalance should send subtract request', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) }) as typeof fetch;

    await subtractBalance(1, 50, 'refund', 'idempotency-key-1');

    const fetchCall = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(fetchCall[1].body as string);
    expect(body.operation).toBe('subtract');
    expect(body.amount).toBe(50);
  });
});
