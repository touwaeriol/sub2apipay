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

  EASY_PAY_PID: z.string().min(1),
  EASY_PAY_PKEY: z.string().min(1),
  EASY_PAY_API_BASE: z.string().url(),
  EASY_PAY_NOTIFY_URL: z.string().url(),
  EASY_PAY_RETURN_URL: z.string().url(),
  EASY_PAY_CID: optionalTrimmedString,
  EASY_PAY_CID_ALIPAY: optionalTrimmedString,
  EASY_PAY_CID_WXPAY: optionalTrimmedString,

  ENABLED_PAYMENT_TYPES: z.string().default('alipay,wxpay').transform(v => v.split(',').map(s => s.trim())),

  ORDER_TIMEOUT_MINUTES: z.string().default('5').transform(Number).pipe(z.number().int().positive()),
  MIN_RECHARGE_AMOUNT: z.string().default('1').transform(Number).pipe(z.number().positive()),
  MAX_RECHARGE_AMOUNT: z.string().default('10000').transform(Number).pipe(z.number().positive()),
  PRODUCT_NAME: z.string().default('Sub2API Balance Recharge'),

  ADMIN_TOKEN: z.string().min(1),

  NEXT_PUBLIC_APP_URL: z.string().url(),
  NEXT_PUBLIC_PAY_HELP_IMAGE_URL: optionalTrimmedString,
  NEXT_PUBLIC_PAY_HELP_TEXT: optionalTrimmedString,
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
