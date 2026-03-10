import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================
// Mock: EasyPay
// ============================================================

const mockEasyPayCreatePayment = vi.fn();
vi.mock('@/lib/easy-pay/client', () => ({
  createPayment: (...args: unknown[]) => mockEasyPayCreatePayment(...args),
  queryOrder: vi.fn(),
  refund: vi.fn(),
}));

vi.mock('@/lib/easy-pay/sign', () => ({
  verifySign: vi.fn(),
  generateSign: vi.fn(),
}));

// ============================================================
// Mock: Alipay
// ============================================================

const mockAlipayPageExecute = vi.fn();
vi.mock('@/lib/alipay/client', () => ({
  pageExecute: (...args: unknown[]) => mockAlipayPageExecute(...args),
  execute: vi.fn(),
}));

vi.mock('@/lib/alipay/sign', () => ({
  verifySign: vi.fn(),
  generateSign: vi.fn(),
}));

// ============================================================
// Mock: Wxpay
// ============================================================

const mockWxpayCreatePcOrder = vi.fn();
const mockWxpayCreateH5Order = vi.fn();
vi.mock('@/lib/wxpay/client', () => ({
  createPcOrder: (...args: unknown[]) => mockWxpayCreatePcOrder(...args),
  createH5Order: (...args: unknown[]) => mockWxpayCreateH5Order(...args),
  queryOrder: vi.fn(),
  closeOrder: vi.fn(),
  createRefund: vi.fn(),
  decipherNotify: vi.fn(),
  verifyNotifySign: vi.fn(),
}));

// ============================================================
// Mock: Config (shared by all providers)
// ============================================================

vi.mock('@/lib/config', () => ({
  getEnv: () => ({
    // EasyPay
    EASY_PAY_PID: 'test-pid',
    EASY_PAY_PKEY: 'test-pkey',
    EASY_PAY_API_BASE: 'https://easypay.example.com',
    EASY_PAY_NOTIFY_URL: 'https://pay.example.com/api/easypay/notify',
    EASY_PAY_RETURN_URL: 'https://pay.example.com/pay/result',
    // Alipay
    ALIPAY_APP_ID: '2021000000000000',
    ALIPAY_PRIVATE_KEY: 'test-private-key',
    ALIPAY_PUBLIC_KEY: 'test-public-key',
    ALIPAY_NOTIFY_URL: 'https://pay.example.com/api/alipay/notify',
    ALIPAY_RETURN_URL: 'https://pay.example.com/pay/result',
    // Wxpay
    WXPAY_APP_ID: 'wx-test-app-id',
    WXPAY_MCH_ID: 'wx-test-mch-id',
    WXPAY_PRIVATE_KEY: 'test-private-key',
    WXPAY_API_V3_KEY: 'test-api-v3-key',
    WXPAY_PUBLIC_KEY: 'test-public-key',
    WXPAY_PUBLIC_KEY_ID: 'test-public-key-id',
    WXPAY_CERT_SERIAL: 'test-cert-serial',
    WXPAY_NOTIFY_URL: 'https://pay.example.com/api/wxpay/notify',
    // General
    NEXT_PUBLIC_APP_URL: 'https://pay.example.com',
  }),
}));

// ============================================================
// Imports (must come after mocks)
// ============================================================

import { EasyPayProvider } from '@/lib/easy-pay/provider';
import { AlipayProvider } from '@/lib/alipay/provider';
import { WxpayProvider } from '@/lib/wxpay/provider';
import { isStripeType } from '@/lib/pay-utils';
import { REDIRECT_PAYMENT_TYPES } from '@/lib/constants';
import type { CreatePaymentRequest } from '@/lib/payment/types';

// ============================================================
// Helper: simulate shouldAutoRedirect logic from PaymentQRCode
// ============================================================

function shouldAutoRedirect(opts: {
  expired: boolean;
  paymentType?: string;
  payUrl?: string | null;
  qrCode?: string | null;
  isMobile: boolean;
}): boolean {
  return (
    !opts.expired &&
    !isStripeType(opts.paymentType) &&
    !!opts.payUrl &&
    (opts.isMobile || !opts.qrCode)
  );
}

// ============================================================
// Tests
// ============================================================

describe('Payment Flow - PC/Mobile, QR/Redirect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ----------------------------------------------------------
  // EasyPay Provider
  // ----------------------------------------------------------

  describe('EasyPayProvider', () => {
    let provider: EasyPayProvider;

    beforeEach(() => {
      provider = new EasyPayProvider();
    });

    it('PC: createPayment returns both payUrl and qrCode', async () => {
      mockEasyPayCreatePayment.mockResolvedValue({
        code: 1,
        trade_no: 'EP-001',
        payurl: 'https://easypay.example.com/pay/EP-001',
        qrcode: 'https://qr.alipay.com/fkx12345',
      });

      const request: CreatePaymentRequest = {
        orderId: 'order-ep-001',
        amount: 50,
        paymentType: 'alipay',
        subject: 'Test Recharge',
        clientIp: '1.2.3.4',
        isMobile: false,
      };

      const result = await provider.createPayment(request);

      expect(result.tradeNo).toBe('EP-001');
      expect(result.qrCode).toBe('https://qr.alipay.com/fkx12345');
      expect(result.payUrl).toBe('https://easypay.example.com/pay/EP-001');

      // PC + has qrCode + has payUrl => shouldAutoRedirect = false (show QR)
      expect(
        shouldAutoRedirect({
          expired: false,
          paymentType: 'alipay',
          payUrl: result.payUrl,
          qrCode: result.qrCode,
          isMobile: false,
        }),
      ).toBe(false);
    });

    it('Mobile: createPayment returns payUrl for redirect', async () => {
      mockEasyPayCreatePayment.mockResolvedValue({
        code: 1,
        trade_no: 'EP-002',
        payurl: 'https://easypay.example.com/pay/EP-002',
        qrcode: 'https://qr.alipay.com/fkx67890',
      });

      const request: CreatePaymentRequest = {
        orderId: 'order-ep-002',
        amount: 100,
        paymentType: 'wxpay',
        subject: 'Test Recharge',
        clientIp: '1.2.3.4',
        isMobile: true,
      };

      const result = await provider.createPayment(request);

      expect(result.tradeNo).toBe('EP-002');
      expect(result.payUrl).toBeDefined();

      // Mobile + has payUrl => shouldAutoRedirect = true (redirect)
      expect(
        shouldAutoRedirect({
          expired: false,
          paymentType: 'wxpay',
          payUrl: result.payUrl,
          qrCode: result.qrCode,
          isMobile: true,
        }),
      ).toBe(true);
    });

    it('EasyPay does not use isMobile flag itself (delegates to frontend)', async () => {
      mockEasyPayCreatePayment.mockResolvedValue({
        code: 1,
        trade_no: 'EP-003',
        payurl: 'https://easypay.example.com/pay/EP-003',
        qrcode: 'weixin://wxpay/bizpayurl?pr=xxx',
      });

      const request: CreatePaymentRequest = {
        orderId: 'order-ep-003',
        amount: 10,
        paymentType: 'alipay',
        subject: 'Test',
        clientIp: '1.2.3.4',
        isMobile: true,
      };

      await provider.createPayment(request);

      // EasyPay client is called the same way regardless of isMobile
      expect(mockEasyPayCreatePayment).toHaveBeenCalledWith(
        expect.objectContaining({
          outTradeNo: 'order-ep-003',
          paymentType: 'alipay',
        }),
      );
      // No isMobile parameter forwarded to the underlying client
      const callArgs = mockEasyPayCreatePayment.mock.calls[0][0];
      expect(callArgs).not.toHaveProperty('isMobile');
    });
  });

  // ----------------------------------------------------------
  // Alipay Provider
  // ----------------------------------------------------------

  describe('AlipayProvider', () => {
    let provider: AlipayProvider;

    beforeEach(() => {
      provider = new AlipayProvider();
    });

    it('PC: returns service short-link payUrl and qrCode', async () => {
      const request: CreatePaymentRequest = {
        orderId: 'order-ali-001',
        amount: 100,
        paymentType: 'alipay_direct',
        subject: 'Test Recharge',
        isMobile: false,
      };

      const result = await provider.createPayment(request);

      expect(result.tradeNo).toBe('order-ali-001');
      expect(result.payUrl).toBe('https://pay.example.com/pay/order-ali-001');
      expect(result.qrCode).toBe('https://pay.example.com/pay/order-ali-001');
      expect(mockAlipayPageExecute).not.toHaveBeenCalled();

      expect(
        shouldAutoRedirect({
          expired: false,
          paymentType: 'alipay_direct',
          payUrl: result.payUrl,
          qrCode: result.qrCode,
          isMobile: false,
        }),
      ).toBe(false);
    });

    it('Mobile: uses alipay.trade.wap.pay, returns payUrl', async () => {
      mockAlipayPageExecute.mockReturnValue(
        'https://openapi.alipay.com/gateway.do?method=alipay.trade.wap.pay&sign=yyy',
      );

      const request: CreatePaymentRequest = {
        orderId: 'order-ali-002',
        amount: 50,
        paymentType: 'alipay_direct',
        subject: 'Test Recharge',
        isMobile: true,
      };

      const result = await provider.createPayment(request);

      expect(result.tradeNo).toBe('order-ali-002');
      expect(result.payUrl).toContain('alipay.trade.wap.pay');
      expect(result.qrCode).toBeUndefined();

      // Verify pageExecute was called with H5 method
      expect(mockAlipayPageExecute).toHaveBeenCalledWith(
        expect.objectContaining({
          product_code: 'QUICK_WAP_WAY',
        }),
        expect.objectContaining({
          method: 'alipay.trade.wap.pay',
        }),
      );

      // Mobile + payUrl => shouldAutoRedirect = true
      expect(
        shouldAutoRedirect({
          expired: false,
          paymentType: 'alipay_direct',
          payUrl: result.payUrl,
          qrCode: result.qrCode,
          isMobile: true,
        }),
      ).toBe(true);
    });

    it('Mobile: surfaces wap.pay creation errors', async () => {
      mockAlipayPageExecute.mockImplementationOnce(() => {
        throw new Error('WAP pay not available');
      });

      const request: CreatePaymentRequest = {
        orderId: 'order-ali-003',
        amount: 30,
        paymentType: 'alipay_direct',
        subject: 'Test Recharge',
        isMobile: true,
      };

      await expect(provider.createPayment(request)).rejects.toThrow('WAP pay not available');
      expect(mockAlipayPageExecute).toHaveBeenCalledTimes(1);
      expect(mockAlipayPageExecute).toHaveBeenCalledWith(
        expect.objectContaining({ product_code: 'QUICK_WAP_WAY' }),
        expect.objectContaining({ method: 'alipay.trade.wap.pay' }),
      );
    });

    it('alipay_direct is in REDIRECT_PAYMENT_TYPES', () => {
      expect(REDIRECT_PAYMENT_TYPES.has('alipay_direct')).toBe(true);
    });
  });

  // ----------------------------------------------------------
  // Wxpay Provider
  // ----------------------------------------------------------

  describe('WxpayProvider', () => {
    let provider: WxpayProvider;

    beforeEach(() => {
      provider = new WxpayProvider();
    });

    it('PC: uses Native order, returns qrCode (no payUrl)', async () => {
      mockWxpayCreatePcOrder.mockResolvedValue('weixin://wxpay/bizpayurl?pr=abc123');

      const request: CreatePaymentRequest = {
        orderId: 'order-wx-001',
        amount: 100,
        paymentType: 'wxpay_direct',
        subject: 'Test Recharge',
        clientIp: '1.2.3.4',
        isMobile: false,
      };

      const result = await provider.createPayment(request);

      expect(result.tradeNo).toBe('order-wx-001');
      expect(result.qrCode).toBe('weixin://wxpay/bizpayurl?pr=abc123');
      expect(result.payUrl).toBeUndefined();

      // createPcOrder was called, not createH5Order
      expect(mockWxpayCreatePcOrder).toHaveBeenCalledTimes(1);
      expect(mockWxpayCreateH5Order).not.toHaveBeenCalled();

      // PC + qrCode (no payUrl) => shouldAutoRedirect = false (show QR)
      expect(
        shouldAutoRedirect({
          expired: false,
          paymentType: 'wxpay_direct',
          payUrl: result.payUrl,
          qrCode: result.qrCode,
          isMobile: false,
        }),
      ).toBe(false);
    });

    it('Mobile: uses H5 order, returns payUrl (no qrCode)', async () => {
      mockWxpayCreateH5Order.mockResolvedValue(
        'https://wx.tenpay.com/cgi-bin/mmpayweb-bin/checkmweb?prepay_id=wx123',
      );

      const request: CreatePaymentRequest = {
        orderId: 'order-wx-002',
        amount: 50,
        paymentType: 'wxpay_direct',
        subject: 'Test Recharge',
        clientIp: '2.3.4.5',
        isMobile: true,
      };

      const result = await provider.createPayment(request);

      expect(result.tradeNo).toBe('order-wx-002');
      expect(result.payUrl).toContain('tenpay.com');
      expect(result.qrCode).toBeUndefined();

      // createH5Order was called, not createPcOrder
      expect(mockWxpayCreateH5Order).toHaveBeenCalledTimes(1);
      expect(mockWxpayCreatePcOrder).not.toHaveBeenCalled();

      // Mobile + payUrl => shouldAutoRedirect = true
      expect(
        shouldAutoRedirect({
          expired: false,
          paymentType: 'wxpay_direct',
          payUrl: result.payUrl,
          qrCode: result.qrCode,
          isMobile: true,
        }),
      ).toBe(true);
    });

    it('Mobile: falls back to Native qrCode when H5 returns NO_AUTH', async () => {
      mockWxpayCreateH5Order.mockRejectedValue(new Error('Wxpay API error: [NO_AUTH] not authorized'));
      mockWxpayCreatePcOrder.mockResolvedValue('weixin://wxpay/bizpayurl?pr=fallback123');

      const request: CreatePaymentRequest = {
        orderId: 'order-wx-003',
        amount: 30,
        paymentType: 'wxpay_direct',
        subject: 'Test Recharge',
        clientIp: '3.4.5.6',
        isMobile: true,
      };

      const result = await provider.createPayment(request);

      expect(result.tradeNo).toBe('order-wx-003');
      expect(result.qrCode).toBe('weixin://wxpay/bizpayurl?pr=fallback123');
      expect(result.payUrl).toBeUndefined();

      // Both were called: H5 failed, then Native succeeded
      expect(mockWxpayCreateH5Order).toHaveBeenCalledTimes(1);
      expect(mockWxpayCreatePcOrder).toHaveBeenCalledTimes(1);

      // Mobile + qrCode only (no payUrl) => shouldAutoRedirect = false (show QR)
      expect(
        shouldAutoRedirect({
          expired: false,
          paymentType: 'wxpay_direct',
          payUrl: result.payUrl,
          qrCode: result.qrCode,
          isMobile: true,
        }),
      ).toBe(false);
    });

    it('Mobile: re-throws non-NO_AUTH errors from H5', async () => {
      mockWxpayCreateH5Order.mockRejectedValue(new Error('Wxpay API error: [SYSTEMERROR] system error'));

      const request: CreatePaymentRequest = {
        orderId: 'order-wx-004',
        amount: 20,
        paymentType: 'wxpay_direct',
        subject: 'Test Recharge',
        clientIp: '4.5.6.7',
        isMobile: true,
      };

      await expect(provider.createPayment(request)).rejects.toThrow('SYSTEMERROR');
      // Should not fall back to PC order
      expect(mockWxpayCreatePcOrder).not.toHaveBeenCalled();
    });

    it('Mobile without clientIp: falls back to Native qrCode directly', async () => {
      mockWxpayCreatePcOrder.mockResolvedValue('weixin://wxpay/bizpayurl?pr=noip');

      const request: CreatePaymentRequest = {
        orderId: 'order-wx-005',
        amount: 10,
        paymentType: 'wxpay_direct',
        subject: 'Test Recharge',
        // No clientIp
        isMobile: true,
      };

      const result = await provider.createPayment(request);

      expect(result.qrCode).toBe('weixin://wxpay/bizpayurl?pr=noip');
      expect(result.payUrl).toBeUndefined();
      // H5 was never attempted since clientIp is missing
      expect(mockWxpayCreateH5Order).not.toHaveBeenCalled();
    });

    it('uses request.notifyUrl as fallback when WXPAY_NOTIFY_URL is set', async () => {
      mockWxpayCreatePcOrder.mockResolvedValue('weixin://wxpay/bizpayurl?pr=withnotify');

      const request: CreatePaymentRequest = {
        orderId: 'order-wx-006',
        amount: 10,
        paymentType: 'wxpay_direct',
        subject: 'Test',
        isMobile: false,
        notifyUrl: 'https://pay.example.com/api/wxpay/notify-alt',
      };

      const result = await provider.createPayment(request);
      expect(result.qrCode).toBe('weixin://wxpay/bizpayurl?pr=withnotify');
      // WXPAY_NOTIFY_URL from env takes priority over request.notifyUrl
      expect(mockWxpayCreatePcOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          notify_url: 'https://pay.example.com/api/wxpay/notify',
        }),
      );
    });
  });

  // ----------------------------------------------------------
  // shouldAutoRedirect logic (PaymentQRCode component)
  // ----------------------------------------------------------

  describe('shouldAutoRedirect (PaymentQRCode logic)', () => {
    it('PC + qrCode + payUrl => false (show QR code, do not redirect)', () => {
      expect(
        shouldAutoRedirect({
          expired: false,
          paymentType: 'alipay',
          payUrl: 'https://example.com/pay',
          qrCode: 'https://qr.alipay.com/xxx',
          isMobile: false,
        }),
      ).toBe(false);
    });

    it('PC + payUrl only (no qrCode) => true (redirect)', () => {
      expect(
        shouldAutoRedirect({
          expired: false,
          paymentType: 'alipay_direct',
          payUrl: 'https://openapi.alipay.com/gateway.do?...',
          qrCode: undefined,
          isMobile: false,
        }),
      ).toBe(true);
    });

    it('PC + payUrl + empty qrCode string => true (redirect)', () => {
      expect(
        shouldAutoRedirect({
          expired: false,
          paymentType: 'alipay_direct',
          payUrl: 'https://openapi.alipay.com/gateway.do?...',
          qrCode: '',
          isMobile: false,
        }),
      ).toBe(true);
    });

    it('PC + payUrl + null qrCode => true (redirect)', () => {
      expect(
        shouldAutoRedirect({
          expired: false,
          paymentType: 'alipay_direct',
          payUrl: 'https://openapi.alipay.com/gateway.do?...',
          qrCode: null,
          isMobile: false,
        }),
      ).toBe(true);
    });

    it('Mobile + payUrl => true (redirect)', () => {
      expect(
        shouldAutoRedirect({
          expired: false,
          paymentType: 'wxpay_direct',
          payUrl: 'https://wx.tenpay.com/...',
          qrCode: undefined,
          isMobile: true,
        }),
      ).toBe(true);
    });

    it('Mobile + payUrl + qrCode => true (redirect, mobile always prefers payUrl)', () => {
      expect(
        shouldAutoRedirect({
          expired: false,
          paymentType: 'alipay',
          payUrl: 'https://easypay.example.com/pay/xxx',
          qrCode: 'https://qr.alipay.com/xxx',
          isMobile: true,
        }),
      ).toBe(true);
    });

    it('Mobile + qrCode only (no payUrl) => false (show QR code)', () => {
      expect(
        shouldAutoRedirect({
          expired: false,
          paymentType: 'wxpay_direct',
          payUrl: undefined,
          qrCode: 'weixin://wxpay/bizpayurl?pr=xxx',
          isMobile: true,
        }),
      ).toBe(false);
    });

    it('Stripe => false (never redirect, uses Payment Element)', () => {
      expect(
        shouldAutoRedirect({
          expired: false,
          paymentType: 'stripe',
          payUrl: 'https://checkout.stripe.com/xxx',
          qrCode: undefined,
          isMobile: false,
        }),
      ).toBe(false);
    });

    it('Stripe on mobile => false (still no redirect)', () => {
      expect(
        shouldAutoRedirect({
          expired: false,
          paymentType: 'stripe',
          payUrl: 'https://checkout.stripe.com/xxx',
          qrCode: undefined,
          isMobile: true,
        }),
      ).toBe(false);
    });

    it('Expired order => false (never redirect expired orders)', () => {
      expect(
        shouldAutoRedirect({
          expired: true,
          paymentType: 'alipay',
          payUrl: 'https://example.com/pay',
          qrCode: undefined,
          isMobile: true,
        }),
      ).toBe(false);
    });

    it('No payUrl at all => false (nothing to redirect to)', () => {
      expect(
        shouldAutoRedirect({
          expired: false,
          paymentType: 'alipay',
          payUrl: undefined,
          qrCode: undefined,
          isMobile: true,
        }),
      ).toBe(false);
    });

    it('Empty payUrl string => false (treated as falsy)', () => {
      expect(
        shouldAutoRedirect({
          expired: false,
          paymentType: 'alipay',
          payUrl: '',
          qrCode: undefined,
          isMobile: true,
        }),
      ).toBe(false);
    });

    it('Null payUrl => false (treated as falsy)', () => {
      expect(
        shouldAutoRedirect({
          expired: false,
          paymentType: 'alipay',
          payUrl: null,
          qrCode: undefined,
          isMobile: true,
        }),
      ).toBe(false);
    });
  });

  // ----------------------------------------------------------
  // Utility function tests
  // ----------------------------------------------------------

  describe('isStripeType', () => {
    it('returns true for "stripe"', () => {
      expect(isStripeType('stripe')).toBe(true);
    });

    it('returns true for stripe-prefixed types', () => {
      expect(isStripeType('stripe_card')).toBe(true);
    });

    it('returns false for alipay', () => {
      expect(isStripeType('alipay')).toBe(false);
    });

    it('returns false for wxpay', () => {
      expect(isStripeType('wxpay')).toBe(false);
    });

    it('returns false for undefined', () => {
      expect(isStripeType(undefined)).toBe(false);
    });

    it('returns false for null', () => {
      expect(isStripeType(null)).toBe(false);
    });
  });

  describe('REDIRECT_PAYMENT_TYPES', () => {
    it('includes alipay_direct', () => {
      expect(REDIRECT_PAYMENT_TYPES.has('alipay_direct')).toBe(true);
    });

    it('does not include alipay (easypay version)', () => {
      expect(REDIRECT_PAYMENT_TYPES.has('alipay')).toBe(false);
    });

    it('does not include wxpay types', () => {
      expect(REDIRECT_PAYMENT_TYPES.has('wxpay')).toBe(false);
      expect(REDIRECT_PAYMENT_TYPES.has('wxpay_direct')).toBe(false);
    });

    it('does not include stripe', () => {
      expect(REDIRECT_PAYMENT_TYPES.has('stripe')).toBe(false);
    });
  });
});
