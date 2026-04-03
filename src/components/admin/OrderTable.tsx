'use client';

import { getPaymentDisplayInfo, formatStatus, formatCreatedAt, getStatusBadgeClass } from '@/lib/pay-utils';
import type { Locale } from '@/lib/locale';

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
  orderType?: string;
  rechargeRetryable?: boolean;
  refundRequestedAt?: string | null;
  refundRequestReason?: string | null;
  refundAmount?: number | null;
}

interface OrderTableProps {
  orders: Order[];
  onRetry: (orderId: string) => void;
  onCancel: (orderId: string) => void;
  onRefund: (orderId: string) => void;
  onViewDetail: (orderId: string) => void;
  dark?: boolean;
  locale?: Locale;
}

export default function OrderTable({
  orders,
  onRetry,
  onCancel,
  onRefund,
  onViewDetail,
  dark,
  locale = 'zh',
}: OrderTableProps) {
  const currency = locale === 'en' ? '$' : '¥';
  const text =
    locale === 'en'
      ? {
          orderId: 'Order ID',
          userName: 'Username',
          email: 'Email',
          notes: 'Notes',
          amount: 'Amount',
          type: 'Type',
          status: 'Status',
          paymentMethod: 'Payment',
          source: 'Source',
          createdAt: 'Created At',
          actions: 'Actions',
          retry: 'Retry',
          cancel: 'Cancel',
          refund: 'Refund',
          retryRefund: 'Retry Refund',
          approveRefund: 'Approve Refund',
          empty: 'No orders',
        }
      : {
          orderId: '订单号',
          userName: '用户名',
          email: '邮箱',
          notes: '备注',
          amount: '金额',
          type: '类型',
          status: '状态',
          paymentMethod: '支付方式',
          source: '来源',
          createdAt: '创建时间',
          actions: '操作',
          retry: '重试',
          cancel: '取消',
          refund: '退款',
          retryRefund: '重试退款',
          approveRefund: '批准退款',
          empty: '暂无订单',
        };

  const thCls = `px-4 py-3 text-left text-xs font-medium uppercase ${dark ? 'text-slate-400' : 'text-gray-500'}`;
  const tdMuted = `whitespace-nowrap px-4 py-3 text-sm ${dark ? 'text-slate-400' : 'text-gray-500'}`;

  return (
    <div className="overflow-x-auto">
      <table className={`min-w-full divide-y ${dark ? 'divide-slate-700' : 'divide-gray-200'}`}>
        <thead className={dark ? 'bg-slate-800/50' : 'bg-gray-50'}>
          <tr>
            <th className={thCls}>{text.orderId}</th>
            <th className={thCls}>{text.userName}</th>
            <th className={thCls}>{text.email}</th>
            <th className={thCls}>{text.notes}</th>
            <th className={thCls}>{text.amount}</th>
            <th className={thCls}>{text.type}</th>
            <th className={thCls}>{text.status}</th>
            <th className={thCls}>{text.paymentMethod}</th>
            <th className={thCls}>{text.source}</th>
            <th className={thCls}>{text.createdAt}</th>
            <th className={thCls}>{text.actions}</th>
          </tr>
        </thead>
        <tbody className={`divide-y ${dark ? 'divide-slate-700/60 bg-slate-900' : 'divide-gray-200 bg-white'}`}>
          {orders.map((order) => (
            <tr key={order.id} className={dark ? 'hover:bg-slate-700/40' : 'hover:bg-gray-50'}>
              <td className="whitespace-nowrap px-4 py-3 text-sm">
                <button
                  onClick={() => onViewDetail(order.id)}
                  className={dark ? 'text-indigo-400 hover:underline' : 'text-blue-600 hover:underline'}
                >
                  {order.id.slice(0, 12)}...
                </button>
              </td>
              <td className={`whitespace-nowrap px-4 py-3 text-sm ${dark ? 'text-slate-200' : 'text-slate-900'}`}>
                {order.userName || `#${order.userId}`}
              </td>
              <td className={tdMuted}>{order.userEmail || '-'}</td>
              <td className={tdMuted}>{order.userNotes || '-'}</td>
              <td
                className={`whitespace-nowrap px-4 py-3 text-sm font-medium ${dark ? 'text-slate-200' : 'text-slate-900'}`}
              >
                {currency}
                {order.amount.toFixed(2)}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-sm">
                <span
                  className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${order.orderType === 'subscription' ? (dark ? 'bg-purple-500/20 text-purple-300' : 'bg-purple-100 text-purple-800') : dark ? 'bg-blue-500/20 text-blue-300' : 'bg-blue-100 text-blue-800'}`}
                >
                  {order.orderType === 'subscription'
                    ? locale === 'en'
                      ? 'Subscription'
                      : '订阅'
                    : locale === 'en'
                      ? 'Recharge'
                      : '充值'}
                </span>
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-sm">
                <span
                  className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${getStatusBadgeClass(order.status, !!dark)}`}
                >
                  {formatStatus(order.status, locale)}
                </span>
              </td>
              <td className={tdMuted}>
                {(() => {
                  const { channel, provider } = getPaymentDisplayInfo(order.paymentType, locale);
                  return (
                    <>
                      {channel}
                      {provider && (
                        <span className={dark ? 'ml-1 text-xs text-slate-500' : 'ml-1 text-xs text-slate-400'}>
                          {provider}
                        </span>
                      )}
                    </>
                  );
                })()}
              </td>
              <td className={tdMuted}>{order.srcHost || '-'}</td>
              <td className={tdMuted}>{formatCreatedAt(order.createdAt, locale)}</td>
              <td className="whitespace-nowrap px-4 py-3 text-sm">
                <div className="flex gap-1">
                  {order.rechargeRetryable && (
                    <button
                      onClick={() => onRetry(order.id)}
                      className={`rounded px-2 py-1 text-xs ${dark ? 'bg-blue-500/20 text-blue-300 hover:bg-blue-500/30' : 'bg-blue-100 text-blue-700 hover:bg-blue-200'}`}
                    >
                      {text.retry}
                    </button>
                  )}
                  {order.status === 'PENDING' && (
                    <button
                      onClick={() => onCancel(order.id)}
                      className={`rounded px-2 py-1 text-xs ${dark ? 'bg-red-500/20 text-red-300 hover:bg-red-500/30' : 'bg-red-100 text-red-700 hover:bg-red-200'}`}
                    >
                      {text.cancel}
                    </button>
                  )}
                  {order.status === 'REFUND_REQUESTED' && order.refundAmount != null && (
                    <span
                      className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${dark ? 'bg-violet-500/15 text-violet-300' : 'bg-violet-50 text-violet-700'}`}
                    >
                      {currency}
                      {order.refundAmount.toFixed(2)}
                    </span>
                  )}
                  {order.status === 'REFUND_REQUESTED' && (
                    <button
                      onClick={() => onRefund(order.id)}
                      className={`rounded px-2 py-1 text-xs ${dark ? 'bg-violet-500/20 text-violet-300 hover:bg-violet-500/30' : 'bg-violet-100 text-violet-700 hover:bg-violet-200'}`}
                    >
                      {text.approveRefund}
                    </button>
                  )}
                  {(order.status === 'COMPLETED' || order.status === 'REFUND_FAILED') && (
                    <button
                      onClick={() => onRefund(order.id)}
                      className={`rounded px-2 py-1 text-xs ${dark ? 'bg-violet-500/20 text-violet-300 hover:bg-violet-500/30' : 'bg-violet-100 text-violet-700 hover:bg-violet-200'}`}
                    >
                      {order.status === 'REFUND_FAILED' ? text.retryRefund : text.refund}
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {orders.length === 0 && (
        <div className={`py-12 text-center ${dark ? 'text-slate-500' : 'text-gray-500'}`}>{text.empty}</div>
      )}
    </div>
  );
}
