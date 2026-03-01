import { getEnv } from '@/lib/config';
import type { Sub2ApiUser, Sub2ApiRedeemCode } from './types';

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

export async function getCurrentUserByToken(token: string): Promise<Sub2ApiUser> {
  const env = getEnv();
  const response = await fetch(`${env.SUB2API_BASE_URL}/api/v1/auth/me`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
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
): Promise<Sub2ApiRedeemCode> {
  const env = getEnv();
  const response = await fetch(`${env.SUB2API_BASE_URL}/api/v1/admin/redeem-codes/create-and-redeem`, {
    method: 'POST',
    headers: getHeaders(`sub2apipay:recharge:${code}`),
    body: JSON.stringify({
      code,
      type: 'balance',
      value,
      user_id: userId,
      notes,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`Recharge failed (${response.status}): ${JSON.stringify(errorData)}`);
  }

  const data = await response.json();
  return data.redeem_code as Sub2ApiRedeemCode;
}

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
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`Subtract balance failed (${response.status}): ${JSON.stringify(errorData)}`);
  }
}
