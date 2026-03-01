import { paymentRegistry } from './registry';
import { EasyPayProvider } from '@/lib/easy-pay/provider';
import { StripeProvider } from '@/lib/stripe/provider';
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

  if (providers.includes('stripe')) {
    if (!env.STRIPE_SECRET_KEY) {
      throw new Error('PAYMENT_PROVIDERS 含 stripe，但缺少 STRIPE_SECRET_KEY');
    }
    paymentRegistry.register(new StripeProvider());
  }

  initialized = true;
}
