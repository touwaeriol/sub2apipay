'use client';

interface LeaderboardEntry {
  userId: number;
  userName: string | null;
  userEmail: string | null;
  totalAmount: number;
  orderCount: number;
}

interface LeaderboardProps {
  data: LeaderboardEntry[];
  dark?: boolean;
}

const RANK_STYLES: Record<number, { light: string; dark: string }> = {
  1: { light: 'bg-amber-100 text-amber-700', dark: 'bg-amber-500/20 text-amber-300' },
  2: { light: 'bg-slate-200 text-slate-600', dark: 'bg-slate-500/20 text-slate-300' },
  3: { light: 'bg-orange-100 text-orange-700', dark: 'bg-orange-500/20 text-orange-300' },
};

export default function Leaderboard({ data, dark }: LeaderboardProps) {
  const thCls = `px-4 py-3 text-left text-xs font-medium uppercase ${dark ? 'text-slate-400' : 'text-gray-500'}`;
  const tdCls = `whitespace-nowrap px-4 py-3 text-sm ${dark ? 'text-slate-300' : 'text-slate-700'}`;
  const tdMuted = `whitespace-nowrap px-4 py-3 text-sm ${dark ? 'text-slate-400' : 'text-gray-500'}`;

  if (data.length === 0) {
    return (
      <div
        className={[
          'rounded-xl border p-6',
          dark ? 'border-slate-700 bg-slate-800/60' : 'border-slate-200 bg-white shadow-sm',
        ].join(' ')}
      >
        <h3 className={['mb-4 text-sm font-semibold', dark ? 'text-slate-200' : 'text-slate-800'].join(' ')}>
          充值排行榜 (Top 10)
        </h3>
        <p className={['text-center text-sm py-8', dark ? 'text-slate-500' : 'text-gray-400'].join(' ')}>暂无数据</p>
      </div>
    );
  }

  return (
    <div
      className={[
        'rounded-xl border',
        dark ? 'border-slate-700 bg-slate-800/60' : 'border-slate-200 bg-white shadow-sm',
      ].join(' ')}
    >
      <h3 className={['px-6 pt-5 pb-2 text-sm font-semibold', dark ? 'text-slate-200' : 'text-slate-800'].join(' ')}>
        充值排行榜 (Top 10)
      </h3>
      <div className="overflow-x-auto">
        <table className={`min-w-full divide-y ${dark ? 'divide-slate-700' : 'divide-gray-200'}`}>
          <thead className={dark ? 'bg-slate-800/50' : 'bg-gray-50'}>
            <tr>
              <th className={thCls}>#</th>
              <th className={thCls}>用户</th>
              <th className={thCls}>累计金额</th>
              <th className={thCls}>订单数</th>
            </tr>
          </thead>
          <tbody className={`divide-y ${dark ? 'divide-slate-700/60' : 'divide-gray-200'}`}>
            {data.map((entry, i) => {
              const rank = i + 1;
              const rankStyle = RANK_STYLES[rank];
              return (
                <tr key={entry.userId} className={dark ? 'hover:bg-slate-700/40' : 'hover:bg-gray-50'}>
                  <td className="whitespace-nowrap px-4 py-3 text-sm">
                    {rankStyle ? (
                      <span
                        className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${dark ? rankStyle.dark : rankStyle.light}`}
                      >
                        {rank}
                      </span>
                    ) : (
                      <span className={dark ? 'text-slate-500' : 'text-gray-400'}>{rank}</span>
                    )}
                  </td>
                  <td className={tdCls}>
                    <div>{entry.userName || `#${entry.userId}`}</div>
                    {entry.userEmail && (
                      <div className={['text-xs', dark ? 'text-slate-500' : 'text-gray-400'].join(' ')}>
                        {entry.userEmail}
                      </div>
                    )}
                  </td>
                  <td
                    className={`whitespace-nowrap px-4 py-3 text-sm font-medium ${dark ? 'text-slate-200' : 'text-slate-900'}`}
                  >
                    ¥{entry.totalAmount.toLocaleString()}
                  </td>
                  <td className={tdMuted}>{entry.orderCount}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
