import crypto from 'crypto';

export function generateSign(params: Record<string, string>, pkey: string): string {
  const filtered = Object.entries(params)
    .filter(
      ([key, value]) => key !== 'sign' && key !== 'sign_type' && value !== '' && value !== undefined && value !== null,
    )
    .sort(([a], [b]) => a.localeCompare(b));

  const queryString = filtered.map(([key, value]) => `${key}=${value}`).join('&');
  const signStr = queryString + pkey;
  return crypto.createHash('md5').update(signStr).digest('hex');
}

export function verifySign(params: Record<string, string>, pkey: string, sign: string): boolean {
  const expected = generateSign(params, pkey);
  if (expected.length !== sign.length) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(sign);
  return crypto.timingSafeEqual(a, b);
}
