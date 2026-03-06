import { paymentRegistry } from './registry';
import type { PaymentType } from './types';
import { EasyPayProvider } from '@/lib/easy-pay/provider';
import { StripeProvider } from '@/lib/stripe/provider';
import { AlipayProvider } from '@/lib/alipay/provider';
import { WxpayProvider } from '@/lib/wxpay/provider';
import { getEnv } from '@/lib/config';

export { paymentRegistry } from './registry';
export type {
  PaymentType,
  PaymentProvider,
  CreatePaymentRequest,
  CreatePaymentResponse,
  QueryOrderResponse,
  PaymentNotification,
  RefundRequest,
  RefundResponse,
} from './types';

let initialized = false;

export function initPaymentProviders(): void {
  if (initialized) return;

  const env = getEnv();
  const providers = env.PAYMENT_PROVIDERS;

  if (providers.includes('easypay')) {
    if (!env.EASY_PAY_PID || !env.EASY_PAY_PKEY) {
      throw new Error('PAYMENT_PROVIDERS 含 easypay，但缺少 EASY_PAY_PID 或 EASY_PAY_PKEY');
    }
    paymentRegistry.register(new EasyPayProvider());
  }

  if (providers.includes('alipay')) {
    if (!env.ALIPAY_APP_ID || !env.ALIPAY_PRIVATE_KEY || !env.ALIPAY_NOTIFY_URL) {
      throw new Error(
        'PAYMENT_PROVIDERS includes alipay but required env vars are missing: ALIPAY_APP_ID, ALIPAY_PRIVATE_KEY, ALIPAY_NOTIFY_URL',
      );
    }
    paymentRegistry.register(new AlipayProvider()); // 注册 alipay_direct
  }

  if (providers.includes('wxpay')) {
    if (
      !env.WXPAY_APP_ID ||
      !env.WXPAY_MCH_ID ||
      !env.WXPAY_PRIVATE_KEY ||
      !env.WXPAY_API_V3_KEY ||
      !env.WXPAY_PUBLIC_KEY ||
      !env.WXPAY_PUBLIC_KEY_ID ||
      !env.WXPAY_CERT_SERIAL ||
      !env.WXPAY_NOTIFY_URL
    ) {
      throw new Error(
        'PAYMENT_PROVIDERS includes wxpay but required env vars are missing: WXPAY_APP_ID, WXPAY_MCH_ID, WXPAY_PRIVATE_KEY, WXPAY_API_V3_KEY, WXPAY_PUBLIC_KEY, WXPAY_PUBLIC_KEY_ID, WXPAY_CERT_SERIAL, WXPAY_NOTIFY_URL',
      );
    }
    paymentRegistry.register(new WxpayProvider());
  }

  if (providers.includes('stripe')) {
    if (!env.STRIPE_SECRET_KEY) {
      throw new Error('PAYMENT_PROVIDERS 含 stripe，但缺少 STRIPE_SECRET_KEY');
    }
    paymentRegistry.register(new StripeProvider());
  }

  initialized = true;
}

// 注入 lazy init：Registry 方法会自动调用 initPaymentProviders()
paymentRegistry.setInitializer(initPaymentProviders);
