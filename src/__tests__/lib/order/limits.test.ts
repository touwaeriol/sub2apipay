import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  prisma: {
    order: { groupBy: vi.fn() },
  },
}));

vi.mock('@/lib/config', () => ({
  getEnv: vi.fn(),
}));

vi.mock('@/lib/payment', () => ({
  initPaymentProviders: vi.fn(),
  paymentRegistry: {
    getDefaultLimit: vi.fn(),
  },
}));

import { getEnv } from '@/lib/config';
import { paymentRegistry } from '@/lib/payment';
import { getMethodDailyLimit, getMethodSingleLimit } from '@/lib/order/limits';

const mockedGetEnv = vi.mocked(getEnv);
const mockedGetDefaultLimit = vi.mocked(paymentRegistry.getDefaultLimit);

beforeEach(() => {
  vi.clearAllMocks();
  // 默认：getEnv 返回无渠道限额字段，provider 无默认值
  mockedGetEnv.mockReturnValue({} as ReturnType<typeof getEnv>);
  mockedGetDefaultLimit.mockReturnValue(undefined as any);
});

describe('getMethodDailyLimit', () => {
  it('无环境变量且无 provider 默认值时返回 0', () => {
    expect(getMethodDailyLimit('alipay')).toBe(0);
  });

  it('从 getEnv 读取渠道每日限额', () => {
    mockedGetEnv.mockReturnValue({
      MAX_DAILY_AMOUNT_ALIPAY: 5000,
    } as any);
    expect(getMethodDailyLimit('alipay')).toBe(5000);
  });

  it('环境变量 0 表示不限制', () => {
    mockedGetEnv.mockReturnValue({
      MAX_DAILY_AMOUNT_WXPAY: 0,
    } as any);
    expect(getMethodDailyLimit('wxpay')).toBe(0);
  });

  it('getEnv 未设置时回退到 provider 默认值', () => {
    mockedGetEnv.mockReturnValue({} as any);
    mockedGetDefaultLimit.mockReturnValue({ dailyMax: 3000 } as any);
    expect(getMethodDailyLimit('stripe')).toBe(3000);
  });

  it('getEnv 设置时覆盖 provider 默认值', () => {
    mockedGetEnv.mockReturnValue({
      MAX_DAILY_AMOUNT_STRIPE: 8000,
    } as any);
    mockedGetDefaultLimit.mockReturnValue({ dailyMax: 3000 } as any);
    expect(getMethodDailyLimit('stripe')).toBe(8000);
  });

  it('paymentType 大小写不敏感（key 构造用 toUpperCase）', () => {
    mockedGetEnv.mockReturnValue({
      MAX_DAILY_AMOUNT_ALIPAY: 2000,
    } as any);
    expect(getMethodDailyLimit('alipay')).toBe(2000);
  });

  it('未知支付类型返回 0', () => {
    expect(getMethodDailyLimit('unknown_type')).toBe(0);
  });

  it('getEnv 无值且 provider 默认值也无 dailyMax 时回退 process.env', () => {
    mockedGetEnv.mockReturnValue({} as any);
    mockedGetDefaultLimit.mockReturnValue({} as any); // no dailyMax
    process.env['MAX_DAILY_AMOUNT_ALIPAY'] = '7777';
    try {
      expect(getMethodDailyLimit('alipay')).toBe(7777);
    } finally {
      delete process.env['MAX_DAILY_AMOUNT_ALIPAY'];
    }
  });
});

describe('getMethodSingleLimit', () => {
  it('无环境变量且无 provider 默认值时返回 0', () => {
    expect(getMethodSingleLimit('alipay')).toBe(0);
  });

  it('从 process.env 读取单笔限额', () => {
    process.env['MAX_SINGLE_AMOUNT_WXPAY'] = '500';
    try {
      expect(getMethodSingleLimit('wxpay')).toBe(500);
    } finally {
      delete process.env['MAX_SINGLE_AMOUNT_WXPAY'];
    }
  });

  it('process.env 设置 0 表示使用全局限额', () => {
    process.env['MAX_SINGLE_AMOUNT_STRIPE'] = '0';
    try {
      expect(getMethodSingleLimit('stripe')).toBe(0);
    } finally {
      delete process.env['MAX_SINGLE_AMOUNT_STRIPE'];
    }
  });

  it('process.env 未设置时回退到 provider 默认值', () => {
    mockedGetDefaultLimit.mockReturnValue({ singleMax: 200 } as any);
    expect(getMethodSingleLimit('alipay')).toBe(200);
  });

  it('process.env 设置时覆盖 provider 默认值', () => {
    process.env['MAX_SINGLE_AMOUNT_ALIPAY'] = '999';
    mockedGetDefaultLimit.mockReturnValue({ singleMax: 200 } as any);
    try {
      expect(getMethodSingleLimit('alipay')).toBe(999);
    } finally {
      delete process.env['MAX_SINGLE_AMOUNT_ALIPAY'];
    }
  });

  it('无效 process.env 值回退到 provider 默认值', () => {
    process.env['MAX_SINGLE_AMOUNT_ALIPAY'] = 'abc';
    mockedGetDefaultLimit.mockReturnValue({ singleMax: 150 } as any);
    try {
      expect(getMethodSingleLimit('alipay')).toBe(150);
    } finally {
      delete process.env['MAX_SINGLE_AMOUNT_ALIPAY'];
    }
  });

  it('未知支付类型返回 0', () => {
    expect(getMethodSingleLimit('unknown_type')).toBe(0);
  });
});
