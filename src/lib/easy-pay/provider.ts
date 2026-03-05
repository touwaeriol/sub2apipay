import type {
  PaymentProvider,
  PaymentType,
  CreatePaymentRequest,
  CreatePaymentResponse,
  QueryOrderResponse,
  PaymentNotification,
  RefundRequest,
  RefundResponse,
} from '@/lib/payment/types';
import { createPayment, queryOrder, refund } from './client';
import { verifySign } from './sign';
import { getEnv } from '@/lib/config';

export class EasyPayProvider implements PaymentProvider {
  readonly name = 'easy-pay';
  readonly providerKey = 'easypay';
  readonly supportedTypes: PaymentType[] = ['alipay', 'wxpay'];
  readonly defaultLimits = {
    alipay: { singleMax: 1000, dailyMax: 10000 },
    wxpay: { singleMax: 1000, dailyMax: 10000 },
  };

  async createPayment(request: CreatePaymentRequest): Promise<CreatePaymentResponse> {
    const result = await createPayment({
      outTradeNo: request.orderId,
      amount: request.amount.toFixed(2),
      paymentType: request.paymentType as 'alipay' | 'wxpay',
      clientIp: request.clientIp || '127.0.0.1',
      productName: request.subject,
    });

    return {
      tradeNo: result.trade_no,
      payUrl: result.payurl,
      qrCode: result.qrcode,
    };
  }

  async queryOrder(tradeNo: string): Promise<QueryOrderResponse> {
    const result = await queryOrder(tradeNo);
    return {
      tradeNo: result.trade_no,
      status: result.status === 1 ? 'paid' : 'pending',
      amount: parseFloat(result.money),
      paidAt: result.endtime ? new Date(result.endtime) : undefined,
    };
  }

  async verifyNotification(rawBody: string | Buffer, _headers: Record<string, string>): Promise<PaymentNotification> {
    const env = getEnv();
    const body = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf-8');
    const searchParams = new URLSearchParams(body);

    const params: Record<string, string> = {};
    for (const [key, value] of searchParams.entries()) {
      params[key] = value;
    }

    const sign = params.sign || '';
    const paramsForSign: Record<string, string> = {};
    for (const [key, value] of Object.entries(params)) {
      if (key !== 'sign' && key !== 'sign_type' && value !== undefined && value !== null) {
        paramsForSign[key] = value;
      }
    }

    if (!env.EASY_PAY_PKEY || !verifySign(paramsForSign, env.EASY_PAY_PKEY, sign)) {
      throw new Error('EasyPay notification signature verification failed');
    }

    return {
      tradeNo: params.trade_no || '',
      orderId: params.out_trade_no || '',
      amount: parseFloat(params.money || '0'),
      status: params.trade_status === 'TRADE_SUCCESS' ? 'success' : 'failed',
      rawData: params,
    };
  }

  async refund(request: RefundRequest): Promise<RefundResponse> {
    await refund(request.tradeNo, request.orderId, request.amount.toFixed(2));
    return {
      refundId: `${request.tradeNo}-refund`,
      status: 'success',
    };
  }

  async cancelPayment(): Promise<void> {
    // EasyPay does not support cancelling payments
  }
}
