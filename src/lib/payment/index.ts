import { paymentRegistry } from './registry';
import type { PaymentType } from './types';
import { EasyPayProvider } from '@/lib/easy-pay/provider';
import { StripeProvider } from '@/lib/stripe/provider';
import { AlipayProvider } from '@/lib/alipay/provider';
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
    if (!env.ALIPAY_APP_ID || !env.ALIPAY_PRIVATE_KEY) {
      throw new Error('PAYMENT_PROVIDERS 含 alipay，但缺少 ALIPAY_APP_ID 或 ALIPAY_PRIVATE_KEY');
    }
    paymentRegistry.register(new AlipayProvider());
  }

  if (providers.includes('stripe')) {
    if (!env.STRIPE_SECRET_KEY) {
      throw new Error('PAYMENT_PROVIDERS 含 stripe，但缺少 STRIPE_SECRET_KEY');
    }
    paymentRegistry.register(new StripeProvider());
  }

  // 校验 ENABLED_PAYMENT_TYPES 的每个渠道都有对应 provider 已注册
  const unsupported = env.ENABLED_PAYMENT_TYPES.filter((t) => !paymentRegistry.hasProvider(t as PaymentType));
  if (unsupported.length > 0) {
    throw new Error(
      `ENABLED_PAYMENT_TYPES 含 [${unsupported.join(', ')}]，但没有对应的 PAYMENT_PROVIDERS 注册。` +
      `请检查 PAYMENT_PROVIDERS 配置`,
    );
  }

  initialized = true;
}
