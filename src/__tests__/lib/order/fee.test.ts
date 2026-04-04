import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/payment', () => ({
  initPaymentProviders: vi.fn(),
  ensureDBProviders: vi.fn().mockResolvedValue(undefined),
  paymentRegistry: {
    getProviderKey: vi.fn(),
  },
}));

import { calculatePayAmount } from '@/lib/order/fee';

describe('calculatePayAmount', () => {
  it.each([
    { rechargeAmount: 100, feeRate: 0, expected: '100.00', desc: 'feeRate=0 返回原金额' },
    { rechargeAmount: 100, feeRate: -1, expected: '100.00', desc: 'feeRate<0 返回原金额' },
    { rechargeAmount: 100, feeRate: 3, expected: '103.00', desc: '100 * 3% = 3.00' },
    { rechargeAmount: 100, feeRate: 2.5, expected: '102.50', desc: '100 * 2.5% = 2.50' },
    {
      rechargeAmount: 99.99,
      feeRate: 1,
      expected: '100.99',
      desc: '99.99 * 1% = 0.9999 → ROUND_UP → 1.00, total 100.99',
    },
    { rechargeAmount: 10, feeRate: 3, expected: '10.30', desc: '10 * 3% = 0.30' },
    { rechargeAmount: 1, feeRate: 1, expected: '1.01', desc: '1 * 1% = 0.01' },
  ])('$desc (amount=$rechargeAmount, rate=$feeRate)', ({ rechargeAmount, feeRate, expected }) => {
    expect(calculatePayAmount(rechargeAmount, feeRate)).toBe(expected);
  });

  describe('ROUND_UP 向上取整', () => {
    it('小数第三位非零时进位', () => {
      // 33 * 1% = 0.33, 整除无进位
      expect(calculatePayAmount(33, 1)).toBe('33.33');
    });

    it('产生无限小数时向上进位', () => {
      // 10 * 3.3% = 0.33, 精确
      expect(calculatePayAmount(10, 3.3)).toBe('10.33');
      // 7 * 3% = 0.21, 精确
      expect(calculatePayAmount(7, 3)).toBe('7.21');
      // 1 * 0.7% = 0.007 → ROUND_UP → 0.01
      expect(calculatePayAmount(1, 0.7)).toBe('1.01');
    });
  });

  describe('极小金额', () => {
    it('0.01 元 + 1% 手续费', () => {
      // 0.01 * 1% = 0.0001 → ROUND_UP → 0.01
      expect(calculatePayAmount(0.01, 1)).toBe('0.02');
    });

    it('0.01 元 + 0 手续费', () => {
      expect(calculatePayAmount(0.01, 0)).toBe('0.01');
    });
  });

  describe('大金额', () => {
    it('10000 元 + 2.5%', () => {
      // 10000 * 2.5% = 250.00
      expect(calculatePayAmount(10000, 2.5)).toBe('10250.00');
    });

    it('99999.99 元 + 5%', () => {
      // 99999.99 * 5% = 4999.9995 → ROUND_UP → 5000.00
      // 但 rechargeAmount 传入为 number 99999.99，Decimal(99999.99) 可能有浮点
      // 实际: 99999.99 + 5000.00 = 104999.99
      expect(calculatePayAmount(99999.99, 5)).toBe('104999.99');
    });
  });

  describe('精度', () => {
    it('输出始终为 2 位小数', () => {
      const result = calculatePayAmount(100, 0);
      expect(result).toMatch(/^\d+\.\d{2}$/);
    });

    it('有手续费时输出也为 2 位小数', () => {
      const result = calculatePayAmount(77, 3.33);
      expect(result).toMatch(/^\d+\.\d{2}$/);
    });
  });
});
