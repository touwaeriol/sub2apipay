import { getEnv } from '@/lib/config';
import type { Sub2ApiUser, Sub2ApiRedeemCode, Sub2ApiGroup, Sub2ApiSubscription } from './types';

const DEFAULT_TIMEOUT_MS = 10_000;
const RECHARGE_TIMEOUT_MS = 30_000;
const RECHARGE_MAX_ATTEMPTS = 2;

function getHeaders(idempotencyKey?: string): Record<string, string> {
  const env = getEnv();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-api-key': env.SUB2API_ADMIN_API_KEY,
  };
  if (idempotencyKey) {
    headers['Idempotency-Key'] = idempotencyKey;
  }
  return headers;
}

function isRetryableFetchError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.name === 'TimeoutError' || error.name === 'AbortError' || error.name === 'TypeError';
}

export async function getCurrentUserByToken(token: string): Promise<Sub2ApiUser> {
  const env = getEnv();
  const response = await fetch(`${env.SUB2API_BASE_URL}/api/v1/auth/me`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Failed to get current user: ${response.status}`);
  }

  const data = await response.json();
  return data.data as Sub2ApiUser;
}

export async function getUser(userId: number): Promise<Sub2ApiUser> {
  const env = getEnv();
  const response = await fetch(`${env.SUB2API_BASE_URL}/api/v1/admin/users/${userId}`, {
    headers: getHeaders(),
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
  });

  if (!response.ok) {
    if (response.status === 404) throw new Error('USER_NOT_FOUND');
    throw new Error(`Failed to get user: ${response.status}`);
  }

  const data = await response.json();
  return data.data as Sub2ApiUser;
}

export async function createAndRedeem(
  code: string,
  value: number,
  userId: number,
  notes: string,
  options?: { type?: 'balance' | 'subscription'; groupId?: number; validityDays?: number },
): Promise<Sub2ApiRedeemCode> {
  const env = getEnv();
  const url = `${env.SUB2API_BASE_URL}/api/v1/admin/redeem-codes/create-and-redeem`;
  const body = JSON.stringify({
    code,
    type: options?.type ?? 'balance',
    value,
    user_id: userId,
    notes,
    ...(options?.type === 'subscription' && {
      group_id: options.groupId,
      validity_days: options.validityDays,
    }),
  });

  let lastError: unknown;

  for (let attempt = 1; attempt <= RECHARGE_MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: getHeaders(`sub2apipay:recharge:${code}`),
        body,
        signal: AbortSignal.timeout(RECHARGE_TIMEOUT_MS),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Recharge failed (${response.status}): ${JSON.stringify(errorData)}`);
      }

      const data = await response.json();
      return data.redeem_code as Sub2ApiRedeemCode;
    } catch (error) {
      lastError = error;
      if (attempt >= RECHARGE_MAX_ATTEMPTS || !isRetryableFetchError(error)) {
        throw error;
      }
      console.warn(`Sub2API createAndRedeem attempt ${attempt} timed out, retrying...`);
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Recharge failed');
}

// ── 分组 API ──

export async function getAllGroups(): Promise<Sub2ApiGroup[]> {
  const env = getEnv();
  const response = await fetch(`${env.SUB2API_BASE_URL}/api/v1/admin/groups/all`, {
    headers: getHeaders(),
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Failed to get groups: ${response.status}`);
  }

  const data = await response.json();
  return (data.data ?? []) as Sub2ApiGroup[];
}

export async function getGroup(groupId: number): Promise<Sub2ApiGroup | null> {
  const env = getEnv();
  const response = await fetch(`${env.SUB2API_BASE_URL}/api/v1/admin/groups/${groupId}`, {
    headers: getHeaders(),
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
  });

  if (!response.ok) {
    if (response.status === 404) return null;
    throw new Error(`Failed to get group ${groupId}: ${response.status}`);
  }

  const data = await response.json();
  return data.data as Sub2ApiGroup;
}

// ── 订阅 API ──

export async function assignSubscription(
  userId: number,
  groupId: number,
  validityDays: number,
  notes?: string,
  idempotencyKey?: string,
): Promise<Sub2ApiSubscription> {
  const env = getEnv();
  const response = await fetch(`${env.SUB2API_BASE_URL}/api/v1/admin/subscriptions/assign`, {
    method: 'POST',
    headers: getHeaders(idempotencyKey),
    body: JSON.stringify({
      user_id: userId,
      group_id: groupId,
      validity_days: validityDays,
      notes: notes || `Sub2ApiPay subscription order`,
    }),
    signal: AbortSignal.timeout(RECHARGE_TIMEOUT_MS),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`Assign subscription failed (${response.status}): ${JSON.stringify(errorData)}`);
  }

  const data = await response.json();
  return data.data as Sub2ApiSubscription;
}

export async function getUserSubscriptions(userId: number): Promise<Sub2ApiSubscription[]> {
  const env = getEnv();
  const response = await fetch(`${env.SUB2API_BASE_URL}/api/v1/admin/users/${userId}/subscriptions`, {
    headers: getHeaders(),
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
  });

  if (!response.ok) {
    if (response.status === 404) return [];
    throw new Error(`Failed to get user subscriptions: ${response.status}`);
  }

  const data = await response.json();
  return (data.data ?? []) as Sub2ApiSubscription[];
}

export async function extendSubscription(subscriptionId: number, days: number): Promise<void> {
  const env = getEnv();
  const response = await fetch(`${env.SUB2API_BASE_URL}/api/v1/admin/subscriptions/${subscriptionId}/extend`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ days }),
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`Extend subscription failed (${response.status}): ${JSON.stringify(errorData)}`);
  }
}

// ── 余额 API ──

export async function subtractBalance(
  userId: number,
  amount: number,
  notes: string,
  idempotencyKey: string,
): Promise<void> {
  const env = getEnv();
  const response = await fetch(`${env.SUB2API_BASE_URL}/api/v1/admin/users/${userId}/balance`, {
    method: 'POST',
    headers: getHeaders(idempotencyKey),
    body: JSON.stringify({
      operation: 'subtract',
      amount,
      notes,
    }),
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`Subtract balance failed (${response.status}): ${JSON.stringify(errorData)}`);
  }
}

export async function addBalance(userId: number, amount: number, notes: string, idempotencyKey: string): Promise<void> {
  const env = getEnv();
  const response = await fetch(`${env.SUB2API_BASE_URL}/api/v1/admin/users/${userId}/balance`, {
    method: 'POST',
    headers: getHeaders(idempotencyKey),
    body: JSON.stringify({
      operation: 'add',
      amount,
      notes,
    }),
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`Add balance failed (${response.status}): ${JSON.stringify(errorData)}`);
  }
}
