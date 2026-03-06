'use client';

import { getPaymentTypeLabel } from '@/lib/pay-utils';

interface AuditLog {
  id: string;
  action: string;
  detail: string | null;
  operator: string | null;
  createdAt: string;
}

interface OrderDetailProps {
  order: {
    id: string;
    userId: number;
    userName: string | null;
    userEmail: string | null;
    amount: number;
    status: string;
    paymentType: string;
    rechargeCode: string;
    paymentTradeNo: string | null;
    refundAmount: number | null;
    refundReason: string | null;
    refundAt: string | null;
    forceRefund: boolean;
    expiresAt: string;
    paidAt: string | null;
    completedAt: string | null;
    failedAt: string | null;
    failedReason: string | null;
    createdAt: string;
    updatedAt: string;
    clientIp: string | null;
    srcHost: string | null;
    srcUrl: string | null;
    paymentSuccess?: boolean;
    rechargeSuccess?: boolean;
    rechargeStatus?: string;
    auditLogs: AuditLog[];
  };
  onClose: () => void;
  dark?: boolean;
}

export default function OrderDetail({ order, onClose, dark }: OrderDetailProps) {
  const fields = [
    { label: '订单号', value: order.id },
    { label: '用户ID', value: order.userId },
    { label: '用户名', value: order.userName || '-' },
    { label: '邮箱', value: order.userEmail || '-' },
    { label: '金额', value: `¥${order.amount.toFixed(2)}` },
    { label: '状态', value: order.status },
    { label: 'Payment OK', value: order.paymentSuccess ? 'yes' : 'no' },
    { label: 'Recharge OK', value: order.rechargeSuccess ? 'yes' : 'no' },
    { label: 'Recharge Status', value: order.rechargeStatus || '-' },
    { label: '支付方式', value: getPaymentTypeLabel(order.paymentType) },
    { label: '充值码', value: order.rechargeCode },
    { label: '支付单号', value: order.paymentTradeNo || '-' },
    { label: '客户端IP', value: order.clientIp || '-' },
    { label: '来源域名', value: order.srcHost || '-' },
    { label: '来源页面', value: order.srcUrl || '-' },
    { label: '创建时间', value: new Date(order.createdAt).toLocaleString('zh-CN') },
    { label: '过期时间', value: new Date(order.expiresAt).toLocaleString('zh-CN') },
    { label: '支付时间', value: order.paidAt ? new Date(order.paidAt).toLocaleString('zh-CN') : '-' },
    { label: '完成时间', value: order.completedAt ? new Date(order.completedAt).toLocaleString('zh-CN') : '-' },
    { label: '失败时间', value: order.failedAt ? new Date(order.failedAt).toLocaleString('zh-CN') : '-' },
    { label: '失败原因', value: order.failedReason || '-' },
  ];

  if (order.refundAmount) {
    fields.push(
      { label: '退款金额', value: `¥${order.refundAmount.toFixed(2)}` },
      { label: '退款原因', value: order.refundReason || '-' },
      { label: '退款时间', value: order.refundAt ? new Date(order.refundAt).toLocaleString('zh-CN') : '-' },
      { label: '强制退款', value: order.forceRefund ? '是' : '否' },
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className={`max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-xl p-6 shadow-xl ${dark ? 'bg-slate-800 text-slate-100' : 'bg-white'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold">订单详情</h3>
          <button
            onClick={onClose}
            className={dark ? 'text-slate-400 hover:text-slate-200' : 'text-gray-400 hover:text-gray-600'}
          >
            ✕
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {fields.map(({ label, value }) => (
            <div key={label} className={`rounded-lg p-3 ${dark ? 'bg-slate-700/60' : 'bg-gray-50'}`}>
              <div className={`text-xs ${dark ? 'text-slate-400' : 'text-gray-500'}`}>{label}</div>
              <div className={`mt-1 break-all text-sm font-medium ${dark ? 'text-slate-200' : ''}`}>{value}</div>
            </div>
          ))}
        </div>

        {/* Audit Logs */}
        <div className="mt-6">
          <h4 className={`mb-3 font-medium ${dark ? 'text-slate-100' : 'text-gray-900'}`}>审计日志</h4>
          <div className="space-y-2">
            {order.auditLogs.map((log) => (
              <div
                key={log.id}
                className={`rounded-lg border p-3 ${dark ? 'border-slate-600 bg-slate-700/60' : 'border-gray-100 bg-gray-50'}`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{log.action}</span>
                  <span className={`text-xs ${dark ? 'text-slate-500' : 'text-gray-400'}`}>
                    {new Date(log.createdAt).toLocaleString('zh-CN')}
                  </span>
                </div>
                {log.detail && (
                  <div className={`mt-1 break-all text-xs ${dark ? 'text-slate-400' : 'text-gray-500'}`}>
                    {log.detail}
                  </div>
                )}
                {log.operator && (
                  <div className={`mt-1 text-xs ${dark ? 'text-slate-500' : 'text-gray-400'}`}>
                    操作者: {log.operator}
                  </div>
                )}
              </div>
            ))}
            {order.auditLogs.length === 0 && (
              <div className={`text-center text-sm ${dark ? 'text-slate-500' : 'text-gray-400'}`}>暂无日志</div>
            )}
          </div>
        </div>

        <button
          onClick={onClose}
          className={`mt-6 w-full rounded-lg border py-2 text-sm ${dark ? 'border-slate-600 text-slate-300 hover:bg-slate-700' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}
        >
          关闭
        </button>
      </div>
    </div>
  );
}
