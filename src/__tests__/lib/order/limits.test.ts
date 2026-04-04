import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { MethodDefaultLimits } from '@/lib/payment/types';

// mock getSystemConfig：默认返回 undefined（无 DB 配置）
const mockGetSystemConfig = vi.fn<(key: string) => Promise<string | undefined>>().mockResolvedValue(undefined);
vi.mock('@/lib/system-config', () => ({
  getSystemConfig: (...args: unknown[]) => mockGetSystemConfig(...(args as [string])),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    order: { groupBy: vi.fn() },
  },
}));

vi.mock('@/lib/payment', () => ({
  initPaymentProviders: vi.fn(),
  ensureDBProviders: vi.fn().mockResolvedValue(undefined),
  paymentRegistry: {
    getDefaultLimit: vi.fn(),
  },
}));

import { paymentRegistry } from '@/lib/payment';
import { getMethodDailyLimit, getMethodSingleLimit } from '@/lib/order/limits';

const mockedGetDefaultLimit = vi.mocked(paymentRegistry.getDefaultLimit);

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSystemConfig.mockResolvedValue(undefined);
  mockedGetDefaultLimit.mockReturnValue(undefined);
});

describe('getMethodDailyLimit', () => {
  it('无配置且无 provider 默认值时返回 0', async () => {
    expect(await getMethodDailyLimit('alipay')).toBe(0);
  });

  it('从 getSystemConfig 读取渠道每日限额', async () => {
    mockGetSystemConfig.mockImplementation(async (key) => {
      if (key === 'MAX_DAILY_AMOUNT_ALIPAY') return '5000';
      return undefined;
    });
    expect(await getMethodDailyLimit('alipay')).toBe(5000);
  });

  it('getSystemConfig 返回 0 表示不限制', async () => {
    mockGetSystemConfig.mockImplementation(async (key) => {
      if (key === 'MAX_DAILY_AMOUNT_WXPAY') return '0';
      return undefined;
    });
    expect(await getMethodDailyLimit('wxpay')).toBe(0);
  });

  it('无显式配置时回退到 provider 默认值', async () => {
    mockedGetDefaultLimit.mockReturnValue({ dailyMax: 3000 } as MethodDefaultLimits);
    expect(await getMethodDailyLimit('stripe')).toBe(3000);
  });

  it('getSystemConfig 有值时覆盖 provider 默认值', async () => {
    mockGetSystemConfig.mockImplementation(async (key) => {
      if (key === 'MAX_DAILY_AMOUNT_STRIPE') return '8000';
      return undefined;
    });
    mockedGetDefaultLimit.mockReturnValue({ dailyMax: 3000 } as MethodDefaultLimits);
    expect(await getMethodDailyLimit('stripe')).toBe(8000);
  });

  it('OVERRIDE_ENV_ENABLED=true 时跳过 provider 默认值', async () => {
    mockGetSystemConfig.mockImplementation(async (key) => {
      if (key === 'OVERRIDE_ENV_ENABLED') return 'true';
      return undefined;
    });
    mockedGetDefaultLimit.mockReturnValue({ dailyMax: 10000 } as MethodDefaultLimits);
    expect(await getMethodDailyLimit('alipay')).toBe(0);
  });

  it('OVERRIDE_ENV_ENABLED=true 但有显式渠道配置时使用配置值', async () => {
    mockGetSystemConfig.mockImplementation(async (key) => {
      if (key === 'MAX_DAILY_AMOUNT_ALIPAY') return '20000';
      if (key === 'OVERRIDE_ENV_ENABLED') return 'true';
      return undefined;
    });
    mockedGetDefaultLimit.mockReturnValue({ dailyMax: 10000 } as MethodDefaultLimits);
    expect(await getMethodDailyLimit('alipay')).toBe(20000);
  });

  it('paymentType 大小写不敏感（key 构造用 toUpperCase）', async () => {
    mockGetSystemConfig.mockImplementation(async (key) => {
      if (key === 'MAX_DAILY_AMOUNT_ALIPAY') return '2000';
      return undefined;
    });
    expect(await getMethodDailyLimit('alipay')).toBe(2000);
  });

  it('未知支付类型返回 0', async () => {
    expect(await getMethodDailyLimit('unknown_type')).toBe(0);
  });
});

describe('getMethodSingleLimit', () => {
  it('无配置且无 provider 默认值时返回 0', async () => {
    expect(await getMethodSingleLimit('alipay')).toBe(0);
  });

  it('从 getSystemConfig 读取单笔限额', async () => {
    mockGetSystemConfig.mockImplementation(async (key) => {
      if (key === 'MAX_SINGLE_AMOUNT_WXPAY') return '500';
      return undefined;
    });
    expect(await getMethodSingleLimit('wxpay')).toBe(500);
  });

  it('getSystemConfig 返回 0 表示使用全局限额', async () => {
    mockGetSystemConfig.mockImplementation(async (key) => {
      if (key === 'MAX_SINGLE_AMOUNT_STRIPE') return '0';
      return undefined;
    });
    expect(await getMethodSingleLimit('stripe')).toBe(0);
  });

  it('无显式配置时回退到 provider 默认值', async () => {
    mockedGetDefaultLimit.mockReturnValue({ singleMax: 200 } as MethodDefaultLimits);
    expect(await getMethodSingleLimit('alipay')).toBe(200);
  });

  it('getSystemConfig 有值时覆盖 provider 默认值', async () => {
    mockGetSystemConfig.mockImplementation(async (key) => {
      if (key === 'MAX_SINGLE_AMOUNT_ALIPAY') return '999';
      return undefined;
    });
    mockedGetDefaultLimit.mockReturnValue({ singleMax: 200 } as MethodDefaultLimits);
    expect(await getMethodSingleLimit('alipay')).toBe(999);
  });

  it('无效配置值回退到 provider 默认值', async () => {
    mockGetSystemConfig.mockImplementation(async (key) => {
      if (key === 'MAX_SINGLE_AMOUNT_ALIPAY') return 'abc';
      return undefined;
    });
    mockedGetDefaultLimit.mockReturnValue({ singleMax: 150 } as MethodDefaultLimits);
    expect(await getMethodSingleLimit('alipay')).toBe(150);
  });

  it('OVERRIDE_ENV_ENABLED=true 时跳过 provider 默认值', async () => {
    mockGetSystemConfig.mockImplementation(async (key) => {
      if (key === 'OVERRIDE_ENV_ENABLED') return 'true';
      return undefined;
    });
    mockedGetDefaultLimit.mockReturnValue({ singleMax: 1000 } as MethodDefaultLimits);
    expect(await getMethodSingleLimit('alipay')).toBe(0);
  });

  it('未知支付类型返回 0', async () => {
    expect(await getMethodSingleLimit('unknown_type')).toBe(0);
  });
});
