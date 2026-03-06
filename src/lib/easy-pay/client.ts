import { getEnv } from '@/lib/config';
import { generateSign } from './sign';
import type { EasyPayCreateResponse, EasyPayQueryResponse, EasyPayRefundResponse } from './types';

export interface CreatePaymentOptions {
  outTradeNo: string;
  amount: string;
  paymentType: string;
  clientIp: string;
  productName: string;
}

function normalizeCidList(cid?: string): string | undefined {
  if (!cid) return undefined;
  const normalized = cid
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .join(',');
  return normalized || undefined;
}

function resolveCid(paymentType: string): string | undefined {
  const env = getEnv();
  if (paymentType === 'alipay') {
    return normalizeCidList(env.EASY_PAY_CID_ALIPAY) || normalizeCidList(env.EASY_PAY_CID);
  }
  return normalizeCidList(env.EASY_PAY_CID_WXPAY) || normalizeCidList(env.EASY_PAY_CID);
}

function assertEasyPayEnv(env: ReturnType<typeof getEnv>) {
  if (
    !env.EASY_PAY_PID ||
    !env.EASY_PAY_PKEY ||
    !env.EASY_PAY_API_BASE ||
    !env.EASY_PAY_NOTIFY_URL ||
    !env.EASY_PAY_RETURN_URL
  ) {
    throw new Error(
      'EasyPay environment variables (EASY_PAY_PID, EASY_PAY_PKEY, EASY_PAY_API_BASE, EASY_PAY_NOTIFY_URL, EASY_PAY_RETURN_URL) are required',
    );
  }
  return env as typeof env & {
    EASY_PAY_PID: string;
    EASY_PAY_PKEY: string;
    EASY_PAY_API_BASE: string;
    EASY_PAY_NOTIFY_URL: string;
    EASY_PAY_RETURN_URL: string;
  };
}

export async function createPayment(opts: CreatePaymentOptions): Promise<EasyPayCreateResponse> {
  const env = assertEasyPayEnv(getEnv());
  const params: Record<string, string> = {
    pid: env.EASY_PAY_PID,
    type: opts.paymentType,
    out_trade_no: opts.outTradeNo,
    notify_url: env.EASY_PAY_NOTIFY_URL,
    return_url: env.EASY_PAY_RETURN_URL,
    name: opts.productName,
    money: opts.amount,
    clientip: opts.clientIp,
  };

  const cid = resolveCid(opts.paymentType);
  if (cid) {
    params.cid = cid;
  }

  const sign = generateSign(params, env.EASY_PAY_PKEY);
  params.sign = sign;
  params.sign_type = 'MD5';

  const formData = new URLSearchParams(params);
  const response = await fetch(`${env.EASY_PAY_API_BASE}/mapi.php`, {
    method: 'POST',
    body: formData,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  const data = (await response.json()) as EasyPayCreateResponse;
  if (data.code !== 1) {
    throw new Error(`EasyPay create payment failed: ${data.msg || 'unknown error'}`);
  }
  return data;
}

export async function queryOrder(outTradeNo: string): Promise<EasyPayQueryResponse> {
  const env = assertEasyPayEnv(getEnv());
  const url = `${env.EASY_PAY_API_BASE}/api.php?act=order&pid=${env.EASY_PAY_PID}&key=${env.EASY_PAY_PKEY}&out_trade_no=${outTradeNo}`;
  const response = await fetch(url);
  const data = (await response.json()) as EasyPayQueryResponse;
  if (data.code !== 1) {
    throw new Error(`EasyPay query order failed: ${data.msg || 'unknown error'}`);
  }
  return data;
}

export async function refund(tradeNo: string, outTradeNo: string, money: string): Promise<EasyPayRefundResponse> {
  const env = assertEasyPayEnv(getEnv());
  const params = new URLSearchParams({
    pid: env.EASY_PAY_PID,
    key: env.EASY_PAY_PKEY,
    trade_no: tradeNo,
    out_trade_no: outTradeNo,
    money,
  });
  const response = await fetch(`${env.EASY_PAY_API_BASE}/api.php?act=refund`, {
    method: 'POST',
    body: params,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  const data = (await response.json()) as EasyPayRefundResponse;
  if (data.code !== 1) {
    throw new Error(`EasyPay refund failed: ${data.msg || 'unknown error'}`);
  }
  return data;
}
