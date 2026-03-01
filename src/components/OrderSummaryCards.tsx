interface Summary {
  total: number;
  pending: number;
  completed: number;
  failed: number;
}

interface OrderSummaryCardsProps {
  isDark: boolean;
  summary: Summary;
}

export default function OrderSummaryCards({ isDark, summary }: OrderSummaryCardsProps) {
  const cardClass = [
    'rounded-xl border p-3',
    isDark ? 'border-slate-700 bg-slate-800/70' : 'border-slate-200 bg-slate-50',
  ].join(' ');
  const labelClass = ['text-xs', isDark ? 'text-slate-400' : 'text-slate-500'].join(' ');

  return (
    <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div className={cardClass}>
        <div className={labelClass}>总订单</div>
        <div className="mt-1 text-xl font-semibold">{summary.total}</div>
      </div>
      <div className={cardClass}>
        <div className={labelClass}>待支付</div>
        <div className="mt-1 text-xl font-semibold">{summary.pending}</div>
      </div>
      <div className={cardClass}>
        <div className={labelClass}>已完成</div>
        <div className="mt-1 text-xl font-semibold">{summary.completed}</div>
      </div>
      <div className={cardClass}>
        <div className={labelClass}>异常/关闭</div>
        <div className="mt-1 text-xl font-semibold">{summary.failed}</div>
      </div>
    </div>
  );
}
