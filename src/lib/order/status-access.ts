import crypto from 'crypto';
import { getEnv } from '@/lib/config';

export const ORDER_STATUS_ACCESS_QUERY_KEY = 'access_token';
const ORDER_STATUS_ACCESS_PURPOSE = 'order-status-access:v1';

function buildSignature(orderId: string): string {
  return crypto
    .createHmac('sha256', getEnv().ADMIN_TOKEN)
    .update(`${ORDER_STATUS_ACCESS_PURPOSE}:${orderId}`)
    .digest('base64url');
}

export function createOrderStatusAccessToken(orderId: string): string {
  return buildSignature(orderId);
}

export function verifyOrderStatusAccessToken(orderId: string, token: string | null | undefined): boolean {
  if (!token) return false;

  const expected = buildSignature(orderId);
  const expectedBuffer = Buffer.from(expected, 'utf8');
  const receivedBuffer = Buffer.from(token, 'utf8');

  if (expectedBuffer.length !== receivedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

export function buildOrderResultUrl(appUrl: string, orderId: string): string {
  const url = new URL('/pay/result', appUrl);
  url.searchParams.set('order_id', orderId);
  url.searchParams.set(ORDER_STATUS_ACCESS_QUERY_KEY, createOrderStatusAccessToken(orderId));
  return url.toString();
}
