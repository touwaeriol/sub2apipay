import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminToken, unauthorizedResponse } from '@/lib/admin-auth';
import { getEnv } from '@/lib/config';
import { ensureDBProviders, paymentRegistry } from '@/lib/payment';

// 所有支持的服务商及其渠道定义
const ALL_PROVIDERS = [
  { key: 'easypay', types: ['alipay', 'wxpay'] },
  { key: 'alipay', types: ['alipay_direct'] },
  { key: 'wxpay', types: ['wxpay_direct'] },
  { key: 'stripe', types: ['stripe'] },
];

function buildInstanceConfig(env: ReturnType<typeof getEnv>, providerKey: string): Record<string, string> | null {
  switch (providerKey) {
    case 'easypay': {
      if (!env.EASY_PAY_PID || !env.EASY_PAY_PKEY) return null;
      const config: Record<string, string> = {
        pid: env.EASY_PAY_PID,
        pkey: env.EASY_PAY_PKEY,
      };
      if (env.EASY_PAY_API_BASE) config.apiBase = env.EASY_PAY_API_BASE;
      if (env.EASY_PAY_NOTIFY_URL) config.notifyUrl = env.EASY_PAY_NOTIFY_URL;
      if (env.EASY_PAY_RETURN_URL) config.returnUrl = env.EASY_PAY_RETURN_URL;
      if (env.EASY_PAY_CID_ALIPAY) config.cidAlipay = env.EASY_PAY_CID_ALIPAY;
      if (env.EASY_PAY_CID_WXPAY) config.cidWxpay = env.EASY_PAY_CID_WXPAY;
      return config;
    }
    case 'alipay': {
      if (!env.ALIPAY_APP_ID || !env.ALIPAY_PRIVATE_KEY) return null;
      const config: Record<string, string> = {
        appId: env.ALIPAY_APP_ID,
        privateKey: env.ALIPAY_PRIVATE_KEY,
      };
      if (env.ALIPAY_PUBLIC_KEY) config.publicKey = env.ALIPAY_PUBLIC_KEY;
      if (env.ALIPAY_NOTIFY_URL) config.notifyUrl = env.ALIPAY_NOTIFY_URL;
      if (env.ALIPAY_RETURN_URL) config.returnUrl = env.ALIPAY_RETURN_URL;
      return config;
    }
    case 'wxpay': {
      if (!env.WXPAY_APP_ID || !env.WXPAY_MCH_ID || !env.WXPAY_PRIVATE_KEY) return null;
      const config: Record<string, string> = {
        appId: env.WXPAY_APP_ID,
        mchId: env.WXPAY_MCH_ID,
        privateKey: env.WXPAY_PRIVATE_KEY,
      };
      if (env.WXPAY_API_V3_KEY) config.apiV3Key = env.WXPAY_API_V3_KEY;
      if (env.WXPAY_PUBLIC_KEY) config.publicKey = env.WXPAY_PUBLIC_KEY;
      if (env.WXPAY_PUBLIC_KEY_ID) config.publicKeyId = env.WXPAY_PUBLIC_KEY_ID;
      if (env.WXPAY_CERT_SERIAL) config.certSerial = env.WXPAY_CERT_SERIAL;
      if (env.WXPAY_NOTIFY_URL) config.notifyUrl = env.WXPAY_NOTIFY_URL;
      return config;
    }
    case 'stripe': {
      if (!env.STRIPE_SECRET_KEY) return null;
      const config: Record<string, string> = {
        secretKey: env.STRIPE_SECRET_KEY,
      };
      if (env.STRIPE_PUBLISHABLE_KEY) config.publishableKey = env.STRIPE_PUBLISHABLE_KEY;
      if (env.STRIPE_WEBHOOK_SECRET) config.webhookSecret = env.STRIPE_WEBHOOK_SECRET;
      return config;
    }
    default:
      return null;
  }
}

const PROVIDER_NAMES: Record<string, string> = {
  easypay: 'EasyPay',
  alipay: 'Alipay Official',
  wxpay: 'WxPay Official',
  stripe: 'Stripe',
};

export async function GET(request: NextRequest) {
  if (!(await verifyAdminToken(request))) return unauthorizedResponse(request);

  try {
    const env = getEnv();
    await ensureDBProviders();
    const supportedTypes = paymentRegistry.getSupportedTypes();
    const configuredProviders = env.PAYMENT_PROVIDERS;

    // 构建服务商信息（包含是否已配置）
    const providers = ALL_PROVIDERS.map((p) => ({
      key: p.key,
      configured: configuredProviders.includes(p.key),
      types: p.types,
    }));

    // 构建服务商实例默认配置
    const instanceDefaults: Record<string, { name: string; config: Record<string, string>; supportedTypes: string }> =
      {};
    for (const p of ALL_PROVIDERS) {
      if (!configuredProviders.includes(p.key)) continue;
      const config = buildInstanceConfig(env, p.key);
      if (config) {
        instanceDefaults[p.key] = {
          name: PROVIDER_NAMES[p.key] || p.key,
          config,
          supportedTypes: p.types.join(','),
        };
      }
    }

    return NextResponse.json({
      availablePaymentTypes: supportedTypes,
      providers,
      instanceDefaults,
      defaults: {
        ENABLED_PAYMENT_TYPES: supportedTypes.join(','),
        RECHARGE_MIN_AMOUNT: String(env.MIN_RECHARGE_AMOUNT),
        RECHARGE_MAX_AMOUNT: String(env.MAX_RECHARGE_AMOUNT),
        DAILY_RECHARGE_LIMIT: String(env.MAX_DAILY_RECHARGE_AMOUNT),
        ORDER_TIMEOUT_MINUTES: String(env.ORDER_TIMEOUT_MINUTES),
        IFRAME_ALLOW_ORIGINS: process.env.IFRAME_ALLOW_ORIGINS ?? '',
        MAX_PENDING_ORDERS: '3',
      },
    });
  } catch (error) {
    console.error('Failed to get env defaults:', error instanceof Error ? error.message : String(error));
    return NextResponse.json({ error: 'Failed to get env defaults' }, { status: 500 });
  }
}
