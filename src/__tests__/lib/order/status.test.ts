import { describe, expect, it } from 'vitest';
import { ORDER_STATUS } from '@/lib/constants';
import { deriveOrderState, getOrderDisplayState } from '@/lib/order/status';

describe('order status helpers', () => {
  it('derives paid_pending after successful payment but before recharge completion', () => {
    const state = deriveOrderState({
      status: ORDER_STATUS.PAID,
      paidAt: new Date('2026-03-09T10:00:00Z'),
      completedAt: null,
    });

    expect(state).toEqual({
      paymentSuccess: true,
      rechargeSuccess: false,
      rechargeStatus: 'paid_pending',
    });
  });

  it('maps recharge failure after payment to a payment-success display state', () => {
    const display = getOrderDisplayState({
      status: ORDER_STATUS.FAILED,
      paymentSuccess: true,
      rechargeSuccess: false,
      rechargeStatus: 'failed',
    });

    expect(display.label).toBe('支付成功');
    expect(display.message).toContain('自动重试');
  });

  it('maps failed order before payment success to failed display', () => {
    const display = getOrderDisplayState({
      status: ORDER_STATUS.FAILED,
      paymentSuccess: false,
      rechargeSuccess: false,
      rechargeStatus: 'failed',
    });

    expect(display.label).toBe('支付失败');
    expect(display.message).toContain('重新发起支付');
  });

  it('maps completed order to success display', () => {
    const display = getOrderDisplayState({
      status: ORDER_STATUS.COMPLETED,
      paymentSuccess: true,
      rechargeSuccess: true,
      rechargeStatus: 'success',
    });

    expect(display.label).toBe('充值成功');
    expect(display.icon).toBe('✓');
  });

  it('maps pending order to waiting-for-payment display', () => {
    const display = getOrderDisplayState({
      status: ORDER_STATUS.PENDING,
      paymentSuccess: false,
      rechargeSuccess: false,
      rechargeStatus: 'not_paid',
    });

    expect(display.label).toBe('等待支付');
  });
});
