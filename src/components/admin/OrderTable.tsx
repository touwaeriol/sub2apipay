'use client';

import { useState } from 'react';

interface Order {
  id: string;
  userId: number;
  userName: string | null;
  userEmail: string | null;
  amount: number;
  status: string;
  paymentType: string;
  createdAt: string;
  paidAt: string | null;
  completedAt: string | null;
  failedReason: string | null;
  expiresAt: string;
  rechargeRetryable?: boolean;
}

interface OrderTableProps {
  orders: Order[];
  onRetry: (orderId: string) => void;
  onCancel: (orderId: string) => void;
  onViewDetail: (orderId: string) => void;
}

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  PENDING: { label: '待支付', className: 'bg-yellow-100 text-yellow-800' },
  PAID: { label: '已支付', className: 'bg-blue-100 text-blue-800' },
  RECHARGING: { label: '充值中', className: 'bg-blue-100 text-blue-800' },
  COMPLETED: { label: '已完成', className: 'bg-green-100 text-green-800' },
  EXPIRED: { label: '已超时', className: 'bg-gray-100 text-gray-800' },
  CANCELLED: { label: '已取消', className: 'bg-gray-100 text-gray-800' },
  FAILED: { label: '充值失败', className: 'bg-red-100 text-red-800' },
  REFUNDING: { label: '退款中', className: 'bg-orange-100 text-orange-800' },
  REFUNDED: { label: '已退款', className: 'bg-purple-100 text-purple-800' },
  REFUND_FAILED: { label: '退款失败', className: 'bg-red-100 text-red-800' },
};

export default function OrderTable({ orders, onRetry, onCancel, onViewDetail }: OrderTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">订单号</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">用户</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">金额</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">状态</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">支付方式</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">创建时间</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">操作</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 bg-white">
          {orders.map((order) => {
            const statusInfo = STATUS_LABELS[order.status] || {
              label: order.status,
              className: 'bg-gray-100 text-gray-800',
            };
            return (
              <tr key={order.id} className="hover:bg-gray-50">
                <td className="whitespace-nowrap px-4 py-3 text-sm">
                  <button onClick={() => onViewDetail(order.id)} className="text-blue-600 hover:underline">
                    {order.id.slice(0, 12)}...
                  </button>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-sm">
                  <div>{order.userName || '-'}</div>
                  <div className="text-xs text-gray-400">{order.userEmail || `ID: ${order.userId}`}</div>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-sm font-medium">¥{order.amount.toFixed(2)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-sm">
                  <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${statusInfo.className}`}>
                    {statusInfo.label}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                  {order.paymentType === 'alipay' ? '支付宝' : '微信支付'}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                  {new Date(order.createdAt).toLocaleString('zh-CN')}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-sm">
                  <div className="flex gap-1">
                    {order.rechargeRetryable && (
                      <button
                        onClick={() => onRetry(order.id)}
                        className="rounded bg-blue-100 px-2 py-1 text-xs text-blue-700 hover:bg-blue-200"
                      >
                        重试
                      </button>
                    )}
                    {order.status === 'PENDING' && (
                      <button
                        onClick={() => onCancel(order.id)}
                        className="rounded bg-red-100 px-2 py-1 text-xs text-red-700 hover:bg-red-200"
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
      {orders.length === 0 && <div className="py-12 text-center text-gray-500">暂无订单</div>}
    </div>
  );
}
