'use client';

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
    paymentSuccess?: boolean;
    rechargeSuccess?: boolean;
    rechargeStatus?: string;
    auditLogs: AuditLog[];
  };
  onClose: () => void;
}

export default function OrderDetail({ order, onClose }: OrderDetailProps) {
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
    { label: '支付方式', value: order.paymentType === 'alipay' ? '支付宝' : '微信支付' },
    { label: '充值码', value: order.rechargeCode },
    { label: '支付单号', value: order.paymentTradeNo || '-' },
    { label: '客户端IP', value: order.clientIp || '-' },
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
        className="max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold">订单详情</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {fields.map(({ label, value }) => (
            <div key={label} className="rounded-lg bg-gray-50 p-3">
              <div className="text-xs text-gray-500">{label}</div>
              <div className="mt-1 break-all text-sm font-medium">{value}</div>
            </div>
          ))}
        </div>

        {/* Audit Logs */}
        <div className="mt-6">
          <h4 className="mb-3 font-medium text-gray-900">审计日志</h4>
          <div className="space-y-2">
            {order.auditLogs.map((log) => (
              <div key={log.id} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{log.action}</span>
                  <span className="text-xs text-gray-400">
                    {new Date(log.createdAt).toLocaleString('zh-CN')}
                  </span>
                </div>
                {log.detail && (
                  <div className="mt-1 break-all text-xs text-gray-500">{log.detail}</div>
                )}
                {log.operator && (
                  <div className="mt-1 text-xs text-gray-400">操作者: {log.operator}</div>
                )}
              </div>
            ))}
            {order.auditLogs.length === 0 && (
              <div className="text-center text-sm text-gray-400">暂无日志</div>
            )}
          </div>
        </div>

        <button
          onClick={onClose}
          className="mt-6 w-full rounded-lg border border-gray-300 py-2 text-sm text-gray-600 hover:bg-gray-50"
        >
          关闭
        </button>
      </div>
    </div>
  );
}
