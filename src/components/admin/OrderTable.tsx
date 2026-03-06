'use client';

import { getPaymentTypeLabel } from '@/lib/pay-utils';

interface Order {
  id: string;
  userId: number;
  userName: string | null;
  userEmail: string | null;
  userNotes: string | null;
  amount: number;
  status: string;
  paymentType: string;
  createdAt: string;
  paidAt: string | null;
  completedAt: string | null;
  failedReason: string | null;
  expiresAt: string;
  srcHost: string | null;
  rechargeRetryable?: boolean;
}

interface OrderTableProps {
  orders: Order[];
  onRetry: (orderId: string) => void;
  onCancel: (orderId: string) => void;
  onViewDetail: (orderId: string) => void;
  dark?: boolean;
}

const STATUS_LABELS: Record<string, { label: string; light: string; dark: string }> = {
  PENDING: { label: '待支付', light: 'bg-yellow-100 text-yellow-800', dark: 'bg-yellow-500/20 text-yellow-300' },
  PAID: { label: '已支付', light: 'bg-blue-100 text-blue-800', dark: 'bg-blue-500/20 text-blue-300' },
  RECHARGING: { label: '充值中', light: 'bg-blue-100 text-blue-800', dark: 'bg-blue-500/20 text-blue-300' },
  COMPLETED: { label: '已完成', light: 'bg-green-100 text-green-800', dark: 'bg-green-500/20 text-green-300' },
  EXPIRED: { label: '已超时', light: 'bg-gray-100 text-gray-800', dark: 'bg-slate-600/30 text-slate-400' },
  CANCELLED: { label: '已取消', light: 'bg-gray-100 text-gray-800', dark: 'bg-slate-600/30 text-slate-400' },
  FAILED: { label: '充值失败', light: 'bg-red-100 text-red-800', dark: 'bg-red-500/20 text-red-300' },
  REFUNDING: { label: '退款中', light: 'bg-orange-100 text-orange-800', dark: 'bg-orange-500/20 text-orange-300' },
  REFUNDED: { label: '已退款', light: 'bg-purple-100 text-purple-800', dark: 'bg-purple-500/20 text-purple-300' },
  REFUND_FAILED: { label: '退款失败', light: 'bg-red-100 text-red-800', dark: 'bg-red-500/20 text-red-300' },
};

export default function OrderTable({ orders, onRetry, onCancel, onViewDetail, dark }: OrderTableProps) {
  const thCls = `px-4 py-3 text-left text-xs font-medium uppercase ${dark ? 'text-slate-400' : 'text-gray-500'}`;
  const tdMuted = `whitespace-nowrap px-4 py-3 text-sm ${dark ? 'text-slate-400' : 'text-gray-500'}`;

  return (
    <div className="overflow-x-auto">
      <table className={`min-w-full divide-y ${dark ? 'divide-slate-700' : 'divide-gray-200'}`}>
        <thead className={dark ? 'bg-slate-800/50' : 'bg-gray-50'}>
          <tr>
            <th className={thCls}>订单号</th>
            <th className={thCls}>用户名</th>
            <th className={thCls}>邮箱</th>
            <th className={thCls}>备注</th>
            <th className={thCls}>金额</th>
            <th className={thCls}>状态</th>
            <th className={thCls}>支付方式</th>
            <th className={thCls}>来源</th>
            <th className={thCls}>创建时间</th>
            <th className={thCls}>操作</th>
          </tr>
        </thead>
        <tbody className={`divide-y ${dark ? 'divide-slate-700/60' : 'divide-gray-200 bg-white'}`}>
          {orders.map((order) => {
            const statusInfo = STATUS_LABELS[order.status] || {
              label: order.status,
              light: 'bg-gray-100 text-gray-800',
              dark: 'bg-slate-600/30 text-slate-400',
            };
            return (
              <tr key={order.id} className={dark ? 'hover:bg-slate-700/40' : 'hover:bg-gray-50'}>
                <td className="whitespace-nowrap px-4 py-3 text-sm">
                  <button
                    onClick={() => onViewDetail(order.id)}
                    className={dark ? 'text-indigo-400 hover:underline' : 'text-blue-600 hover:underline'}
                  >
                    {order.id.slice(0, 12)}...
                  </button>
                </td>
                <td className={`whitespace-nowrap px-4 py-3 text-sm ${dark ? 'text-slate-200' : ''}`}>
                  {order.userName || `#${order.userId}`}
                </td>
                <td className={tdMuted}>{order.userEmail || '-'}</td>
                <td className={tdMuted}>{order.userNotes || '-'}</td>
                <td className={`whitespace-nowrap px-4 py-3 text-sm font-medium ${dark ? 'text-slate-200' : ''}`}>
                  ¥{order.amount.toFixed(2)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-sm">
                  <span
                    className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${dark ? statusInfo.dark : statusInfo.light}`}
                  >
                    {statusInfo.label}
                  </span>
                </td>
                <td className={tdMuted}>{getPaymentTypeLabel(order.paymentType)}</td>
                <td className={tdMuted}>{order.srcHost || '-'}</td>
                <td className={tdMuted}>{new Date(order.createdAt).toLocaleString('zh-CN')}</td>
                <td className="whitespace-nowrap px-4 py-3 text-sm">
                  <div className="flex gap-1">
                    {order.rechargeRetryable && (
                      <button
                        onClick={() => onRetry(order.id)}
                        className={`rounded px-2 py-1 text-xs ${dark ? 'bg-blue-500/20 text-blue-300 hover:bg-blue-500/30' : 'bg-blue-100 text-blue-700 hover:bg-blue-200'}`}
                      >
                        重试
                      </button>
                    )}
                    {order.status === 'PENDING' && (
                      <button
                        onClick={() => onCancel(order.id)}
                        className={`rounded px-2 py-1 text-xs ${dark ? 'bg-red-500/20 text-red-300 hover:bg-red-500/30' : 'bg-red-100 text-red-700 hover:bg-red-200'}`}
                      >
                        取消
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {orders.length === 0 && (
        <div className={`py-12 text-center ${dark ? 'text-slate-500' : 'text-gray-500'}`}>暂无订单</div>
      )}
    </div>
  );
}
