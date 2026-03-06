import WxPay from 'wechatpay-node-v3';
import crypto from 'crypto';
import { getEnv } from '@/lib/config';
import type { WxpayPcOrderParams, WxpayH5OrderParams, WxpayRefundParams } from './types';

const BASE_URL = 'https://api.mch.weixin.qq.com';

function assertWxpayEnv(env: ReturnType<typeof getEnv>) {
  if (!env.WXPAY_APP_ID || !env.WXPAY_MCH_ID || !env.WXPAY_PRIVATE_KEY || !env.WXPAY_API_V3_KEY) {
    throw new Error(
      'Wxpay environment variables (WXPAY_APP_ID, WXPAY_MCH_ID, WXPAY_PRIVATE_KEY, WXPAY_API_V3_KEY) are required',
    );
  }
  return env as typeof env & {
    WXPAY_APP_ID: string;
    WXPAY_MCH_ID: string;
    WXPAY_PRIVATE_KEY: string;
    WXPAY_API_V3_KEY: string;
  };
}

let payInstance: WxPay | null = null;

function getPayInstance(): WxPay {
  if (payInstance) return payInstance;
  const env = assertWxpayEnv(getEnv());

  const privateKey = Buffer.from(env.WXPAY_PRIVATE_KEY);
  if (!env.WXPAY_PUBLIC_KEY) {
    throw new Error('WXPAY_PUBLIC_KEY is required');
  }
  const publicKey = Buffer.from(env.WXPAY_PUBLIC_KEY);

  payInstance = new WxPay({
    appid: env.WXPAY_APP_ID,
    mchid: env.WXPAY_MCH_ID,
    publicKey,
    privateKey,
    key: env.WXPAY_API_V3_KEY,
    serial_no: env.WXPAY_CERT_SERIAL,
  });
  return payInstance;
}

function yuanToFen(yuan: number): number {
  return Math.round(yuan * 100);
}

async function request<T>(method: string, url: string, body?: Record<string, unknown>): Promise<T> {
  const pay = getPayInstance();
  const nonce_str = crypto.randomBytes(16).toString('hex');
  const timestamp = Math.floor(Date.now() / 1000).toString();

  const signature = pay.getSignature(method, nonce_str, timestamp, url, body ? JSON.stringify(body) : '');
  const authorization = pay.getAuthorization(nonce_str, timestamp, signature);

  const headers: Record<string, string> = {
    Authorization: authorization,
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'User-Agent': 'Sub2ApiPay/1.0',
  };

  const res = await fetch(`${BASE_URL}${url}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10_000),
  });

  if (res.status === 204) return {} as T;

  const data = await res.json();
  if (!res.ok) {
    const code = (data as Record<string, string>).code || res.status;
    const message = (data as Record<string, string>).message || res.statusText;
    throw new Error(`Wxpay API error: [${code}] ${message}`);
  }

  return data as T;
}

/** PC 扫码支付（微信官方 API: /v3/pay/transactions/native） */
export async function createPcOrder(params: WxpayPcOrderParams): Promise<string> {
  const env = assertWxpayEnv(getEnv());
  const result = await request<{ code_url: string }>('POST', '/v3/pay/transactions/native', {
    appid: env.WXPAY_APP_ID,
    mchid: env.WXPAY_MCH_ID,
    description: params.description,
    out_trade_no: params.out_trade_no,
    notify_url: params.notify_url,
    amount: { total: yuanToFen(params.amount), currency: 'CNY' },
  });
  return result.code_url;
}

export async function createH5Order(params: WxpayH5OrderParams): Promise<string> {
  const env = assertWxpayEnv(getEnv());
  const result = await request<{ h5_url: string }>('POST', '/v3/pay/transactions/h5', {
    appid: env.WXPAY_APP_ID,
    mchid: env.WXPAY_MCH_ID,
    description: params.description,
    out_trade_no: params.out_trade_no,
    notify_url: params.notify_url,
    amount: { total: yuanToFen(params.amount), currency: 'CNY' },
    scene_info: {
      payer_client_ip: params.payer_client_ip,
      h5_info: { type: 'Wap' },
    },
  });
  return result.h5_url;
}

export async function queryOrder(outTradeNo: string): Promise<Record<string, unknown>> {
  const env = assertWxpayEnv(getEnv());
  const url = `/v3/pay/transactions/out-trade-no/${outTradeNo}?mchid=${env.WXPAY_MCH_ID}`;
  return request<Record<string, unknown>>('GET', url);
}

export async function closeOrder(outTradeNo: string): Promise<void> {
  const env = assertWxpayEnv(getEnv());
  const url = `/v3/pay/transactions/out-trade-no/${outTradeNo}/close`;
  await request('POST', url, { mchid: env.WXPAY_MCH_ID });
}

export async function createRefund(params: WxpayRefundParams): Promise<Record<string, unknown>> {
  return request<Record<string, unknown>>('POST', '/v3/refund/domestic/refunds', {
    out_trade_no: params.out_trade_no,
    out_refund_no: params.out_refund_no,
    reason: params.reason,
    amount: {
      refund: yuanToFen(params.amount),
      total: yuanToFen(params.total),
      currency: 'CNY',
    },
  });
}

export function decipherNotify<T>(ciphertext: string, associatedData: string, nonce: string): T {
  const env = assertWxpayEnv(getEnv());
  const key = env.WXPAY_API_V3_KEY;
  const ciphertextBuf = Buffer.from(ciphertext, 'base64');
  // AES-GCM 最后 16 字节是 AuthTag
  const authTag = ciphertextBuf.subarray(ciphertextBuf.length - 16);
  const data = ciphertextBuf.subarray(0, ciphertextBuf.length - 16);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce);
  decipher.setAuthTag(authTag);
  decipher.setAAD(Buffer.from(associatedData));
  const decoded = Buffer.concat([decipher.update(data), decipher.final()]);
  return JSON.parse(decoded.toString('utf-8')) as T;
}

export async function verifyNotifySign(params: {
  timestamp: string;
  nonce: string;
  body: string;
  serial: string;
  signature: string;
}): Promise<boolean> {
  const env = getEnv();
  if (!env.WXPAY_PUBLIC_KEY) {
    throw new Error('WXPAY_PUBLIC_KEY is required for signature verification');
  }

  // 微信支付公钥模式：直接用公钥验签，不拉取平台证书
  const message = `${params.timestamp}\n${params.nonce}\n${params.body}\n`;
  const verify = crypto.createVerify('RSA-SHA256');
  verify.update(message);
  return verify.verify(env.WXPAY_PUBLIC_KEY, params.signature, 'base64');
}
