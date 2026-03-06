import { getEnv } from '@/lib/config';
import { generateSign } from './sign';
import type { AlipayResponse } from './types';

const GATEWAY = 'https://openapi.alipay.com/gateway.do';

function getCommonParams(appId: string): Record<string, string> {
  return {
    app_id: appId,
    format: 'JSON',
    charset: 'utf-8',
    sign_type: 'RSA2',
    timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
    version: '1.0',
  };
}

function assertAlipayEnv(env: ReturnType<typeof getEnv>) {
  if (!env.ALIPAY_APP_ID || !env.ALIPAY_PRIVATE_KEY || !env.ALIPAY_PUBLIC_KEY) {
    throw new Error('Alipay environment variables (ALIPAY_APP_ID, ALIPAY_PRIVATE_KEY, ALIPAY_PUBLIC_KEY) are required');
  }
  return env as typeof env & {
    ALIPAY_APP_ID: string;
    ALIPAY_PRIVATE_KEY: string;
    ALIPAY_PUBLIC_KEY: string;
  };
}

/**
 * 生成电脑网站支付的跳转 URL（GET 方式）
 * 用于 alipay.trade.page.pay
 */
export function pageExecute(
  bizContent: Record<string, unknown>,
  options?: { notifyUrl?: string; returnUrl?: string },
): string {
  const env = assertAlipayEnv(getEnv());

  const params: Record<string, string> = {
    ...getCommonParams(env.ALIPAY_APP_ID),
    method: 'alipay.trade.page.pay',
    biz_content: JSON.stringify(bizContent),
  };

  if (options?.notifyUrl || env.ALIPAY_NOTIFY_URL) {
    params.notify_url = (options?.notifyUrl || env.ALIPAY_NOTIFY_URL)!;
  }
  if (options?.returnUrl || env.ALIPAY_RETURN_URL) {
    params.return_url = (options?.returnUrl || env.ALIPAY_RETURN_URL)!;
  }

  params.sign = generateSign(params, env.ALIPAY_PRIVATE_KEY);

  const query = new URLSearchParams(params).toString();
  return `${GATEWAY}?${query}`;
}

/**
 * 调用支付宝服务端 API（POST 方式）
 * 用于 alipay.trade.query、alipay.trade.refund、alipay.trade.close
 */
export async function execute<T extends AlipayResponse>(
  method: string,
  bizContent: Record<string, unknown>,
): Promise<T> {
  const env = assertAlipayEnv(getEnv());

  const params: Record<string, string> = {
    ...getCommonParams(env.ALIPAY_APP_ID),
    method,
    biz_content: JSON.stringify(bizContent),
  };

  params.sign = generateSign(params, env.ALIPAY_PRIVATE_KEY);

  const response = await fetch(GATEWAY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });

  const data = await response.json();

  // 支付宝响应格式：{ "alipay_trade_query_response": { ... }, "sign": "..." }
  const responseKey = method.replace(/\./g, '_') + '_response';
  const result = data[responseKey] as T;

  if (!result) {
    throw new Error(`Alipay API error: unexpected response format for ${method}`);
  }

  if (result.code !== '10000') {
    throw new Error(`Alipay API error: [${result.sub_code || result.code}] ${result.sub_msg || result.msg}`);
  }

  return result;
}
