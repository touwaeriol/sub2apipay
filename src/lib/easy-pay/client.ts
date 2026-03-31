import { getEnv } from '@/lib/config';
import { generateSign } from './sign';
import type { EasyPayCreateResponse, EasyPayQueryResponse, EasyPayRefundResponse } from './types';

export interface CreatePaymentOptions {
  outTradeNo: string;
  amount: string;
  paymentType: string;
  clientIp: string;
  productName: string;
  returnUrl?: string;
  isMobile?: boolean;
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

function resolveCid(paymentType: string, instanceConfig?: Record<string, string>): string | undefined {
  if (instanceConfig) {
    if (paymentType === 'alipay') {
      return normalizeCidList(instanceConfig.cidAlipay) || normalizeCidList(instanceConfig.cid);
    }
    return normalizeCidList(instanceConfig.cidWxpay) || normalizeCidList(instanceConfig.cid);
  }
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

export async function createPayment(
  opts: CreatePaymentOptions,
  instanceConfig?: Record<string, string>,
): Promise<EasyPayCreateResponse> {
  let pid: string, pkey: string, apiBase: string, notifyUrl: string, returnUrl: string;

  if (instanceConfig) {
    pid = instanceConfig.pid;
    pkey = instanceConfig.pkey;
    apiBase = instanceConfig.apiBase;
    notifyUrl = instanceConfig.notifyUrl;
    returnUrl = instanceConfig.returnUrl;
  } else {
    const env = assertEasyPayEnv(getEnv());
    pid = env.EASY_PAY_PID;
    pkey = env.EASY_PAY_PKEY;
    apiBase = env.EASY_PAY_API_BASE;
    notifyUrl = env.EASY_PAY_NOTIFY_URL;
    returnUrl = env.EASY_PAY_RETURN_URL;
  }

  const params: Record<string, string> = {
    pid,
    type: opts.paymentType,
    out_trade_no: opts.outTradeNo,
    notify_url: notifyUrl,
    return_url: opts.returnUrl || returnUrl,
    name: opts.productName,
    money: opts.amount,
    clientip: opts.clientIp,
  };

  const cid = resolveCid(opts.paymentType, instanceConfig);
  if (cid) {
    params.cid = cid;
  }

  if (opts.isMobile) {
    params.device = 'mobile';
  }

  const sign = generateSign(params, pkey);
  params.sign = sign;
  params.sign_type = 'MD5';

  const formData = new URLSearchParams(params);
  const response = await fetch(`${apiBase}/mapi.php`, {
    method: 'POST',
    body: formData,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    signal: AbortSignal.timeout(10_000),
  });

  const data = (await response.json()) as EasyPayCreateResponse;
  if (data.code !== 1) {
    throw new Error(`EasyPay create payment failed: ${data.msg || 'unknown error'}`);
  }
  return data;
}

export async function queryOrder(
  outTradeNo: string,
  instanceConfig?: Record<string, string>,
): Promise<EasyPayQueryResponse> {
  let pid: string, pkey: string, apiBase: string;

  if (instanceConfig) {
    pid = instanceConfig.pid;
    pkey = instanceConfig.pkey;
    apiBase = instanceConfig.apiBase;
  } else {
    const env = assertEasyPayEnv(getEnv());
    pid = env.EASY_PAY_PID;
    pkey = env.EASY_PAY_PKEY;
    apiBase = env.EASY_PAY_API_BASE;
  }

  // 使用 POST 避免密钥暴露在 URL 中（URL 会被记录到服务器/CDN 日志）
  const params = new URLSearchParams({
    act: 'order',
    pid,
    key: pkey,
    out_trade_no: outTradeNo,
  });
  const response = await fetch(`${apiBase}/api.php`, {
    method: 'POST',
    body: params,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    signal: AbortSignal.timeout(10_000),
  });
  const data = (await response.json()) as EasyPayQueryResponse;
  if (data.code !== 1) {
    throw new Error(`EasyPay query order failed: ${data.msg || 'unknown error'}`);
  }
  return data;
}

export async function refund(
  tradeNo: string,
  outTradeNo: string,
  money: string,
  instanceConfig?: Record<string, string>,
): Promise<EasyPayRefundResponse> {
  let pid: string, pkey: string, apiBase: string;

  if (instanceConfig) {
    pid = instanceConfig.pid;
    pkey = instanceConfig.pkey;
    apiBase = instanceConfig.apiBase;
  } else {
    const env = assertEasyPayEnv(getEnv());
    pid = env.EASY_PAY_PID;
    pkey = env.EASY_PAY_PKEY;
    apiBase = env.EASY_PAY_API_BASE;
  }

  const params = new URLSearchParams({
    pid,
    key: pkey,
    trade_no: tradeNo,
    out_trade_no: outTradeNo,
    money,
  });
  const response = await fetch(`${apiBase}/api.php?act=refund`, {
    method: 'POST',
    body: params,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    signal: AbortSignal.timeout(10_000),
  });
  const data = (await response.json()) as EasyPayRefundResponse;
  if (data.code !== 1) {
    throw new Error(`EasyPay refund failed: ${data.msg || 'unknown error'}`);
  }
  return data;
}
