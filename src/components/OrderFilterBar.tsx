import { FILTER_OPTIONS, type OrderStatusFilter } from '@/lib/pay-utils';

interface OrderFilterBarProps {
  isDark: boolean;
  activeFilter: OrderStatusFilter;
  onChange: (filter: OrderStatusFilter) => void;
}

export default function OrderFilterBar({ isDark, activeFilter, onChange }: OrderFilterBarProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {FILTER_OPTIONS.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={() => onChange(item.key)}
          className={[
            'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
            activeFilter === item.key
              ? isDark
                ? 'border-slate-500 bg-slate-700 text-slate-100'
                : 'border-slate-400 bg-slate-900 text-white'
              : isDark
                ? 'border-slate-600 text-slate-300 hover:bg-slate-800'
                : 'border-slate-300 text-slate-600 hover:bg-slate-100',
          ].join(' ')}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
