import crypto from 'crypto';

/** 自动补全 PEM 格式（PKCS8） */
function formatPrivateKey(key: string): string {
  if (key.includes('-----BEGIN')) return key;
  return `-----BEGIN PRIVATE KEY-----\n${key}\n-----END PRIVATE KEY-----`;
}

function formatPublicKey(key: string): string {
  if (key.includes('-----BEGIN')) return key;
  return `-----BEGIN PUBLIC KEY-----\n${key}\n-----END PUBLIC KEY-----`;
}

/** 生成 RSA2 签名 */
export function generateSign(params: Record<string, string>, privateKey: string): string {
  const filtered = Object.entries(params)
    .filter(([key, value]) => key !== 'sign' && value !== '' && value !== undefined && value !== null)
    .sort(([a], [b]) => a.localeCompare(b));

  const signStr = filtered.map(([key, value]) => `${key}=${value}`).join('&');

  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signStr);
  return signer.sign(formatPrivateKey(privateKey), 'base64');
}

/** 用支付宝公钥验证签名 */
export function verifySign(params: Record<string, string>, alipayPublicKey: string, sign: string): boolean {
  const filtered = Object.entries(params)
    .filter(([key, value]) => key !== 'sign' && value !== '' && value !== undefined && value !== null)
    .sort(([a], [b]) => a.localeCompare(b));

  const signStr = filtered.map(([key, value]) => `${key}=${value}`).join('&');

  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(signStr);
  return verifier.verify(formatPublicKey(alipayPublicKey), sign, 'base64');
}
