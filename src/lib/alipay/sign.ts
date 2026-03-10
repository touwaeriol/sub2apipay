import crypto from 'crypto';

/** 将裸 base64 按 64 字符/行折行，符合 PEM 标准（OpenSSL 3.x 严格模式要求） */
function wrapBase64(b64: string): string {
  return b64.replace(/(.{64})/g, '$1\n').trim();
}

function normalizePemLikeValue(key: string): string {
  return key.trim().replace(/\r\n/g, '\n').replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n');
}

function shouldLogVerifyDebug(): boolean {
  return process.env.NODE_ENV !== 'production' || process.env.DEBUG_ALIPAY_SIGN === '1';
}

/** 自动补全 PEM 格式（PKCS8） */
function formatPrivateKey(key: string): string {
  const normalized = normalizePemLikeValue(key);
  if (normalized.includes('-----BEGIN')) return normalized;
  return `-----BEGIN PRIVATE KEY-----\n${wrapBase64(normalized)}\n-----END PRIVATE KEY-----`;
}

function formatPublicKey(key: string): string {
  const normalized = normalizePemLikeValue(key);
  if (normalized.includes('-----BEGIN')) return normalized;
  return `-----BEGIN PUBLIC KEY-----\n${wrapBase64(normalized)}\n-----END PUBLIC KEY-----`;
}

/** 生成 RSA2 签名（请求签名：仅排除 sign） */
export function generateSign(params: Record<string, string>, privateKey: string): string {
  const filtered = Object.entries(params)
    .filter(([key, value]) => key !== 'sign' && value !== '' && value !== undefined && value !== null)
    .sort(([a], [b]) => a.localeCompare(b));

  const signStr = filtered.map(([key, value]) => `${key}=${value}`).join('&');

  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signStr);
  return signer.sign(formatPrivateKey(privateKey), 'base64');
}

/** 用支付宝公钥验证签名（回调验签：排除 sign 和 sign_type） */
export function verifySign(params: Record<string, string>, alipayPublicKey: string, sign: string): boolean {
  const filtered = Object.entries(params)
    .filter(([key, value]) => key !== 'sign' && key !== 'sign_type' && value !== '' && value !== undefined && value !== null)
    .sort(([a], [b]) => a.localeCompare(b));

  const signStr = filtered.map(([key, value]) => `${key}=${value}`).join('&');

  const pem = formatPublicKey(alipayPublicKey);
  try {
    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(signStr);
    const result = verifier.verify(pem, sign, 'base64');
    if (!result) {
      if (shouldLogVerifyDebug()) {
        console.error('[Alipay verifySign] FAILED. signStr:', signStr.substring(0, 200) + '...');
        console.error('[Alipay verifySign] sign(first 40):', sign.substring(0, 40));
        console.error('[Alipay verifySign] pubKey(first 80):', pem.substring(0, 80));
      } else {
        console.error('[Alipay verifySign] verification failed');
      }
    }
    return result;
  } catch (err) {
    if (shouldLogVerifyDebug()) {
      console.error('[Alipay verifySign] crypto error:', err);
    } else {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[Alipay verifySign] crypto error:', message);
    }
    return false;
  }
}
