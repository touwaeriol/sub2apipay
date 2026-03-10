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
import type {
  AlipayTradeQueryResponse,
  AlipayTradeRefundResponse,
  AlipayTradeCloseResponse,
} from './types';
import { parseAlipayNotificationParams } from './codec';

export interface BuildAlipayPaymentUrlInput {
  orderId: string;
  amount: number;
  subject: string;
  notifyUrl?: string;
  returnUrl?: string | null;
  isMobile?: boolean;
}

function isTradeNotExistError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.message.includes('[ACQ.TRADE_NOT_EXIST]');
}

function getRequiredParam(params: Record<string, string>, key: string): string {
  const value = params[key]?.trim();
  if (!value) {
    throw new Error(`Alipay notification missing required field: ${key}`);
  }
  return value;
}

export function buildAlipayPaymentUrl(input: BuildAlipayPaymentUrlInput): string {
  const method = input.isMobile ? 'alipay.trade.wap.pay' : 'alipay.trade.page.pay';
  const productCode = input.isMobile ? 'QUICK_WAP_WAY' : 'FAST_INSTANT_TRADE_PAY';

  return pageExecute(
    {
      out_trade_no: input.orderId,
      product_code: productCode,
      total_amount: input.amount.toFixed(2),
      subject: input.subject,
    },
    {
      notifyUrl: input.notifyUrl,
      returnUrl: input.returnUrl,
      method,
    },
  );
}

export function buildAlipayEntryUrl(orderId: string): string {
  const env = getEnv();
  return new URL(`/pay/${orderId}`, env.NEXT_PUBLIC_APP_URL).toString();
}

export class AlipayProvider implements PaymentProvider {
  readonly name = 'alipay-direct';
  readonly providerKey = 'alipay';
  readonly supportedTypes: PaymentType[] = ['alipay_direct'];
  readonly defaultLimits = {
    alipay_direct: { singleMax: 1000, dailyMax: 10000 },
  };

  async createPayment(request: CreatePaymentRequest): Promise<CreatePaymentResponse> {
    if (!request.isMobile) {
      const entryUrl = buildAlipayEntryUrl(request.orderId);
      return {
        tradeNo: request.orderId,
        payUrl: entryUrl,
        qrCode: entryUrl,
      };
    }

    const payUrl = buildAlipayPaymentUrl({
      orderId: request.orderId,
      amount: request.amount,
      subject: request.subject,
      notifyUrl: request.notifyUrl,
      returnUrl: request.returnUrl,
      isMobile: true,
    });

    return { tradeNo: request.orderId, payUrl };
  }

  async queryOrder(tradeNo: string): Promise<QueryOrderResponse> {
    let result: AlipayTradeQueryResponse;
    try {
      result = await execute<AlipayTradeQueryResponse>('alipay.trade.query', {
        out_trade_no: tradeNo,
      });
    } catch (error) {
      if (isTradeNotExistError(error)) {
        return {
          tradeNo,
          status: 'pending',
          amount: 0,
        };
      }
      throw error;
    }

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

  async verifyNotification(rawBody: string | Buffer, headers: Record<string, string>): Promise<PaymentNotification> {
    const env = getEnv();
    const params = parseAlipayNotificationParams(rawBody, headers);

    if (params.sign_type && params.sign_type.toUpperCase() !== 'RSA2') {
      throw new Error('Unsupported sign_type, only RSA2 is accepted');
    }

    const sign = getRequiredParam(params, 'sign');
    if (!env.ALIPAY_PUBLIC_KEY || !verifySign(params, env.ALIPAY_PUBLIC_KEY, sign)) {
      throw new Error(
        'Alipay notification signature verification failed (check ALIPAY_PUBLIC_KEY uses Alipay public key, not app public key, and rebuild/redeploy the latest image)',
      );
    }

    const tradeNo = getRequiredParam(params, 'trade_no');
    const orderId = getRequiredParam(params, 'out_trade_no');
    const tradeStatus = getRequiredParam(params, 'trade_status');
    const appId = getRequiredParam(params, 'app_id');

    if (appId !== env.ALIPAY_APP_ID) {
      throw new Error('Alipay notification app_id mismatch');
    }

    const amount = Number.parseFloat(getRequiredParam(params, 'total_amount'));
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error('Alipay notification invalid total_amount');
    }

    return {
      tradeNo,
      orderId,
      amount: Math.round(amount * 100) / 100,
      status:
        tradeStatus === 'TRADE_SUCCESS' || tradeStatus === 'TRADE_FINISHED' ? 'success' : 'failed',
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
    try {
      await execute<AlipayTradeCloseResponse>('alipay.trade.close', {
        out_trade_no: tradeNo,
      });
    } catch (error) {
      if (isTradeNotExistError(error)) {
        return;
      }
      throw error;
    }
  }
}
