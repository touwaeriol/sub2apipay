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
import { pageExecute, execute } from './client';
import { verifySign } from './sign';
import { getEnv } from '@/lib/config';
import type { AlipayTradeQueryResponse, AlipayTradeRefundResponse, AlipayTradeCloseResponse } from './types';

export class AlipayProvider implements PaymentProvider {
  readonly name = 'alipay-direct';
  readonly providerKey = 'alipay';
  readonly supportedTypes: PaymentType[] = ['alipay_direct'];
  readonly defaultLimits = {
    alipay_direct: { singleMax: 1000, dailyMax: 10000 },
  };

  async createPayment(request: CreatePaymentRequest): Promise<CreatePaymentResponse> {
    const buildPayUrl = (mobile: boolean) => {
      const method = mobile ? 'alipay.trade.wap.pay' : 'alipay.trade.page.pay';
      const productCode = mobile ? 'QUICK_WAP_WAY' : 'FAST_INSTANT_TRADE_PAY';
      return pageExecute(
        {
          out_trade_no: request.orderId,
          product_code: productCode,
          total_amount: request.amount.toFixed(2),
          subject: request.subject,
        },
        {
          notifyUrl: request.notifyUrl,
          returnUrl: request.returnUrl,
          method,
        },
      );
    };

    let url: string;
    if (request.isMobile) {
      try {
        url = buildPayUrl(true);
      } catch {
        url = buildPayUrl(false);
      }
    } else {
      url = buildPayUrl(false);
    }

    return { tradeNo: request.orderId, payUrl: url };
  }

  async queryOrder(tradeNo: string): Promise<QueryOrderResponse> {
    const result = await execute<AlipayTradeQueryResponse>('alipay.trade.query', {
      out_trade_no: tradeNo,
    });

    let status: 'pending' | 'paid' | 'failed' | 'refunded';
    switch (result.trade_status) {
      case 'TRADE_SUCCESS':
      case 'TRADE_FINISHED':
        status = 'paid';
        break;
      case 'TRADE_CLOSED':
        status = 'failed';
        break;
      default:
        status = 'pending';
    }

    return {
      tradeNo: result.trade_no || tradeNo,
      status,
      amount: Math.round(parseFloat(result.total_amount || '0') * 100) / 100,
      paidAt: result.send_pay_date ? new Date(result.send_pay_date) : undefined,
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

    // sign_type 过滤：仅接受 RSA2
    if (params.sign_type && params.sign_type !== 'RSA2') {
      throw new Error('Unsupported sign_type, only RSA2 is accepted');
    }

    const sign = params.sign || '';
    if (!env.ALIPAY_PUBLIC_KEY || !verifySign(params, env.ALIPAY_PUBLIC_KEY, sign)) {
      throw new Error('Alipay notification signature verification failed');
    }

    // app_id 校验
    if (params.app_id !== env.ALIPAY_APP_ID) {
      throw new Error('Alipay notification app_id mismatch');
    }

    return {
      tradeNo: params.trade_no || '',
      orderId: params.out_trade_no || '',
      amount: Math.round(parseFloat(params.total_amount || '0') * 100) / 100,
      status:
        params.trade_status === 'TRADE_SUCCESS' || params.trade_status === 'TRADE_FINISHED' ? 'success' : 'failed',
      rawData: params,
    };
  }

  async refund(request: RefundRequest): Promise<RefundResponse> {
    const result = await execute<AlipayTradeRefundResponse>('alipay.trade.refund', {
      out_trade_no: request.orderId,
      refund_amount: request.amount.toFixed(2),
      refund_reason: request.reason || '',
      out_request_no: request.orderId + '-refund',
    });

    return {
      refundId: result.trade_no || `${request.orderId}-refund`,
      status: result.fund_change === 'Y' ? 'success' : 'pending',
    };
  }

  async cancelPayment(tradeNo: string): Promise<void> {
    await execute<AlipayTradeCloseResponse>('alipay.trade.close', {
      out_trade_no: tradeNo,
    });
  }
}
