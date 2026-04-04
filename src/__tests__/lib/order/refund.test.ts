import { vi, describe, it, expect, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';
import { ORDER_STATUS } from '@/lib/constants';

// ── mock 外部依赖 ──

const mockOrderFindUnique = vi.fn();
const mockOrderUpdateMany = vi.fn();
const mockOrderUpdate = vi.fn();
const mockAuditLogCreate = vi.fn();

vi.mock('@/lib/db', () => ({
  prisma: {
    order: {
      findUnique: (...args: unknown[]) => mockOrderFindUnique(...args),
      updateMany: (...args: unknown[]) => mockOrderUpdateMany(...args),
      update: (...args: unknown[]) => mockOrderUpdate(...args),
    },
    auditLog: {
      create: (...args: unknown[]) => mockAuditLogCreate(...args),
    },
  },
}));

const mockGetUser = vi.fn();
const mockSubtractBalance = vi.fn();
const mockAddBalance = vi.fn();
const mockGetUserSubscriptions = vi.fn();
const mockExtendSubscription = vi.fn();

vi.mock('@/lib/sub2api/client', () => ({
  getUser: (...args: unknown[]) => mockGetUser(...args),
  subtractBalance: (...args: unknown[]) => mockSubtractBalance(...args),
  addBalance: (...args: unknown[]) => mockAddBalance(...args),
  getUserSubscriptions: (...args: unknown[]) => mockGetUserSubscriptions(...args),
  extendSubscription: (...args: unknown[]) => mockExtendSubscription(...args),
}));

const mockProviderRefund = vi.fn();
const mockGetProvider = vi.fn().mockReturnValue({ refund: mockProviderRefund });

vi.mock('@/lib/payment', () => ({
  initPaymentProviders: vi.fn(),
  ensureDBProviders: vi.fn().mockResolvedValue(undefined),
  paymentRegistry: {
    getProvider: (...args: unknown[]) => mockGetProvider(...args),
  },
}));

const mockGetInstanceConfig = vi.fn().mockResolvedValue(null);

vi.mock('@/lib/payment/load-balancer', () => ({
  getInstanceConfig: (...args: unknown[]) => mockGetInstanceConfig(...args),
}));

const mockEasyPayProviderRefund = vi.fn().mockResolvedValue({ success: true });

vi.mock('@/lib/easy-pay/provider', () => {
  return {
    EasyPayProvider: class MockEasyPayProvider {
      refund(...args: unknown[]) {
        return mockEasyPayProviderRefund(...args);
      }
    },
  };
});

vi.mock('@/lib/config', () => ({
  getEnv: () => ({
    ADMIN_TOKEN: 'test-admin-token',
  }),
}));

const mockPickLocaleText = vi.fn<(locale: string, zh: string, en: string) => string>(
  (_locale: string, zh: string, _en: string) => zh,
);

vi.mock('@/lib/locale', () => ({
  pickLocaleText: (...args: unknown[]) => mockPickLocaleText(...(args as [string, string, string])),
}));

vi.mock('@/lib/system-config', () => ({
  getSystemConfig: vi.fn(),
  getSystemConfigs: vi.fn(),
}));

import { processRefund, OrderError } from '@/lib/order/service';

// ── 辅助工厂函数 ──

function makeOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'order-001',
    userId: 42,
    amount: new Prisma.Decimal('100.00'),
    payAmount: new Prisma.Decimal('103.00'),
    status: ORDER_STATUS.COMPLETED,
    orderType: 'balance',
    paymentType: 'alipay',
    paymentTradeNo: 'trade-001',
    providerInstanceId: null,
    subscriptionGroupId: null,
    subscriptionDays: null,
    ...overrides,
  };
}

function makeSubscriptionOrder(overrides: Record<string, unknown> = {}) {
  return makeOrder({
    orderType: 'subscription',
    subscriptionGroupId: 10,
    subscriptionDays: 30,
    paymentTradeNo: 'trade-sub-001',
    ...overrides,
  });
}

// ── 测试 ──

describe('processRefund', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 默认 pickLocaleText 返回中文
    mockPickLocaleText.mockImplementation((_locale: string, zh: string) => zh);
    // 默认 CAS 锁成功
    mockOrderUpdateMany.mockResolvedValue({ count: 1 });
    // 默认 order update 成功
    mockOrderUpdate.mockResolvedValue({});
    // 默认 audit log 成功
    mockAuditLogCreate.mockResolvedValue({});
    // 默认网关退款成功
    mockProviderRefund.mockResolvedValue({ success: true });
    // 默认 subtractBalance 成功
    mockSubtractBalance.mockResolvedValue(undefined);
    // 默认 addBalance 成功
    mockAddBalance.mockResolvedValue(undefined);
    // 默认 extendSubscription 成功
    mockExtendSubscription.mockResolvedValue(undefined);
    // 默认 EasyPayProvider 退款成功
    mockEasyPayProviderRefund.mockResolvedValue({ success: true });
  });

  // ── 1. 订单不存在 → 抛出 NOT_FOUND ──
  it('订单不存在时抛出 NOT_FOUND', async () => {
    mockOrderFindUnique.mockResolvedValue(null);

    await expect(processRefund({ orderId: 'nonexistent' })).rejects.toThrow(OrderError);

    try {
      await processRefund({ orderId: 'nonexistent' });
    } catch (e) {
      expect(e).toBeInstanceOf(OrderError);
      expect((e as OrderError).code).toBe('NOT_FOUND');
      expect((e as OrderError).statusCode).toBe(404);
    }
  });

  // ── 2. 订单状态非 COMPLETED → 抛出 INVALID_STATUS ──
  it.each([
    ORDER_STATUS.PENDING,
    ORDER_STATUS.PAID,
    ORDER_STATUS.RECHARGING,
    ORDER_STATUS.EXPIRED,
    ORDER_STATUS.CANCELLED,
    ORDER_STATUS.FAILED,
    ORDER_STATUS.REFUNDING,
    ORDER_STATUS.REFUNDED,
  ])('订单状态为 %s 时抛出 INVALID_STATUS', async (status) => {
    mockOrderFindUnique.mockResolvedValue(makeOrder({ status }));

    try {
      await processRefund({ orderId: 'order-001' });
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(OrderError);
      expect((e as OrderError).code).toBe('INVALID_STATUS');
      expect((e as OrderError).statusCode).toBe(400);
    }
  });

  // ── 2b. REFUND_FAILED 状态允许重试退款 ──
  it('REFUND_FAILED 状态允许重试退款', async () => {
    const order = makeOrder({ status: ORDER_STATUS.REFUND_FAILED });
    mockOrderFindUnique.mockResolvedValue(order);
    mockGetUser.mockResolvedValue({ id: 42, balance: 200, status: 'active' });

    const result = await processRefund({ orderId: 'order-001' });
    expect(result.success).toBe(true);
    expect(mockOrderUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { in: [ORDER_STATUS.COMPLETED, ORDER_STATUS.REFUND_REQUESTED, ORDER_STATUS.REFUND_FAILED] },
        }),
      }),
    );
  });

  // ── 3. 余额订单 + deductBalance=true + 余额充足 → 扣全额 ──
  it('余额订单 + deductBalance=true + 余额充足 → 扣全额，退款成功', async () => {
    const order = makeOrder();
    mockOrderFindUnique.mockResolvedValue(order);
    mockGetUser.mockResolvedValue({ id: 42, balance: 200, status: 'active' });

    const result = await processRefund({ orderId: 'order-001', deductBalance: true });

    expect(result.success).toBe(true);
    expect(result.balanceDeducted).toBe(100); // rechargeAmount = 100
    expect(mockSubtractBalance).toHaveBeenCalledWith(
      42,
      100,
      expect.stringContaining('refund'),
      expect.stringContaining('refund'),
    );
    // 确认网关退款被调用
    expect(mockProviderRefund).toHaveBeenCalled();
    // 确认订单状态更新为 REFUNDED
    expect(mockOrderUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'order-001' },
        data: expect.objectContaining({ status: ORDER_STATUS.REFUNDED }),
      }),
    );
  });

  // ── 4. 余额订单 + deductBalance=true + 余额不足 → 扣到 0 ──
  it('余额订单 + deductBalance=true + 余额不足 → 扣到 0（部分扣减）', async () => {
    const order = makeOrder();
    mockOrderFindUnique.mockResolvedValue(order);
    mockGetUser.mockResolvedValue({ id: 42, balance: 30, status: 'active' });

    const result = await processRefund({ orderId: 'order-001', deductBalance: true });

    expect(result.success).toBe(true);
    expect(result.balanceDeducted).toBe(30); // min(100, 30) = 30
    expect(mockSubtractBalance).toHaveBeenCalledWith(
      42,
      30,
      expect.stringContaining('refund'),
      expect.stringContaining('refund'),
    );
  });

  // ── 5. 余额订单 + deductBalance=false → 不扣余额 ──
  it('余额订单 + deductBalance=false → 不扣余额，直接退款成功', async () => {
    const order = makeOrder();
    mockOrderFindUnique.mockResolvedValue(order);

    const result = await processRefund({ orderId: 'order-001', deductBalance: false });

    expect(result.success).toBe(true);
    expect(result.balanceDeducted).toBe(0);
    expect(mockGetUser).not.toHaveBeenCalled();
    expect(mockSubtractBalance).not.toHaveBeenCalled();
  });

  // ── 6. 余额订单 + 获取余额失败 + force=false → 返回 requireForce ──
  it('余额订单 + 获取余额失败 + force=false → 返回 requireForce', async () => {
    const order = makeOrder();
    mockOrderFindUnique.mockResolvedValue(order);
    mockGetUser.mockRejectedValue(new Error('network error'));

    const result = await processRefund({ orderId: 'order-001', deductBalance: true, force: false });

    expect(result.success).toBe(false);
    expect(result.requireForce).toBe(true);
    expect(result.warning).toBeTruthy();
    // 不应执行 CAS 锁
    expect(mockOrderUpdateMany).not.toHaveBeenCalled();
  });

  // ── 7. 余额订单 + 获取余额失败 + force=true → 继续退款 ──
  it('余额订单 + 获取余额失败 + force=true → 继续退款', async () => {
    const order = makeOrder();
    mockOrderFindUnique.mockResolvedValue(order);
    mockGetUser.mockRejectedValue(new Error('network error'));

    const result = await processRefund({ orderId: 'order-001', deductBalance: true, force: true });

    expect(result.success).toBe(true);
    // 余额扣减为 0（因为无法获取余额）
    expect(result.balanceDeducted).toBe(0);
    expect(mockSubtractBalance).not.toHaveBeenCalled();
    // 但网关退款仍然执行
    expect(mockProviderRefund).toHaveBeenCalled();
  });

  // ── 8. 订阅订单 + deductBalance=true → 扣减订阅天数 ──
  it('订阅订单 + deductBalance=true → 扣减订阅天数', async () => {
    const order = makeSubscriptionOrder();
    mockOrderFindUnique.mockResolvedValue(order);
    // 用户有一个 group_id=10 的活跃订阅，剩余 60 天
    const expiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();
    mockGetUserSubscriptions.mockResolvedValue([{ id: 101, group_id: 10, status: 'active', expires_at: expiresAt }]);

    const result = await processRefund({ orderId: 'order-001', deductBalance: true });

    expect(result.success).toBe(true);
    expect(result.subscriptionDaysDeducted).toBe(30); // min(30, 60) = 30
    expect(mockExtendSubscription).toHaveBeenCalledWith(101, -30, expect.any(String));
  });

  // ── 9. 订阅订单 + deductBalance=true + 剩余天数不足 → 扣到 0 ──
  it('订阅订单 + deductBalance=true + 剩余天数不足 → 扣到 0', async () => {
    const order = makeSubscriptionOrder();
    mockOrderFindUnique.mockResolvedValue(order);
    // 仅剩 10 天
    const expiresAt = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();
    mockGetUserSubscriptions.mockResolvedValue([{ id: 101, group_id: 10, status: 'active', expires_at: expiresAt }]);

    const result = await processRefund({ orderId: 'order-001', deductBalance: true });

    expect(result.success).toBe(true);
    expect(result.subscriptionDaysDeducted).toBe(10); // min(30, 10) = 10
    expect(mockExtendSubscription).toHaveBeenCalledWith(101, -10, expect.any(String));
  });

  // ── 10. 订阅订单 + deductBalance=false → 不扣订阅天数 ──
  it('订阅订单 + deductBalance=false → 不扣订阅天数', async () => {
    const order = makeSubscriptionOrder();
    mockOrderFindUnique.mockResolvedValue(order);

    const result = await processRefund({ orderId: 'order-001', deductBalance: false });

    expect(result.success).toBe(true);
    expect(result.subscriptionDaysDeducted).toBe(0);
    expect(mockGetUserSubscriptions).not.toHaveBeenCalled();
    expect(mockExtendSubscription).not.toHaveBeenCalled();
  });

  // ── 11. 并发冲突（CAS 锁失败）→ 抛出 CONFLICT ──
  it('CAS 锁失败时抛出 CONFLICT', async () => {
    const order = makeOrder();
    mockOrderFindUnique.mockResolvedValue(order);
    mockGetUser.mockResolvedValue({ id: 42, balance: 200, status: 'active' });
    mockOrderUpdateMany.mockResolvedValue({ count: 0 });

    try {
      await processRefund({ orderId: 'order-001' });
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(OrderError);
      expect((e as OrderError).code).toBe('CONFLICT');
      expect((e as OrderError).statusCode).toBe(409);
    }
  });

  // ── 12. 网关退款失败 + 回滚成功 → 返回 { success: false } 并恢复 COMPLETED ──
  it('网关退款失败 + 余额回滚成功 → 返回失败结果，恢复 COMPLETED 并记录 REFUND_GATEWAY_FAILED', async () => {
    const order = makeOrder();
    mockOrderFindUnique.mockResolvedValue(order);
    mockGetUser.mockResolvedValue({ id: 42, balance: 200, status: 'active' });
    mockProviderRefund.mockRejectedValue(new Error('gateway timeout'));

    const result = await processRefund({ orderId: 'order-001' });

    // 不再 throw，而是返回结构化失败结果
    expect(result.success).toBe(false);
    expect(result.warning).toContain('gateway timeout');

    // 余额被扣减后应回滚
    expect(mockSubtractBalance).toHaveBeenCalled();
    expect(mockAddBalance).toHaveBeenCalledWith(
      42,
      100,
      expect.stringContaining('rollback'),
      expect.stringContaining('refund-rollback'),
    );

    // 回滚成功后恢复 COMPLETED
    expect(mockOrderUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: ORDER_STATUS.COMPLETED }),
      }),
    );

    // 记录 REFUND_GATEWAY_FAILED 审计日志
    expect(mockAuditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'REFUND_GATEWAY_FAILED' }),
      }),
    );

    // 不应覆盖为 REFUND_FAILED
    const refundFailedCalls = mockOrderUpdate.mock.calls.filter(
      (call: unknown[]) =>
        ((call as unknown[])[0] as { data: { status?: string } }).data.status === ORDER_STATUS.REFUND_FAILED,
    );
    expect(refundFailedCalls).toHaveLength(0);
  });

  it('网关退款失败 + 订阅回滚成功 → 返回失败结果，恢复 COMPLETED 并记录 REFUND_GATEWAY_FAILED', async () => {
    const order = makeSubscriptionOrder();
    mockOrderFindUnique.mockResolvedValue(order);
    const expiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();
    mockGetUserSubscriptions.mockResolvedValue([{ id: 101, group_id: 10, status: 'active', expires_at: expiresAt }]);
    mockProviderRefund.mockRejectedValue(new Error('gateway error'));

    const result = await processRefund({ orderId: 'order-001' });

    expect(result.success).toBe(false);
    expect(result.warning).toContain('gateway error');

    // 先扣减
    expect(mockExtendSubscription).toHaveBeenCalledWith(101, -30, expect.any(String));
    // 后回滚（正数恢复）
    expect(mockExtendSubscription).toHaveBeenCalledWith(101, 30, expect.any(String));

    // 回滚成功后恢复 COMPLETED
    expect(mockOrderUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: ORDER_STATUS.COMPLETED }),
      }),
    );

    // 记录 REFUND_GATEWAY_FAILED 审计日志
    expect(mockAuditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'REFUND_GATEWAY_FAILED' }),
      }),
    );

    // 不应覆盖为 REFUND_FAILED
    const refundFailedCalls = mockOrderUpdate.mock.calls.filter(
      (call: unknown[]) =>
        ((call as unknown[])[0] as { data: { status?: string } }).data.status === ORDER_STATUS.REFUND_FAILED,
    );
    expect(refundFailedCalls).toHaveLength(0);
  });

  // ── 13. 网关退款失败 + 回滚也失败 → 记录 REFUND_ROLLBACK_FAILED ──
  it('网关退款失败 + 余额回滚也失败 → 订单标记为 REFUND_FAILED 并记录 REFUND_ROLLBACK_FAILED', async () => {
    const order = makeOrder();
    mockOrderFindUnique.mockResolvedValue(order);
    mockGetUser.mockResolvedValue({ id: 42, balance: 200, status: 'active' });
    mockProviderRefund.mockRejectedValue(new Error('gateway down'));
    mockAddBalance.mockRejectedValue(new Error('balance api down'));

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      await processRefund({ orderId: 'order-001' });
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(OrderError);
      expect((e as OrderError).code).toBe('REFUND_FAILED');
      expect((e as OrderError).message).toContain('gateway down');
    }

    // 标记 REFUND_FAILED
    expect(mockOrderUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: ORDER_STATUS.REFUND_FAILED }),
      }),
    );

    // 不应设为 COMPLETED（回滚失败不恢复）
    const completedCalls = mockOrderUpdate.mock.calls.filter(
      (call: unknown[]) =>
        ((call as unknown[])[0] as { data: { status: string } }).data.status === ORDER_STATUS.COMPLETED,
    );
    expect(completedCalls).toHaveLength(0);

    // 应创建 REFUND_ROLLBACK_FAILED 审计日志
    expect(mockAuditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'REFUND_ROLLBACK_FAILED',
          detail: expect.stringContaining('gateway down'),
        }),
      }),
    );

    // detail 应包含回滚失败信息
    const rollbackCall = mockAuditLogCreate.mock.calls.find(
      (call: unknown[]) =>
        ((call as unknown[])[0] as { data: { action: string } }).data.action === 'REFUND_ROLLBACK_FAILED',
    );
    expect(rollbackCall).toBeTruthy();
    const detail = JSON.parse((rollbackCall![0] as { data: { detail: string } }).data.detail);
    expect(detail.balanceDeducted).toBe(100);
    expect(detail.needsBalanceCompensation).toBe(true);
    expect(detail.rollbackError).toContain('balance api down');

    // 应记录 REFUND_FAILED 审计日志
    expect(mockAuditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'REFUND_FAILED' }),
      }),
    );

    consoleErrorSpy.mockRestore();
  });

  it('网关退款失败 + 订阅回滚也失败 → 订单标记为 REFUND_FAILED 并记录 REFUND_ROLLBACK_FAILED', async () => {
    const order = makeSubscriptionOrder();
    mockOrderFindUnique.mockResolvedValue(order);
    const expiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();
    mockGetUserSubscriptions.mockResolvedValue([{ id: 101, group_id: 10, status: 'active', expires_at: expiresAt }]);
    mockProviderRefund.mockRejectedValue(new Error('gateway fail'));
    // 第一次 extendSubscription(-30) 成功，第二次 extendSubscription(30) 失败
    mockExtendSubscription
      .mockResolvedValueOnce(undefined) // 扣减成功
      .mockRejectedValueOnce(new Error('extend api down')); // 回滚失败

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      await processRefund({ orderId: 'order-001' });
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(OrderError);
      expect((e as OrderError).code).toBe('REFUND_FAILED');
      expect((e as OrderError).message).toContain('gateway fail');
    }

    // 标记 REFUND_FAILED
    expect(mockOrderUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: ORDER_STATUS.REFUND_FAILED }),
      }),
    );

    // 不应设为 COMPLETED（回滚失败不恢复）
    const completedCalls = mockOrderUpdate.mock.calls.filter(
      (call: unknown[]) =>
        ((call as unknown[])[0] as { data: { status: string } }).data.status === ORDER_STATUS.COMPLETED,
    );
    expect(completedCalls).toHaveLength(0);

    const rollbackCall = mockAuditLogCreate.mock.calls.find(
      (call: unknown[]) =>
        ((call as unknown[])[0] as { data: { action: string } }).data.action === 'REFUND_ROLLBACK_FAILED',
    );
    expect(rollbackCall).toBeTruthy();
    const detail = JSON.parse((rollbackCall![0] as { data: { detail: string } }).data.detail);
    expect(detail.subscriptionDaysDeducted).toBe(30);

    consoleErrorSpy.mockRestore();
  });

  // ── 14. 无 paymentTradeNo → 跳过网关退款 ──
  it('无 paymentTradeNo 的订单 → 跳过网关退款', async () => {
    const order = makeOrder({ paymentTradeNo: null });
    mockOrderFindUnique.mockResolvedValue(order);
    mockGetUser.mockResolvedValue({ id: 42, balance: 200, status: 'active' });

    const result = await processRefund({ orderId: 'order-001' });

    expect(result.success).toBe(true);
    expect(mockProviderRefund).not.toHaveBeenCalled();
    expect(mockGetProvider).not.toHaveBeenCalled();
    // 余额仍应扣减
    expect(mockSubtractBalance).toHaveBeenCalled();
  });

  // ── 15. 审计日志记录正确 ──
  it('退款成功时审计日志包含 deductBalance 和 balanceDeducted 字段', async () => {
    const order = makeOrder();
    mockOrderFindUnique.mockResolvedValue(order);
    mockGetUser.mockResolvedValue({ id: 42, balance: 200, status: 'active' });

    await processRefund({ orderId: 'order-001', reason: '测试退款', deductBalance: true });

    const successCall = mockAuditLogCreate.mock.calls.find(
      (call: unknown[]) => ((call as unknown[])[0] as { data: { action: string } }).data.action === 'REFUND_SUCCESS',
    );
    expect(successCall).toBeTruthy();
    const detail = JSON.parse((successCall![0] as { data: { detail: string } }).data.detail);
    expect(detail.deductBalance).toBe(true);
    expect(detail.balanceDeducted).toBe(100);
    expect(detail.subscriptionDaysDeducted).toBe(0);
    expect(detail.reason).toBe('测试退款');
    expect(detail.rechargeAmount).toBe(100);
    expect(detail.refundAmount).toBe(100); // rechargeAmount (default, no input.amount)
    expect(detail.gatewayRefundAmount).toBe(103); // payAmount
  });

  it('退款成功时审计日志包含订阅扣减天数', async () => {
    const order = makeSubscriptionOrder();
    mockOrderFindUnique.mockResolvedValue(order);
    const expiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();
    mockGetUserSubscriptions.mockResolvedValue([{ id: 101, group_id: 10, status: 'active', expires_at: expiresAt }]);

    await processRefund({ orderId: 'order-001', deductBalance: true });

    const successCall = mockAuditLogCreate.mock.calls.find(
      (call: unknown[]) => ((call as unknown[])[0] as { data: { action: string } }).data.action === 'REFUND_SUCCESS',
    );
    expect(successCall).toBeTruthy();
    const detail = JSON.parse((successCall![0] as { data: { detail: string } }).data.detail);
    expect(detail.subscriptionDaysDeducted).toBe(30);
    expect(detail.deductBalance).toBe(true);
  });

  // ── 额外边界测试 ──

  it('deductBalance 默认为 true', async () => {
    const order = makeOrder();
    mockOrderFindUnique.mockResolvedValue(order);
    mockGetUser.mockResolvedValue({ id: 42, balance: 200, status: 'active' });

    const result = await processRefund({ orderId: 'order-001' });

    expect(result.success).toBe(true);
    expect(result.balanceDeducted).toBe(100);
    expect(mockSubtractBalance).toHaveBeenCalled();
  });

  it('无 payAmount 时 refundAmount 回退到 amount', async () => {
    const order = makeOrder({ payAmount: null });
    mockOrderFindUnique.mockResolvedValue(order);
    mockGetUser.mockResolvedValue({ id: 42, balance: 200, status: 'active' });

    await processRefund({ orderId: 'order-001' });

    // 网关退款金额应为 amount（100）
    expect(mockProviderRefund).toHaveBeenCalledWith(expect.objectContaining({ amount: 100 }));
  });

  it('通过 providerInstanceId 查询实例配置', async () => {
    // 当 getInstanceConfig 返回 null 时，回退到 paymentRegistry
    const order = makeOrder({ providerInstanceId: 'inst-001' });
    mockOrderFindUnique.mockResolvedValue(order);
    mockGetUser.mockResolvedValue({ id: 42, balance: 200, status: 'active' });
    mockGetInstanceConfig.mockResolvedValue(null); // 实例配置不存在，回退到注册表

    const result = await processRefund({ orderId: 'order-001' });

    expect(result.success).toBe(true);
    expect(mockGetInstanceConfig).toHaveBeenCalledWith('inst-001');
    // 回退到 paymentRegistry.getProvider
    expect(mockGetProvider).toHaveBeenCalled();
  });

  it('余额为 0 时不调用 subtractBalance', async () => {
    const order = makeOrder();
    mockOrderFindUnique.mockResolvedValue(order);
    mockGetUser.mockResolvedValue({ id: 42, balance: 0, status: 'active' });

    const result = await processRefund({ orderId: 'order-001', deductBalance: true });

    expect(result.success).toBe(true);
    expect(result.balanceDeducted).toBe(0);
    expect(mockSubtractBalance).not.toHaveBeenCalled();
  });

  it('订阅订单无活跃订阅时不扣减天数', async () => {
    const order = makeSubscriptionOrder();
    mockOrderFindUnique.mockResolvedValue(order);
    // 没有活跃订阅（已过期）
    mockGetUserSubscriptions.mockResolvedValue([
      { id: 101, group_id: 10, status: 'expired', expires_at: '2020-01-01T00:00:00Z' },
    ]);

    const result = await processRefund({ orderId: 'order-001', deductBalance: true });

    expect(result.success).toBe(true);
    expect(result.subscriptionDaysDeducted).toBe(0);
    expect(mockExtendSubscription).not.toHaveBeenCalled();
  });

  it('订阅订单 + 获取订阅信息失败 + force=false → 返回 requireForce', async () => {
    const order = makeSubscriptionOrder();
    mockOrderFindUnique.mockResolvedValue(order);
    mockGetUserSubscriptions.mockRejectedValue(new Error('subscriptions api down'));

    const result = await processRefund({ orderId: 'order-001', deductBalance: true, force: false });

    expect(result.success).toBe(false);
    expect(result.requireForce).toBe(true);
    expect(mockExtendSubscription).not.toHaveBeenCalled();
  });

  it('订阅订单 + 获取订阅信息失败 + force=true → 跳过扣减，继续退款', async () => {
    const order = makeSubscriptionOrder();
    mockOrderFindUnique.mockResolvedValue(order);
    mockGetUserSubscriptions.mockRejectedValue(new Error('subscriptions api down'));

    const result = await processRefund({ orderId: 'order-001', deductBalance: true, force: true });

    expect(result.success).toBe(true);
    expect(result.subscriptionDaysDeducted).toBe(0);
    expect(mockExtendSubscription).not.toHaveBeenCalled();
  });

  it('locale=en 时错误消息为英文', async () => {
    mockOrderFindUnique.mockResolvedValue(null);

    // 切换 pickLocaleText 为返回英文
    mockPickLocaleText.mockImplementation((_locale: string, _zh: string, en: string) => en);

    try {
      await processRefund({ orderId: 'nonexistent', locale: 'en' });
      expect.unreachable('should have thrown');
    } catch (e) {
      expect((e as OrderError).message).toBe('Order not found');
    }

    // 恢复为返回中文
    mockPickLocaleText.mockImplementation((_locale: string, zh: string) => zh);
  });

  it('force 参数传递到订单更新', async () => {
    const order = makeOrder({ paymentTradeNo: null });
    mockOrderFindUnique.mockResolvedValue(order);
    mockGetUser.mockResolvedValue({ id: 42, balance: 200, status: 'active' });

    await processRefund({ orderId: 'order-001', force: true, deductBalance: true });

    expect(mockOrderUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ forceRefund: true }),
      }),
    );
  });

  it('deductBalance=false 时网关退款失败 → 返回失败结果，不需要回滚', async () => {
    const order = makeOrder();
    mockOrderFindUnique.mockResolvedValue(order);
    mockProviderRefund.mockRejectedValue(new Error('gateway fail'));

    const result = await processRefund({ orderId: 'order-001', deductBalance: false });

    expect(result.success).toBe(false);
    expect(result.warning).toContain('gateway fail');
    // 不应调用 addBalance 回滚
    expect(mockAddBalance).not.toHaveBeenCalled();
    expect(mockSubtractBalance).not.toHaveBeenCalled();
  });

  // ── 网关退款失败 + deductBalance=false → 无需回滚，恢复 COMPLETED ──
  it('网关退款失败 + deductBalance=false → 恢复 COMPLETED（无扣减，无需回滚）', async () => {
    const order = makeOrder();
    mockOrderFindUnique.mockResolvedValue(order);
    mockProviderRefund.mockRejectedValue(new Error('gateway fail'));

    const result = await processRefund({ orderId: 'order-001', deductBalance: false });

    expect(result.success).toBe(false);
    expect(result.warning).toContain('gateway fail');

    // 不扣减，不回滚
    expect(mockSubtractBalance).not.toHaveBeenCalled();
    expect(mockAddBalance).not.toHaveBeenCalled();

    // 恢复 COMPLETED
    expect(mockOrderUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: ORDER_STATUS.COMPLETED }),
      }),
    );

    // 记录 REFUND_GATEWAY_FAILED
    expect(mockAuditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'REFUND_GATEWAY_FAILED' }),
      }),
    );
  });

  // ── 无 paymentTradeNo 时记录 REFUND_NO_TRADE_NO 审计日志 ──
  it('无 paymentTradeNo 时记录 REFUND_NO_TRADE_NO 审计日志', async () => {
    const order = makeOrder({ paymentTradeNo: null });
    mockOrderFindUnique.mockResolvedValue(order);
    mockGetUser.mockResolvedValue({ id: 42, balance: 200, status: 'active' });

    const result = await processRefund({ orderId: 'order-001' });

    expect(result.success).toBe(true);
    // 应记录 REFUND_NO_TRADE_NO 审计日志
    expect(mockAuditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'REFUND_NO_TRADE_NO',
          detail: 'No paymentTradeNo, skipped gateway refund',
        }),
      }),
    );
    // 不应调用网关退款
    expect(mockProviderRefund).not.toHaveBeenCalled();
  });

  // ── 网关退款成功时不记录 REFUND_GATEWAY_FAILED ──
  it('网关退款成功时只记录 REFUND_SUCCESS，不记录 REFUND_GATEWAY_FAILED', async () => {
    const order = makeOrder();
    mockOrderFindUnique.mockResolvedValue(order);
    mockGetUser.mockResolvedValue({ id: 42, balance: 200, status: 'active' });

    await processRefund({ orderId: 'order-001' });

    // 应记录 REFUND_SUCCESS
    expect(mockAuditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'REFUND_SUCCESS' }),
      }),
    );
    // 不应记录 REFUND_GATEWAY_FAILED
    const gatewayFailedCall = mockAuditLogCreate.mock.calls.find(
      (call: unknown[]) =>
        ((call as unknown[])[0] as { data: { action: string } }).data.action === 'REFUND_GATEWAY_FAILED',
    );
    expect(gatewayFailedCall).toBeUndefined();
  });

  // ── 实例配置存在时使用 EasyPayProvider ──
  it('providerInstanceId 有实例配置时使用 EasyPayProvider', async () => {
    const order = makeOrder({ providerInstanceId: 'inst-002', paymentTradeNo: 'trade-002' });
    mockOrderFindUnique.mockResolvedValue(order);
    mockGetUser.mockResolvedValue({ id: 42, balance: 200, status: 'active' });
    mockGetInstanceConfig.mockResolvedValue({ pid: '123', key: 'abc', apiUrl: 'https://api.example.com' });

    const result = await processRefund({ orderId: 'order-001' });

    expect(result.success).toBe(true);
    expect(mockGetInstanceConfig).toHaveBeenCalledWith('inst-002');
    // 当 instConfig 存在时，不应回退到 paymentRegistry
    expect(mockGetProvider).not.toHaveBeenCalled();
  });

  // ── CAS 锁在 requireForce 返回前不应执行 ──
  it('余额获取失败 + force=false → 在 CAS 锁之前返回 requireForce', async () => {
    const order = makeOrder();
    mockOrderFindUnique.mockResolvedValue(order);
    mockGetUser.mockRejectedValue(new Error('api down'));

    const result = await processRefund({ orderId: 'order-001', deductBalance: true, force: false });

    expect(result.success).toBe(false);
    expect(result.requireForce).toBe(true);
    // CAS 锁不应执行
    expect(mockOrderUpdateMany).not.toHaveBeenCalled();
    // 网关退款不应执行
    expect(mockProviderRefund).not.toHaveBeenCalled();
    // 余额扣减不应执行
    expect(mockSubtractBalance).not.toHaveBeenCalled();
  });

  // ── 订阅获取失败 + force=false → 在 CAS 锁之前返回 requireForce ──
  it('订阅获取失败 + force=false → 在 CAS 锁之前返回 requireForce', async () => {
    const order = makeSubscriptionOrder();
    mockOrderFindUnique.mockResolvedValue(order);
    mockGetUserSubscriptions.mockRejectedValue(new Error('subs api down'));

    const result = await processRefund({ orderId: 'order-001', deductBalance: true, force: false });

    expect(result.success).toBe(false);
    expect(result.requireForce).toBe(true);
    expect(result.warning).toBeTruthy();
    // CAS 锁不应执行
    expect(mockOrderUpdateMany).not.toHaveBeenCalled();
    // 不应执行扣减
    expect(mockExtendSubscription).not.toHaveBeenCalled();
  });

  // ── 订阅获取失败 + force=true → 跳过扣减但网关退款仍执行 ──
  it('订阅获取失败 + force=true → 跳过订阅扣减但网关退款仍执行', async () => {
    const order = makeSubscriptionOrder();
    mockOrderFindUnique.mockResolvedValue(order);
    mockGetUserSubscriptions.mockRejectedValue(new Error('subs api down'));

    const result = await processRefund({ orderId: 'order-001', deductBalance: true, force: true });

    expect(result.success).toBe(true);
    expect(result.subscriptionDaysDeducted).toBe(0);
    // 不扣减订阅
    expect(mockExtendSubscription).not.toHaveBeenCalled();
    // 但网关退款仍执行
    expect(mockProviderRefund).toHaveBeenCalled();
    // 订单状态应为 REFUNDED
    expect(mockOrderUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: ORDER_STATUS.REFUNDED }),
      }),
    );
  });

  // ── 订阅订单无 subscriptionGroupId 或 subscriptionDays 时跳过扣减 ──
  it('订阅订单无 subscriptionGroupId 时不扣减订阅天数', async () => {
    const order = makeSubscriptionOrder({ subscriptionGroupId: null });
    mockOrderFindUnique.mockResolvedValue(order);

    const result = await processRefund({ orderId: 'order-001', deductBalance: true });

    expect(result.success).toBe(true);
    expect(result.subscriptionDaysDeducted).toBe(0);
    expect(mockGetUserSubscriptions).not.toHaveBeenCalled();
    expect(mockExtendSubscription).not.toHaveBeenCalled();
  });

  it('订阅订单无 subscriptionDays 时不扣减订阅天数', async () => {
    const order = makeSubscriptionOrder({ subscriptionDays: null });
    mockOrderFindUnique.mockResolvedValue(order);

    const result = await processRefund({ orderId: 'order-001', deductBalance: true });

    expect(result.success).toBe(true);
    expect(result.subscriptionDaysDeducted).toBe(0);
    expect(mockGetUserSubscriptions).not.toHaveBeenCalled();
    expect(mockExtendSubscription).not.toHaveBeenCalled();
  });

  // ── refundAmount 和 rechargeAmount 正确传递 ──
  it('refundAmount 使用 payAmount 进行网关退款', async () => {
    const order = makeOrder({ amount: new Prisma.Decimal('100.00'), payAmount: new Prisma.Decimal('105.50') });
    mockOrderFindUnique.mockResolvedValue(order);
    mockGetUser.mockResolvedValue({ id: 42, balance: 200, status: 'active' });

    await processRefund({ orderId: 'order-001' });

    // 网关退款使用 payAmount
    expect(mockProviderRefund).toHaveBeenCalledWith(expect.objectContaining({ amount: 105.5 }));
    // 余额扣减使用 amount（rechargeAmount）
    expect(mockSubtractBalance).toHaveBeenCalledWith(42, 100, expect.any(String), expect.any(String));
  });
});
