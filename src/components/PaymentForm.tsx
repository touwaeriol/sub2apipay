'use client';

import { useState } from 'react';
import { PAYMENT_TYPE_META } from '@/lib/pay-utils';

interface PaymentFormProps {
  userId: number;
  userName?: string;
  userBalance?: number;
  enabledPaymentTypes: string[];
  minAmount: number;
  maxAmount: number;
  onSubmit: (amount: number, paymentType: string) => Promise<void>;
  loading?: boolean;
  dark?: boolean;
}

const QUICK_AMOUNTS = [10, 20, 50, 100, 200, 500];
const AMOUNT_TEXT_PATTERN = /^\d*(\.\d{0,2})?$/;

function hasValidCentPrecision(num: number): boolean {
  return Math.abs(Math.round(num * 100) - num * 100) < 1e-8;
}

export default function PaymentForm({
  userId,
  userName,
  userBalance,
  enabledPaymentTypes,
  minAmount,
  maxAmount,
  onSubmit,
  loading,
  dark = false,
}: PaymentFormProps) {
  const [amount, setAmount] = useState<number | ''>('');
  const [paymentType, setPaymentType] = useState(enabledPaymentTypes[0] || 'alipay');
  const [customAmount, setCustomAmount] = useState('');

  const handleQuickAmount = (val: number) => {
    setAmount(val);
    setCustomAmount(String(val));
  };

  const handleCustomAmountChange = (val: string) => {
    if (!AMOUNT_TEXT_PATTERN.test(val)) {
      return;
    }

    setCustomAmount(val);

    if (val === '') {
      setAmount('');
      return;
    }

    const num = parseFloat(val);
    if (!isNaN(num) && num > 0 && hasValidCentPrecision(num)) {
      setAmount(num);
    } else {
      setAmount('');
    }
  };

  const selectedAmount = amount || 0;
  const isValid = selectedAmount >= minAmount && selectedAmount <= maxAmount && hasValidCentPrecision(selectedAmount);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || loading) return;
    await onSubmit(selectedAmount, paymentType);
  };

  const renderPaymentIcon = (type: string) => {
    if (type === 'alipay') {
      return (
        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-[#00AEEF] text-xl font-bold leading-none text-white">
          支
        </span>
      );
    }
    if (type === 'wxpay') {
      return (
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#2BB741] text-white">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none">
            <path
              d="M5 12.5 10.2 17 19 8"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      );
    }
    if (type === 'stripe') {
      return (
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#635bff] text-white">
          <svg
            viewBox="0 0 24 24"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="2" y="5" width="20" height="14" rx="2" />
            <path d="M2 10h20" />
          </svg>
        </span>
      );
    }
    return null;
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* User Info */}
      <div
        className={[
          'rounded-xl border p-4',
          dark ? 'border-slate-700 bg-slate-800/80' : 'border-slate-200 bg-slate-50',
        ].join(' ')}
      >
        <div className={['text-xs uppercase tracking-wide', dark ? 'text-slate-400' : 'text-slate-500'].join(' ')}>
          充值账户
        </div>
        <div className={['mt-1 text-base font-medium', dark ? 'text-slate-100' : 'text-slate-900'].join(' ')}>
          {userName || `用户 #${userId}`}
        </div>
        {userBalance !== undefined && (
          <div className={['mt-1 text-sm', dark ? 'text-slate-400' : 'text-slate-500'].join(' ')}>
            当前余额: <span className="font-medium text-green-600">{userBalance.toFixed(2)}</span>
          </div>
        )}
      </div>

      {/* Quick Amount Selection */}
      <div>
        <label className={['mb-2 block text-sm font-medium', dark ? 'text-slate-200' : 'text-slate-700'].join(' ')}>
          充值金额
        </label>
        <div className="grid grid-cols-3 gap-2">
          {QUICK_AMOUNTS.map((val) => (
            <button
              key={val}
              type="button"
              onClick={() => handleQuickAmount(val)}
              className={`rounded-lg border-2 px-4 py-3 text-center font-medium transition-colors ${
                amount === val
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : dark
                    ? 'border-slate-700 bg-slate-900 text-slate-200 hover:border-slate-500'
                    : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
              }`}
            >
              ¥{val}
            </button>
          ))}
        </div>
      </div>

      {/* Custom Amount */}
      <div>
        <label className={['mb-2 block text-sm font-medium', dark ? 'text-slate-200' : 'text-slate-700'].join(' ')}>
          自定义金额
        </label>
        <div className="relative">
          <span
            className={['absolute left-3 top-1/2 -translate-y-1/2', dark ? 'text-slate-500' : 'text-gray-400'].join(
              ' ',
            )}
          >
            ¥
          </span>
          <input
            type="text"
            inputMode="decimal"
            step="0.01"
            min={minAmount}
            max={maxAmount}
            value={customAmount}
            onChange={(e) => handleCustomAmountChange(e.target.value)}
            placeholder={`${minAmount} - ${maxAmount}`}
            className={[
              'w-full rounded-lg border py-3 pl-8 pr-4 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500',
              dark ? 'border-slate-700 bg-slate-900 text-slate-100' : 'border-gray-300 bg-white text-gray-900',
            ].join(' ')}
          />
        </div>
      </div>

      {customAmount !== '' && !isValid && (
        <div className={['text-xs', dark ? 'text-amber-300' : 'text-amber-700'].join(' ')}>
          {
            '\u91D1\u989D\u9700\u5728\u8303\u56F4\u5185\uFF0C\u4E14\u6700\u591A\u652F\u6301 2 \u4F4D\u5C0F\u6570\uFF08\u7CBE\u786E\u5230\u5206\uFF09'
          }
        </div>
      )}

      {/* Payment Type */}
      <div>
        <label className={['mb-2 block text-sm font-medium', dark ? 'text-slate-200' : 'text-gray-700'].join(' ')}>
          支付方式
        </label>
        <div className="flex gap-3">
          {enabledPaymentTypes.map((type) => {
            const meta = PAYMENT_TYPE_META[type];
            const isSelected = paymentType === type;
            return (
              <button
                key={type}
                type="button"
                onClick={() => setPaymentType(type)}
                className={`flex h-[58px] flex-1 items-center justify-center rounded-lg border px-3 transition-all ${
                  isSelected
                    ? `${meta?.selectedBorder || 'border-blue-500'} ${meta?.selectedBg || 'bg-blue-50'} text-slate-900 shadow-sm`
                    : dark
                      ? 'border-slate-700 bg-slate-900 text-slate-200 hover:border-slate-500'
                      : 'border-gray-300 bg-white text-slate-700 hover:border-gray-400'
                }`}
              >
                <span className="flex items-center gap-2">
                  {renderPaymentIcon(type)}
                  <span className="flex flex-col items-start leading-none">
                    <span className="text-xl font-semibold tracking-tight">{meta?.label || type}</span>
                    {meta?.sublabel && (
                      <span
                        className={`text-[10px] tracking-wide ${dark && !isSelected ? 'text-slate-400' : 'text-slate-600'}`}
                      >
                        {meta.sublabel}
                      </span>
                    )}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={!isValid || loading}
        className={`w-full rounded-lg py-3 text-center font-medium text-white transition-colors ${
          isValid && !loading
            ? paymentType === 'stripe'
              ? 'bg-[#635bff] hover:bg-[#5851db] active:bg-[#4b44c7]'
              : 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800'
            : dark
              ? 'cursor-not-allowed bg-slate-700 text-slate-300'
              : 'cursor-not-allowed bg-gray-300'
        }`}
      >
        {loading ? '处理中...' : `立即充值 ¥${selectedAmount || 0}`}
      </button>
    </form>
  );
}
