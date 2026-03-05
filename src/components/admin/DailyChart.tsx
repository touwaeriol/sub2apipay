'use client';

import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

interface DailyData {
  date: string;
  amount: number;
  count: number;
}

interface DailyChartProps {
  data: DailyData[];
  dark?: boolean;
}

function formatDate(dateStr: string) {
  const [, m, d] = dateStr.split('-');
  return `${m}/${d}`;
}

function formatAmount(value: number) {
  if (value >= 10000) return `¥${(value / 10000).toFixed(1)}w`;
  if (value >= 1000) return `¥${(value / 1000).toFixed(1)}k`;
  return `¥${value}`;
}

interface TooltipPayload {
  value: number;
  dataKey: string;
}

function CustomTooltip({
  active,
  payload,
  label,
  dark,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
  dark?: boolean;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className={[
        'rounded-lg border px-3 py-2 text-sm shadow-lg',
        dark ? 'border-slate-600 bg-slate-800 text-slate-200' : 'border-slate-200 bg-white text-slate-800',
      ].join(' ')}
    >
      <p className={['mb-1 text-xs', dark ? 'text-slate-400' : 'text-slate-500'].join(' ')}>{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey}>
          {p.dataKey === 'amount' ? '金额' : '笔数'}:{' '}
          {p.dataKey === 'amount' ? `¥${p.value.toLocaleString()}` : p.value}
        </p>
      ))}
    </div>
  );
}

export default function DailyChart({ data, dark }: DailyChartProps) {
  // Auto-calculate tick interval: show ~10-15 labels max
  const tickInterval = data.length > 30 ? Math.ceil(data.length / 12) - 1 : 0;
  if (data.length === 0) {
    return (
      <div
        className={[
          'rounded-xl border p-6',
          dark ? 'border-slate-700 bg-slate-800/60' : 'border-slate-200 bg-white shadow-sm',
        ].join(' ')}
      >
        <h3 className={['mb-4 text-sm font-semibold', dark ? 'text-slate-200' : 'text-slate-800'].join(' ')}>
          每日充值趋势
        </h3>
        <p className={['text-center text-sm py-16', dark ? 'text-slate-500' : 'text-gray-400'].join(' ')}>暂无数据</p>
      </div>
    );
  }

  const axisColor = dark ? '#64748b' : '#94a3b8';
  const gridColor = dark ? '#334155' : '#e2e8f0';

  return (
    <div
      className={[
        'rounded-xl border p-6',
        dark ? 'border-slate-700 bg-slate-800/60' : 'border-slate-200 bg-white shadow-sm',
      ].join(' ')}
    >
      <h3 className={['mb-4 text-sm font-semibold', dark ? 'text-slate-200' : 'text-slate-800'].join(' ')}>
        每日充值趋势
      </h3>
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
          <CartesianGrid stroke={gridColor} strokeDasharray="3 3" />
          <XAxis
            dataKey="date"
            tickFormatter={formatDate}
            tick={{ fill: axisColor, fontSize: 12 }}
            axisLine={{ stroke: gridColor }}
            tickLine={false}
            interval={tickInterval}
          />
          <YAxis
            tickFormatter={formatAmount}
            tick={{ fill: axisColor, fontSize: 12 }}
            axisLine={{ stroke: gridColor }}
            tickLine={false}
            width={60}
          />
          <Tooltip content={<CustomTooltip dark={dark} />} />
          <Line
            type="monotone"
            dataKey="amount"
            stroke={dark ? '#818cf8' : '#4f46e5'}
            strokeWidth={2}
            dot={{ r: 3, fill: dark ? '#818cf8' : '#4f46e5' }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
