'use client';

import { getPaymentTypeLabel } from '@/lib/pay-utils';

interface PaymentMethod {
  paymentType: string;
  amount: number;
  count: number;
  percentage: number;
}

interface PaymentMethodChartProps {
  data: PaymentMethod[];
  dark?: boolean;
}

const TYPE_CONFIG: Record<string, { label: string; light: string; dark: string }> = {
  alipay: { label: '支付宝（易支付）', light: 'bg-cyan-500', dark: 'bg-cyan-400' },
  alipay_direct: { label: '支付宝（官方）', light: 'bg-blue-500', dark: 'bg-blue-400' },
  wxpay: { label: '微信支付（易支付）', light: 'bg-green-500', dark: 'bg-green-400' },
  wxpay_direct: { label: '微信支付（官方）', light: 'bg-emerald-500', dark: 'bg-emerald-400' },
  stripe: { label: 'Stripe', light: 'bg-purple-500', dark: 'bg-purple-400' },
};

export default function PaymentMethodChart({ data, dark }: PaymentMethodChartProps) {
  if (data.length === 0) {
    return (
      <div
        className={[
          'rounded-xl border p-6',
          dark ? 'border-slate-700 bg-slate-800/60' : 'border-slate-200 bg-white shadow-sm',
        ].join(' ')}
      >
        <h3 className={['mb-4 text-sm font-semibold', dark ? 'text-slate-200' : 'text-slate-800'].join(' ')}>
          支付方式分布
        </h3>
        <p className={['text-center text-sm py-8', dark ? 'text-slate-500' : 'text-gray-400'].join(' ')}>暂无数据</p>
      </div>
    );
  }

  return (
    <div
      className={[
        'rounded-xl border p-6',
        dark ? 'border-slate-700 bg-slate-800/60' : 'border-slate-200 bg-white shadow-sm',
      ].join(' ')}
    >
      <h3 className={['mb-4 text-sm font-semibold', dark ? 'text-slate-200' : 'text-slate-800'].join(' ')}>
        支付方式分布
      </h3>
      <div className="space-y-4">
        {data.map((method) => {
          const config = TYPE_CONFIG[method.paymentType] || {
            label: getPaymentTypeLabel(method.paymentType),
            light: 'bg-gray-500',
            dark: 'bg-gray-400',
          };
          return (
            <div key={method.paymentType}>
              <div className="mb-1.5 flex items-center justify-between text-sm">
                <span className={dark ? 'text-slate-300' : 'text-slate-700'}>{config.label}</span>
                <span className={dark ? 'text-slate-400' : 'text-slate-500'}>
                  ¥{method.amount.toLocaleString()} · {method.percentage}%
                </span>
              </div>
              <div
                className={['h-3 w-full overflow-hidden rounded-full', dark ? 'bg-slate-700' : 'bg-slate-100'].join(
                  ' ',
                )}
              >
                <div
                  className={['h-full rounded-full transition-all', dark ? config.dark : config.light].join(' ')}
                  style={{ width: `${method.percentage}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
