import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetSystemConfig = vi.fn();

vi.mock('@/lib/config', () => ({
  getEnv: () => ({
    SUB2API_BASE_URL: 'https://test.sub2api.com',
    SUB2API_ADMIN_API_KEY: 'admin-testkey123',
  }),
}));

vi.mock('@/lib/system-config', () => ({
  getSystemConfig: (...args: unknown[]) => mockGetSystemConfig(...args),
}));

import {
  getUser,
  createAndRedeem,
  subtractBalance,
  getCurrentUserByToken,
  addBalance,
  searchUsers,
  getAllGroups,
  getGroup,
  getUserSubscriptions,
  extendSubscription,
} from '@/lib/sub2api/client';

describe('Sub2API Client', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockGetSystemConfig.mockResolvedValue(undefined);
  });

  // ── getCurrentUserByToken ──

  it('getCurrentUserByToken sends Bearer token and returns user', async () => {
    const mockUser = { id: 1, email: 'test@example.com', status: 'active' };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: mockUser }),
    }) as typeof fetch;

    const user = await getCurrentUserByToken('my-user-token');
    expect(user.id).toBe(1);

    const fetchCall = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(fetchCall[0]).toContain('/api/v1/auth/me');
    const headers = fetchCall[1].headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer my-user-token');
    // Should NOT use admin API key header
    expect(headers['x-api-key']).toBeUndefined();
  });

  it('getCurrentUserByToken throws on non-ok response', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401 }) as typeof fetch;
    await expect(getCurrentUserByToken('bad-token')).rejects.toThrow('401');
  });

  // ── getHeaders DB precedence ──

  it('uses DB API key over env when available', async () => {
    mockGetSystemConfig.mockResolvedValue('db-api-key-value');
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { id: 1 } }),
    }) as typeof fetch;

    await getUser(1);

    const fetchCall = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const headers = fetchCall[1].headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('db-api-key-value');
  });

  it('falls back to env API key when DB returns empty', async () => {
    mockGetSystemConfig.mockResolvedValue('  ');
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { id: 1 } }),
    }) as typeof fetch;

    await getUser(1);

    const fetchCall = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const headers = fetchCall[1].headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('admin-testkey123');
  });

  // ── getUser ──

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

  it('getUser should throw generic error for other status codes', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    }) as typeof fetch;

    await expect(getUser(1)).rejects.toThrow('500');
  });

  // ── createAndRedeem ──

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

  it('createAndRedeem sends subscription fields when type is subscription', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          redeem_code: { id: 1, code: 's2p_sub', type: 'subscription' },
        }),
    }) as typeof fetch;

    await createAndRedeem('s2p_sub', 0, 1, 'sub notes', {
      type: 'subscription',
      groupId: 5,
      validityDays: 30,
    });

    const fetchCall = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(fetchCall[1].body as string);
    expect(body.type).toBe('subscription');
    expect(body.group_id).toBe(5);
    expect(body.validity_days).toBe(30);
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

  it('createAndRedeem does not retry on non-retryable errors', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: 'bad request' }),
    }) as typeof fetch;

    await expect(createAndRedeem('s2p_fail', 100, 1, 'notes')).rejects.toThrow('400');
    expect((fetch as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
  });

  it('createAndRedeem retries on AbortError', async () => {
    const abortError = Object.assign(new Error('aborted'), { name: 'AbortError' });
    global.fetch = vi
      .fn()
      .mockRejectedValueOnce(abortError)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ redeem_code: { id: 3, code: 's2p_abort' } }),
      }) as typeof fetch;

    const result = await createAndRedeem('s2p_abort', 50, 1, 'notes');
    expect(result.code).toBe('s2p_abort');
    expect((fetch as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(2);
  });

  // ── subtractBalance ──

  it('subtractBalance should send subtract request', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) }) as typeof fetch;

    await subtractBalance(1, 50, 'refund', 'idempotency-key-1');

    const fetchCall = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(fetchCall[1].body as string);
    expect(body.operation).toBe('subtract');
    expect(body.balance).toBe(50);
  });

  // ── addBalance ──

  it('addBalance should send add request with idempotency key', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) }) as typeof fetch;

    await addBalance(1, 100, 'bonus', 'idem-add-1');

    const fetchCall = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(fetchCall[0]).toContain('/users/1/balance');
    const body = JSON.parse(fetchCall[1].body as string);
    expect(body.operation).toBe('add');
    expect(body.balance).toBe(100);
    const headers = fetchCall[1].headers as Record<string, string>;
    expect(headers['Idempotency-Key']).toBe('idem-add-1');
  });

  it('addBalance throws on failure', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: 'internal' }),
    }) as typeof fetch;

    await expect(addBalance(1, 100, 'bonus', 'key')).rejects.toThrow('500');
  });

  // ── searchUsers ──

  it('searchUsers constructs correct URL with encoded keyword', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: {
            items: [{ id: 1, email: 'a@b.com', username: 'test' }],
          },
        }),
    }) as typeof fetch;

    const users = await searchUsers('test user');
    expect(users).toHaveLength(1);

    const fetchCall = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(fetchCall[0]).toContain('search=test%20user');
  });

  // ── getAllGroups ──

  it('getAllGroups returns groups array', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [{ id: 1, name: 'Group 1' }] }),
    }) as typeof fetch;

    const groups = await getAllGroups();
    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBe('Group 1');
  });

  // ── getGroup ──

  it('getGroup returns null on 404', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 }) as typeof fetch;
    const group = await getGroup(999);
    expect(group).toBeNull();
  });

  // ── getUserSubscriptions ──

  it('getUserSubscriptions returns empty array on 404', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 }) as typeof fetch;
    const subs = await getUserSubscriptions(999);
    expect(subs).toEqual([]);
  });

  // ── extendSubscription ──

  it('extendSubscription sends correct request', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) }) as typeof fetch;

    await extendSubscription(42, 30);

    const fetchCall = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(fetchCall[0]).toContain('/subscriptions/42/extend');
    expect(fetchCall[1].method).toBe('POST');
    const body = JSON.parse(fetchCall[1].body as string);
    expect(body.days).toBe(30);
  });

  it('extendSubscription throws on failure', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: 'invalid' }),
    }) as typeof fetch;

    await expect(extendSubscription(42, -1)).rejects.toThrow('400');
  });
});
