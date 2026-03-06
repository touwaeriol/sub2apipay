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
import {
  createPcOrder,
  createH5Order,
  queryOrder,
  closeOrder,
  createRefund,
  decipherNotify,
  verifyNotifySign,
} from './client';
import { getEnv } from '@/lib/config';
import type { WxpayNotifyPayload, WxpayNotifyResource } from './types';

export class WxpayProvider implements PaymentProvider {
  readonly name = 'wxpay-direct';
  readonly providerKey = 'wxpay';
  readonly supportedTypes: PaymentType[] = ['wxpay_direct'];
  readonly defaultLimits = {
    wxpay_direct: { singleMax: 1000, dailyMax: 10000 },
  };

  async createPayment(request: CreatePaymentRequest): Promise<CreatePaymentResponse> {
    const env = getEnv();
    const notifyUrl = env.WXPAY_NOTIFY_URL || request.notifyUrl;
    if (!notifyUrl) {
      throw new Error('WXPAY_NOTIFY_URL is required');
    }

    if (request.isMobile && request.clientIp) {
      try {
        const h5Url = await createH5Order({
          out_trade_no: request.orderId,
          description: request.subject,
          notify_url: notifyUrl,
          amount: request.amount,
          payer_client_ip: request.clientIp,
        });
        return { tradeNo: request.orderId, payUrl: h5Url };
      } catch (err) {
        const msg = err instanceof Error ? err.message : '';
        if (!msg.includes('NO_AUTH')) throw err;
        // H5 未开通，fallback 到 Native 扫码
      }
    }

    const codeUrl = await createPcOrder({
      out_trade_no: request.orderId,
      description: request.subject,
      notify_url: notifyUrl,
      amount: request.amount,
    });
    return { tradeNo: request.orderId, qrCode: codeUrl };
  }

  async queryOrder(tradeNo: string): Promise<QueryOrderResponse> {
    const result = await queryOrder(tradeNo);

    let status: 'pending' | 'paid' | 'failed' | 'refunded';
    switch (result.trade_state) {
      case 'SUCCESS':
        status = 'paid';
        break;
      case 'REFUND':
        status = 'refunded';
        break;
      case 'CLOSED':
      case 'PAYERROR':
        status = 'failed';
        break;
      default:
        status = 'pending';
    }

    const amount = result.amount as { total?: number } | undefined;
    const totalFen = amount?.total ?? 0;

    return {
      tradeNo: (result.transaction_id as string) || tradeNo,
      status,
      amount: totalFen / 100,
      paidAt: result.success_time ? new Date(result.success_time as string) : undefined,
    };
  }

  async verifyNotification(
    rawBody: string | Buffer,
    headers: Record<string, string>,
  ): Promise<PaymentNotification | null> {
    const env = getEnv();
    if (!env.WXPAY_PUBLIC_KEY) {
      throw new Error('WXPAY_PUBLIC_KEY is required for notification verification');
    }

    const body = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf-8');

    const timestamp = headers['wechatpay-timestamp'] || '';
    const nonce = headers['wechatpay-nonce'] || '';
    const signature = headers['wechatpay-signature'] || '';
    const serial = headers['wechatpay-serial'] || '';

    if (!timestamp || !nonce || !signature || !serial) {
      throw new Error('Missing required Wechatpay signature headers');
    }

    // 验证 serial 匹配我们配置的公钥 ID
    if (serial !== env.WXPAY_PUBLIC_KEY_ID) {
      throw new Error(`Wxpay serial mismatch: expected ${env.WXPAY_PUBLIC_KEY_ID}, got ${serial}`);
    }

    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - Number(timestamp)) > 300) {
      throw new Error('Wechatpay notification timestamp expired');
    }

    const valid = await verifyNotifySign({ timestamp, nonce, body, serial, signature });
    if (!valid) {
      throw new Error('Wxpay notification signature verification failed');
    }

    const payload: WxpayNotifyPayload = JSON.parse(body);

    if (payload.event_type !== 'TRANSACTION.SUCCESS') {
      return null;
    }

    const resource = decipherNotify<WxpayNotifyResource>(
      payload.resource.ciphertext,
      payload.resource.associated_data,
      payload.resource.nonce,
    );

    return {
      tradeNo: resource.transaction_id,
      orderId: resource.out_trade_no,
      amount: resource.amount.total / 100,
      status: resource.trade_state === 'SUCCESS' ? 'success' : 'failed',
      rawData: resource,
    };
  }

  async refund(request: RefundRequest): Promise<RefundResponse> {
    const orderResult = await queryOrder(request.orderId);
    const amount = orderResult.amount as { total?: number } | undefined;
    const totalFen = amount?.total ?? 0;

    const result = await createRefund({
      out_trade_no: request.orderId,
      out_refund_no: `refund-${request.orderId}`,
      amount: request.amount,
      total: totalFen / 100,
      reason: request.reason,
    });

    return {
      refundId: (result.refund_id as string) || `${request.orderId}-refund`,
      status: result.status === 'SUCCESS' ? 'success' : 'pending',
    };
  }

  async cancelPayment(tradeNo: string): Promise<void> {
    await closeOrder(tradeNo);
  }
}
