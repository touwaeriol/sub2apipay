'use client';

import { useState } from 'react';

interface RefundDialogProps {
  orderId: string;
  amount: number;
  onConfirm: (reason: string, force: boolean) => Promise<void>;
  onCancel: () => void;
  warning?: string;
  requireForce?: boolean;
}

export default function RefundDialog({
  orderId,
  amount,
  onConfirm,
  onCancel,
  warning,
  requireForce,
}: RefundDialogProps) {
  const [reason, setReason] = useState('');
  const [force, setForce] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await onConfirm(reason, force);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onCancel}>
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-gray-900">确认退款</h3>

        <div className="mt-4 space-y-3">
          <div className="rounded-lg bg-gray-50 p-3">
            <div className="text-sm text-gray-500">订单号</div>
            <div className="text-sm font-mono">{orderId}</div>
          </div>

          <div className="rounded-lg bg-gray-50 p-3">
            <div className="text-sm text-gray-500">退款金额</div>
            <div className="text-lg font-bold text-red-600">¥{amount.toFixed(2)}</div>
          </div>

          {warning && <div className="rounded-lg bg-yellow-50 p-3 text-sm text-yellow-700">{warning}</div>}

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">退款原因</label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="请输入退款原因（可选）"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>

          {requireForce && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={force}
                onChange={(e) => setForce(e.target.checked)}
                className="rounded border-gray-300"
              />
              <span className="text-red-600">强制退款（余额可能扣为负数）</span>
            </label>
          )}
        </div>

        <div className="mt-6 flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 rounded-lg border border-gray-300 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            取消
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading || (requireForce && !force)}
            className="flex-1 rounded-lg bg-red-600 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-gray-300"
          >
            {loading ? '处理中...' : '确认退款'}
          </button>
        </div>
      </div>
    </div>
  );
}
