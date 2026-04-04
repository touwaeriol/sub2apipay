import { paymentRegistry } from './registry';
import type { PaymentType } from './types';
import { EasyPayProvider } from '@/lib/easy-pay/provider';
import { StripeProvider } from '@/lib/stripe/provider';
import { AlipayProvider } from '@/lib/alipay/provider';
import { WxpayProvider } from '@/lib/wxpay/provider';
import { getEnv } from '@/lib/config';
import { getSystemConfig } from '@/lib/system-config';
import { prisma } from '@/lib/db';
import { decrypt } from '@/lib/crypto';

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
const registeredKeys = new Set<string>();

type Env = ReturnType<typeof getEnv>;

function registerFromList(providers: string[], env: Env, strict: boolean): void {
  if (providers.includes('easypay') && !registeredKeys.has('easypay')) {
    if (!env.EASY_PAY_PID || !env.EASY_PAY_PKEY) {
      if (strict) throw new Error('PAYMENT_PROVIDERS 含 easypay，但缺少 EASY_PAY_PID 或 EASY_PAY_PKEY');
      console.warn('[payment] easypay enabled in DB but EASY_PAY_PID/EASY_PAY_PKEY not set, skipping');
    } else {
      paymentRegistry.register(new EasyPayProvider());
      registeredKeys.add('easypay');
    }
  }

  if (providers.includes('alipay') && !registeredKeys.has('alipay')) {
    if (!env.ALIPAY_APP_ID || !env.ALIPAY_PRIVATE_KEY || !env.ALIPAY_NOTIFY_URL) {
      if (strict)
        throw new Error(
          'PAYMENT_PROVIDERS includes alipay but required env vars are missing: ALIPAY_APP_ID, ALIPAY_PRIVATE_KEY, ALIPAY_NOTIFY_URL',
        );
      console.warn('[payment] alipay enabled in DB but required env vars not set, skipping');
    } else {
      paymentRegistry.register(new AlipayProvider());
      registeredKeys.add('alipay');
    }
  }

  if (providers.includes('wxpay') && !registeredKeys.has('wxpay')) {
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
      if (strict)
        throw new Error(
          'PAYMENT_PROVIDERS includes wxpay but required env vars are missing: WXPAY_APP_ID, WXPAY_MCH_ID, WXPAY_PRIVATE_KEY, WXPAY_API_V3_KEY, WXPAY_PUBLIC_KEY, WXPAY_PUBLIC_KEY_ID, WXPAY_CERT_SERIAL, WXPAY_NOTIFY_URL',
        );
      console.warn('[payment] wxpay enabled in DB but required env vars not set, skipping');
    } else {
      paymentRegistry.register(new WxpayProvider());
      registeredKeys.add('wxpay');
    }
  }

  if (providers.includes('stripe') && !registeredKeys.has('stripe')) {
    if (!env.STRIPE_SECRET_KEY) {
      if (strict) throw new Error('PAYMENT_PROVIDERS 含 stripe，但缺少 STRIPE_SECRET_KEY');
      console.warn('[payment] stripe enabled in DB but STRIPE_SECRET_KEY not set, skipping');
    } else {
      paymentRegistry.register(new StripeProvider());
      registeredKeys.add('stripe');
    }
  }
}

export function initPaymentProviders(): void {
  if (initialized) return;
  const env = getEnv();
  registerFromList(env.PAYMENT_PROVIDERS, env, true);
  initialized = true;
}

/**
 * 异步初始化：当数据库覆盖模式开启时，根据 ENABLED_PROVIDERS 补注册 provider。
 * 对于有活跃实例且实例配置中包含密钥的 provider，即使没有环境变量也能注册。
 * 在所有使用 paymentRegistry 的异步入口调用。
 */
export async function ensureDBProviders(): Promise<void> {
  initPaymentProviders();

  const overrideEnabled = await getSystemConfig('OVERRIDE_ENV_ENABLED');
  if (overrideEnabled !== 'true') return;

  const enabledProvidersRaw = await getSystemConfig('ENABLED_PROVIDERS');
  if (!enabledProvidersRaw) return;

  const dbProviders = enabledProvidersRaw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  const env = getEnv();

  // 先用环境变量注册能注册的
  registerFromList(dbProviders, env, false);

  // 对于环境变量缺失但有活跃实例的 provider，从实例配置注册
  for (const key of dbProviders) {
    if (registeredKeys.has(key)) continue;

    const instance = await prisma.paymentProviderInstance.findFirst({
      where: { providerKey: key, enabled: true },
      select: { id: true, config: true },
    });
    if (!instance) continue;

    let config: Record<string, string>;
    try {
      config = JSON.parse(decrypt(instance.config));
    } catch {
      console.warn(`[payment] Failed to decrypt config for ${key} instance ${instance.id}, skipping`);
      continue;
    }

    switch (key) {
      case 'stripe':
        if (config.secretKey) {
          paymentRegistry.register(new StripeProvider(instance.id, config));
          registeredKeys.add(key);
        } else {
          console.warn(`[payment] stripe instance ${instance.id} has no secretKey, skipping`);
        }
        break;
      case 'easypay':
        if (config.pid && config.pkey) {
          paymentRegistry.register(new EasyPayProvider(instance.id, config));
          registeredKeys.add(key);
        }
        break;
    }
  }
}

// 注入 lazy init：Registry 方法会自动调用 initPaymentProviders()（同步回退）
paymentRegistry.setInitializer(initPaymentProviders);
