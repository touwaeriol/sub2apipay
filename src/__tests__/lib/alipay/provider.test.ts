import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/config', () => ({
  getEnv: () => ({
    ALIPAY_APP_ID: '2021000000000000',
    ALIPAY_PRIVATE_KEY: 'test-private-key',
    ALIPAY_PUBLIC_KEY: 'test-public-key',
    ALIPAY_NOTIFY_URL: 'https://pay.example.com/api/alipay/notify',
    ALIPAY_RETURN_URL: 'https://pay.example.com/pay/result',
    NEXT_PUBLIC_APP_URL: 'https://pay.example.com',
    PRODUCT_NAME: 'Sub2API Balance Recharge',
  }),
}));

const mockPageExecute = vi.fn();
const mockExecute = vi.fn();

vi.mock('@/lib/alipay/client', () => ({
  pageExecute: (...args: unknown[]) => mockPageExecute(...args),
  execute: (...args: unknown[]) => mockExecute(...args),
}));

const mockVerifySign = vi.fn();

vi.mock('@/lib/alipay/sign', () => ({
  verifySign: (...args: unknown[]) => mockVerifySign(...args),
}));

import { AlipayProvider, buildAlipayEntryUrl } from '@/lib/alipay/provider';
import type { CreatePaymentRequest, RefundRequest } from '@/lib/payment/types';

describe('AlipayProvider', () => {
  let provider: AlipayProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new AlipayProvider();
  });

  describe('metadata', () => {
    it('should have name "alipay-direct"', () => {
      expect(provider.name).toBe('alipay-direct');
    });

    it('should have providerKey "alipay"', () => {
      expect(provider.providerKey).toBe('alipay');
    });

    it('should support "alipay_direct" payment type', () => {
      expect(provider.supportedTypes).toEqual(['alipay_direct']);
    });

    it('should have default limits', () => {
      expect(provider.defaultLimits).toEqual({
        alipay_direct: { singleMax: 1000, dailyMax: 10000 },
      });
    });
  });

  describe('createPayment', () => {
    it('should return service short link as desktop qrCode', async () => {
      const request: CreatePaymentRequest = {
        orderId: 'order-001',
        amount: 100,
        paymentType: 'alipay_direct',
        subject: 'Sub2API Balance Recharge 100.00 CNY',
        clientIp: '127.0.0.1',
      };

      const result = await provider.createPayment(request);

      expect(result.tradeNo).toBe('order-001');
      expect(result.qrCode).toBe('https://pay.example.com/pay/order-001');
      expect(result.payUrl).toBe('https://pay.example.com/pay/order-001');
      expect(mockExecute).not.toHaveBeenCalled();
      expect(mockPageExecute).not.toHaveBeenCalled();
    });

    it('should build short link from app url', () => {
      expect(buildAlipayEntryUrl('order-short-link')).toBe('https://pay.example.com/pay/order-short-link');
    });

    it('should call pageExecute for mobile and return payUrl', async () => {
      mockPageExecute.mockReturnValue('https://openapi.alipay.com/gateway.do?app_id=xxx&sign=yyy');

      const request: CreatePaymentRequest = {
        orderId: 'order-002',
        amount: 50,
        paymentType: 'alipay_direct',
        subject: 'Sub2API Balance Recharge 50.00 CNY',
        clientIp: '127.0.0.1',
        isMobile: true,
      };

      const result = await provider.createPayment(request);

      expect(result.tradeNo).toBe('order-002');
      expect(result.payUrl).toBe('https://openapi.alipay.com/gateway.do?app_id=xxx&sign=yyy');
      expect(mockPageExecute).toHaveBeenCalledWith(
        {
          out_trade_no: 'order-002',
          product_code: 'QUICK_WAP_WAY',
          total_amount: '50.00',
          subject: 'Sub2API Balance Recharge 50.00 CNY',
        },
        expect.objectContaining({ method: 'alipay.trade.wap.pay' }),
      );
      expect(mockExecute).not.toHaveBeenCalled();
    });
  });

  describe('queryOrder', () => {
    it('should return paid status for TRADE_SUCCESS', async () => {
      mockExecute.mockResolvedValue({
        code: '10000',
        msg: 'Success',
        trade_no: '2026030500001',
        trade_status: 'TRADE_SUCCESS',
        total_amount: '100.00',
        send_pay_date: '2026-03-05 12:00:00',
      });

      const result = await provider.queryOrder('order-001');
      expect(result.tradeNo).toBe('2026030500001');
      expect(result.status).toBe('paid');
      expect(result.amount).toBe(100);
      expect(result.paidAt).toBeInstanceOf(Date);
    });

    it('should return paid status for TRADE_FINISHED', async () => {
      mockExecute.mockResolvedValue({
        code: '10000',
        msg: 'Success',
        trade_no: '2026030500002',
        trade_status: 'TRADE_FINISHED',
        total_amount: '50.00',
      });

      const result = await provider.queryOrder('order-002');
      expect(result.status).toBe('paid');
    });

    it('should return pending status for WAIT_BUYER_PAY', async () => {
      mockExecute.mockResolvedValue({
        code: '10000',
        msg: 'Success',
        trade_no: '2026030500003',
        trade_status: 'WAIT_BUYER_PAY',
        total_amount: '30.00',
      });

      const result = await provider.queryOrder('order-003');
      expect(result.status).toBe('pending');
    });

    it('should return failed status for TRADE_CLOSED', async () => {
      mockExecute.mockResolvedValue({
        code: '10000',
        msg: 'Success',
        trade_no: '2026030500004',
        trade_status: 'TRADE_CLOSED',
        total_amount: '20.00',
      });

      const result = await provider.queryOrder('order-004');
      expect(result.status).toBe('failed');
    });

    it('should treat ACQ.TRADE_NOT_EXIST as pending', async () => {
      mockExecute.mockRejectedValue(new Error('Alipay API error: [ACQ.TRADE_NOT_EXIST] 交易不存在'));

      const result = await provider.queryOrder('order-005');
      expect(result.tradeNo).toBe('order-005');
      expect(result.status).toBe('pending');
      expect(result.amount).toBe(0);
    });
  });

  describe('verifyNotification', () => {
    it('should verify and parse successful payment notification', async () => {
      mockVerifySign.mockReturnValue(true);

      const body = new URLSearchParams({
        trade_no: '2026030500001',
        out_trade_no: 'order-001',
        trade_status: 'TRADE_SUCCESS',
        total_amount: '100.00',
        sign: 'test_sign',
        sign_type: 'RSA2',
        app_id: '2021000000000000',
      }).toString();

      const result = await provider.verifyNotification(body, {});

      expect(result.tradeNo).toBe('2026030500001');
      expect(result.orderId).toBe('order-001');
      expect(result.amount).toBe(100);
      expect(result.status).toBe('success');
    });

    it('should parse TRADE_FINISHED as success', async () => {
      mockVerifySign.mockReturnValue(true);

      const body = new URLSearchParams({
        trade_no: '2026030500002',
        out_trade_no: 'order-002',
        trade_status: 'TRADE_FINISHED',
        total_amount: '50.00',
        sign: 'test_sign',
        sign_type: 'RSA2',
        app_id: '2021000000000000',
      }).toString();

      const result = await provider.verifyNotification(body, {});
      expect(result.status).toBe('success');
    });

    it('should parse TRADE_CLOSED as failed', async () => {
      mockVerifySign.mockReturnValue(true);

      const body = new URLSearchParams({
        trade_no: '2026030500003',
        out_trade_no: 'order-003',
        trade_status: 'TRADE_CLOSED',
        total_amount: '20.00',
        sign: 'test_sign',
        sign_type: 'RSA2',
        app_id: '2021000000000000',
      }).toString();

      const result = await provider.verifyNotification(body, {});
      expect(result.status).toBe('failed');
    });

    it('should reject unsupported sign_type', async () => {
      const body = new URLSearchParams({
        trade_no: '2026030500004',
        out_trade_no: 'order-004',
        trade_status: 'TRADE_SUCCESS',
        total_amount: '20.00',
        sign: 'test_sign',
        sign_type: 'RSA',
        app_id: '2021000000000000',
      }).toString();

      await expect(provider.verifyNotification(body, {})).rejects.toThrow('Unsupported sign_type');
    });

    it('should reject invalid signature', async () => {
      mockVerifySign.mockReturnValue(false);

      const body = new URLSearchParams({
        trade_no: '2026030500005',
        out_trade_no: 'order-005',
        trade_status: 'TRADE_SUCCESS',
        total_amount: '20.00',
        sign: 'bad_sign',
        sign_type: 'RSA2',
        app_id: '2021000000000000',
      }).toString();

      await expect(provider.verifyNotification(body, {})).rejects.toThrow(
        'Alipay notification signature verification failed',
      );
    });

    it('should reject app_id mismatch', async () => {
      mockVerifySign.mockReturnValue(true);

      const body = new URLSearchParams({
        trade_no: '2026030500006',
        out_trade_no: 'order-006',
        trade_status: 'TRADE_SUCCESS',
        total_amount: '20.00',
        sign: 'test_sign',
        sign_type: 'RSA2',
        app_id: '2021000000009999',
      }).toString();

      await expect(provider.verifyNotification(body, {})).rejects.toThrow('Alipay notification app_id mismatch');
    });
  });

  describe('refund', () => {
    it('should request refund and map success status', async () => {
      mockExecute.mockResolvedValue({
        code: '10000',
        msg: 'Success',
        trade_no: 'refund-trade-no',
        fund_change: 'Y',
      });

      const request: RefundRequest = {
        tradeNo: 'trade-no',
        orderId: 'order-refund',
        amount: 12.34,
        reason: 'test refund',
      };

      const result = await provider.refund(request);

      expect(result).toEqual({ refundId: 'refund-trade-no', status: 'success' });
      expect(mockExecute).toHaveBeenCalledWith('alipay.trade.refund', {
        out_trade_no: 'order-refund',
        refund_amount: '12.34',
        refund_reason: 'test refund',
        out_request_no: 'order-refund-refund',
      });
    });
  });

  describe('cancelPayment', () => {
    it('should close payment by out_trade_no', async () => {
      mockExecute.mockResolvedValue({ code: '10000', msg: 'Success' });

      await provider.cancelPayment('order-close');

      expect(mockExecute).toHaveBeenCalledWith('alipay.trade.close', {
        out_trade_no: 'order-close',
      });
    });

    it('should ignore ACQ.TRADE_NOT_EXIST when closing payment', async () => {
      mockExecute.mockRejectedValue(new Error('Alipay API error: [ACQ.TRADE_NOT_EXIST] 交易不存在'));

      await expect(provider.cancelPayment('order-close-missing')).resolves.toBeUndefined();
    });
  });
});
