import { describe, expect, it } from 'vitest';
import { decodeAlipayPayload, parseAlipayNotificationParams } from '@/lib/alipay/codec';

describe('Alipay codec', () => {
  it('should normalize plus signs in notify sign parameter', () => {
    const params = parseAlipayNotificationParams(Buffer.from('sign=abc+def&trade_no=1'), {
      'content-type': 'application/x-www-form-urlencoded; charset=utf-8',
    });

    expect(params.sign).toBe('abc+def');
    expect(params.trade_no).toBe('1');
  });

  it('should decode payload charset from content-type header', () => {
    const body = Buffer.from('charset=utf-8&trade_status=TRADE_SUCCESS', 'utf-8');

    const decoded = decodeAlipayPayload(body, {
      'content-type': 'application/x-www-form-urlencoded; charset=utf-8',
    });

    expect(decoded).toContain('trade_status=TRADE_SUCCESS');
  });

  it('should fallback to body charset hint when header is missing', () => {
    const body = Buffer.from('charset=gbk&trade_no=202603090001', 'utf-8');

    const decoded = decodeAlipayPayload(body);

    expect(decoded).toContain('trade_no=202603090001');
  });
});
