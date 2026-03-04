import { z } from 'zod';

const optionalTrimmedString = z.preprocess((value) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}, z.string().optional());

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),

  SUB2API_BASE_URL: z.string().url(),
  SUB2API_ADMIN_API_KEY: z.string().min(1),

  // ── 支付服务商（显式声明启用哪些服务商，逗号分隔：easypay, stripe） ──
  PAYMENT_PROVIDERS: z
    .string()
    .default('')
    .transform((v) => v.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)),

  // ── Easy-Pay（PAYMENT_PROVIDERS 含 easypay 时必填） ──
  EASY_PAY_PID: optionalTrimmedString,
  EASY_PAY_PKEY: optionalTrimmedString,
  EASY_PAY_API_BASE: optionalTrimmedString,
  EASY_PAY_NOTIFY_URL: optionalTrimmedString,
  EASY_PAY_RETURN_URL: optionalTrimmedString,
  EASY_PAY_CID: optionalTrimmedString,
  EASY_PAY_CID_ALIPAY: optionalTrimmedString,
  EASY_PAY_CID_WXPAY: optionalTrimmedString,

  // ── 支付宝直连（PAYMENT_PROVIDERS 含 alipay 时必填） ──
  ALIPAY_APP_ID: optionalTrimmedString,
  ALIPAY_PRIVATE_KEY: optionalTrimmedString,
  ALIPAY_PUBLIC_KEY: optionalTrimmedString,
  ALIPAY_NOTIFY_URL: optionalTrimmedString,
  ALIPAY_RETURN_URL: optionalTrimmedString,

  // ── Stripe（PAYMENT_PROVIDERS 含 stripe 时必填） ──
  STRIPE_SECRET_KEY: optionalTrimmedString,
  STRIPE_PUBLISHABLE_KEY: optionalTrimmedString,
  STRIPE_WEBHOOK_SECRET: optionalTrimmedString,

  // ── 启用的支付渠道（在已配置服务商支持的渠道中选择） ──
  // 易支付支持: alipay, wxpay；Stripe 支持: stripe
  ENABLED_PAYMENT_TYPES: z
    .string()
    .default('alipay,wxpay')
    .transform((v) => v.split(',').map((s) => s.trim())),

  ORDER_TIMEOUT_MINUTES: z.string().default('5').transform(Number).pipe(z.number().int().positive()),
  MIN_RECHARGE_AMOUNT: z.string().default('1').transform(Number).pipe(z.number().positive()),
  MAX_RECHARGE_AMOUNT: z.string().default('1000').transform(Number).pipe(z.number().positive()),
  // 每日每用户最大累计充值额，0 = 不限制
  MAX_DAILY_RECHARGE_AMOUNT: z.string().default('10000').transform(Number).pipe(z.number().min(0)),

  // 每日各渠道全平台总限额，可选覆盖（0 = 不限制）。
  // 未设置时由各 PaymentProvider.defaultLimits 提供默认值。
  MAX_DAILY_AMOUNT_ALIPAY: z.string().optional().transform((v) => (v !== undefined ? Number(v) : undefined)).pipe(z.number().min(0).optional()),
  MAX_DAILY_AMOUNT_WXPAY: z.string().optional().transform((v) => (v !== undefined ? Number(v) : undefined)).pipe(z.number().min(0).optional()),
  MAX_DAILY_AMOUNT_STRIPE: z.string().optional().transform((v) => (v !== undefined ? Number(v) : undefined)).pipe(z.number().min(0).optional()),
  PRODUCT_NAME: z.string().default('Sub2API Balance Recharge'),

  ADMIN_TOKEN: z.string().min(1),

  NEXT_PUBLIC_APP_URL: z.string().url(),
  PAY_HELP_IMAGE_URL: optionalTrimmedString,
  PAY_HELP_TEXT: optionalTrimmedString,
});

export type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | null = null;

export function getEnv(): Env {
  if (cachedEnv) return cachedEnv;

  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
    throw new Error('Invalid environment variables');
  }

  cachedEnv = parsed.data;
  return cachedEnv;
}
