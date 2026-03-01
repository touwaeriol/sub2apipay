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
  paymentRegistry.register(new EasyPayProvider());

  const env = getEnv();
  if (env.STRIPE_SECRET_KEY) {
    paymentRegistry.register(new StripeProvider());
  }

  initialized = true;
}
