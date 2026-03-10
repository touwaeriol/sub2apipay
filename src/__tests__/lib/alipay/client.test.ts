
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/config', () => ({
  getEnv: () => ({
    ALIPAY_APP_ID: '2021000000000000',
    ALIPAY_PRIVATE_KEY: 'test-private-key',
    ALIPAY_PUBLIC_KEY: 'test-public-key',
    ALIPAY_NOTIFY_URL: 'https://pay.example.com/api/alipay/notify',
    ALIPAY_RETURN_URL: 'https://pay.example.com/pay/result',
  }),
}));

const { mockGenerateSign } = vi.hoisted(() => ({
  mockGenerateSign: vi.fn(() => 'signed-value'),
}));
vi.mock('@/lib/alipay/sign', () => ({
  generateSign: mockGenerateSign,
}));

import { execute, pageExecute } from '@/lib/alipay/client';

describe('alipay client helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('pageExecute includes notify_url and return_url by default', () => {
    const url = new URL(
      pageExecute({ out_trade_no: 'order-001', product_code: 'FAST_INSTANT_TRADE_PAY', total_amount: '10.00' }),
    );

    expect(url.origin + url.pathname).toBe('https://openapi.alipay.com/gateway.do');
    expect(url.searchParams.get('notify_url')).toBe('https://pay.example.com/api/alipay/notify');
    expect(url.searchParams.get('return_url')).toBe('https://pay.example.com/pay/result');
    expect(url.searchParams.get('method')).toBe('alipay.trade.page.pay');
    expect(url.searchParams.get('sign')).toBe('signed-value');
  });

  it('pageExecute omits return_url when explicitly disabled', () => {
    const url = new URL(
      pageExecute(
        { out_trade_no: 'order-002', product_code: 'QUICK_WAP_WAY', total_amount: '20.00' },
        { returnUrl: null, method: 'alipay.trade.wap.pay' },
      ),
    );

    expect(url.searchParams.get('method')).toBe('alipay.trade.wap.pay');
    expect(url.searchParams.get('return_url')).toBeNull();
    expect(url.searchParams.get('notify_url')).toBe('https://pay.example.com/api/alipay/notify');
  });

  it('execute posts form data and returns the named response payload', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          alipay_trade_query_response: {
            code: '10000',
            msg: 'Success',
            trade_status: 'TRADE_SUCCESS',
          },
          sign: 'server-sign',
        }),
        { headers: { 'content-type': 'application/json; charset=utf-8' } },
      ),
    ) as typeof fetch;

    const result = await execute('alipay.trade.query', { out_trade_no: 'order-003' });

    expect(result).toEqual({ code: '10000', msg: 'Success', trade_status: 'TRADE_SUCCESS' });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('https://openapi.alipay.com/gateway.do');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'Content-Type': 'application/x-www-form-urlencoded' });
    expect(String(init.body)).toContain('method=alipay.trade.query');
  });

  it('execute throws when alipay response code is not successful', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          alipay_trade_query_response: {
            code: '40004',
            msg: 'Business Failed',
            sub_code: 'ACQ.TRADE_NOT_EXIST',
            sub_msg: 'trade not exist',
          },
        }),
        { headers: { 'content-type': 'application/json; charset=utf-8' } },
      ),
    ) as typeof fetch;

    await expect(execute('alipay.trade.query', { out_trade_no: 'order-004' })).rejects.toThrow(
      '[ACQ.TRADE_NOT_EXIST] trade not exist',
    );
  });
});
