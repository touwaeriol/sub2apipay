'use client';

import { useEffect, useState } from 'react';
import type { Locale } from '@/lib/locale';
import {
  formatStatus,
  formatCreatedAt,
  getStatusBadgeClass,
  getPaymentDisplayInfo,
  type MyOrder,
} from '@/lib/pay-utils';

interface OrderTableProps {
  isDark: boolean;
  locale: Locale;
  loading: boolean;
  error: string;
  orders: MyOrder[];
  userBalance: number;
  onRefundRequest: (orderId: string, amount: number, reason: string) => Promise<void>;
}

export default function OrderTable({ isDark, locale, loading, error, orders, userBalance, onRefundRequest }: OrderTableProps) {
  const text =
    locale === 'en'
      ? {
          empty: 'No matching orders found',
          orderId: 'Order ID',
          amount: 'Amount',
          payment: 'Payment Method',
          status: 'Status',
          createdAt: 'Created At',
          actions: 'Actions',
          refundRequest: 'Request Refund',
          requested: 'Requested',
          partialRefunded: 'Partially refunded',
          dialogTitle: 'Refund Request',
          refundAmount: 'Refund Amount',
          refundReason: 'Refund Reason',
          refundReasonPlaceholder: 'Enter refund reason (optional)',
          currentBalance: 'Current Balance',
          orderAmount: 'Order Amount',
          cancel: 'Cancel',
          submit: 'Submit Request',
          submitting: 'Submitting...',
          refundAmountInvalid: 'Refund amount must be greater than 0',
          refundAmountExceedOrder: 'Refund amount cannot exceed order amount',
          refundAmountExceedBalance: 'Refund amount cannot exceed current balance',
        }
      : {
          empty: '暂无符合条件的订单记录',
          orderId: '订单号',
          amount: '金额',
          payment: '支付方式',
          status: '状态',
          createdAt: '创建时间',
          actions: '操作',
          refundRequest: '申请退款',
          requested: '已申请',
          partialRefunded: '已部分退款',
          dialogTitle: '申请退款',
          refundAmount: '退款金额',
          refundReason: '退款原因',
          refundReasonPlaceholder: '请输入退款原因（可选）',
          currentBalance: '当前余额',
          orderAmount: '订单金额',
          cancel: '取消',
          submit: '提交申请',
          submitting: '提交中...',
          refundAmountInvalid: '退款金额必须大于 0',
          refundAmountExceedOrder: '退款金额不能超过订单金额',
          refundAmountExceedBalance: '退款金额不能超过当前余额',
        };

  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [refundOrder, setRefundOrder] = useState<MyOrder | null>(null);
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('');

  useEffect(() => {
    if (!refundOrder) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && submittingId !== refundOrder.id) {
        setRefundOrder(null);
        setRefundAmount('');
        setRefundReason('');
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [refundOrder, submittingId]);

  const parsedRefundAmount = Number(refundAmount);
  const amountError = !refundOrder
    ? ''
    : !Number.isFinite(parsedRefundAmount) || parsedRefundAmount <= 0
      ? text.refundAmountInvalid
      : parsedRefundAmount > refundOrder.amount
        ? text.refundAmountExceedOrder
        : parsedRefundAmount > userBalance
          ? text.refundAmountExceedBalance
          : '';

  const openRefundDialog = (order: MyOrder) => {
    setRefundOrder(order);
    setRefundAmount((order.refundAmount ?? order.amount).toFixed(2));
    setRefundReason(order.refundRequestReason ?? '');
  };

  const closeRefundDialog = () => {
    if (refundOrder && submittingId === refundOrder.id) return;
    setRefundOrder(null);
    setRefundAmount('');
    setRefundReason('');
  };

  const handleRefundRequest = async () => {
    if (!refundOrder || amountError) return;
    setSubmittingId(refundOrder.id);
    try {
      await onRefundRequest(refundOrder.id, parsedRefundAmount, refundReason);
      setRefundOrder(null);
      setRefundAmount('');
      setRefundReason('');
    } finally {
      setSubmittingId(null);
    }
  };

  return (
    <>
      <div
        className={[
          'rounded-2xl border p-3 sm:p-4',
          isDark ? 'border-slate-700 bg-slate-800/60' : 'border-slate-200 bg-slate-50/80',
        ].join(' ')}
      >
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <div
              className={[
                'h-6 w-6 animate-spin rounded-full border-2 border-t-transparent',
                isDark ? 'border-slate-400' : 'border-slate-500',
              ].join(' ')}
            />
          </div>
        ) : error ? (
          <div
            className={[
              'rounded-xl border border-dashed px-4 py-10 text-center text-sm',
              isDark ? 'border-amber-500/40 text-amber-200' : 'border-amber-300 text-amber-700',
            ].join(' ')}
          >
            {error}
          </div>
        ) : orders.length === 0 ? (
          <div
            className={[
              'rounded-xl border border-dashed px-4 py-10 text-center text-sm',
              isDark ? 'border-slate-600 text-slate-400' : 'border-slate-300 text-slate-500',
            ].join(' ')}
          >
            {text.empty}
          </div>
        ) : (
          <>
            <div
              className={[
                'hidden rounded-xl px-4 py-2 text-xs font-medium md:grid md:grid-cols-[1.2fr_0.6fr_0.8fr_0.8fr_1fr_0.8fr]',
                isDark ? 'text-slate-300' : 'text-slate-600',
              ].join(' ')}
            >
              <span>{text.orderId}</span>
              <span>{text.amount}</span>
              <span>{text.payment}</span>
              <span>{text.status}</span>
              <span>{text.createdAt}</span>
              <span>{text.actions}</span>
            </div>
            <div className="space-y-2 md:space-y-0">
              {orders.map((order) => (
                <div
                  key={order.id}
                  className={[
                    'border-t px-4 py-3 first:border-t-0 md:grid md:grid-cols-[1.2fr_0.6fr_0.8fr_0.8fr_1fr_0.8fr] md:items-center',
                    isDark ? 'border-slate-700 text-slate-200' : 'border-slate-200 text-slate-700',
                  ].join(' ')}
                >
                  <div className="font-medium">#{order.id.slice(0, 12)}</div>
                  <div className="font-semibold">¥{order.amount.toFixed(2)}</div>
                  <div>{getPaymentDisplayInfo(order.paymentType, locale).channel}</div>
                  <div>
                    <span className={['rounded-full px-2 py-0.5 text-xs', getStatusBadgeClass(order.status, isDark)].join(' ')}>
                      {formatStatus(order.status, locale)}
                    </span>
                    {(order.status === 'PARTIALLY_REFUNDED' || order.status === 'REFUND_REQUESTED') && order.refundAmount != null && (
                      <div className={['mt-1 text-xs', isDark ? 'text-fuchsia-300' : 'text-fuchsia-700'].join(' ')}>
                        {order.status === 'PARTIALLY_REFUNDED' ? text.partialRefunded : text.requested}: ¥{order.refundAmount.toFixed(2)}
                      </div>
                    )}
                  </div>
                  <div className={isDark ? 'text-slate-300' : 'text-slate-600'}>{formatCreatedAt(order.createdAt, locale)}</div>
                  <div>
                    {order.canRefundRequest ? (
                      <button
                        type="button"
                        disabled={submittingId === order.id}
                        onClick={() => openRefundDialog(order)}
                        className={[
                          'rounded px-2 py-1 text-xs',
                          isDark
                            ? 'bg-red-500/20 text-red-300 hover:bg-red-500/30 disabled:opacity-50'
                            : 'bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-50',
                        ].join(' ')}
                      >
                        {submittingId === order.id ? '...' : text.refundRequest}
                      </button>
                    ) : order.status === 'REFUND_REQUESTED' ? (
                      <span className={isDark ? 'text-violet-300 text-xs' : 'text-violet-700 text-xs'}>{text.requested}</span>
                    ) : (
                      <span className={isDark ? 'text-slate-500 text-xs' : 'text-slate-400 text-xs'}>-</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {refundOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className={['w-full max-w-md rounded-xl p-6 shadow-xl', isDark ? 'bg-slate-900' : 'bg-white'].join(' ')}>
            <h3 className={['text-lg font-bold', isDark ? 'text-slate-100' : 'text-gray-900'].join(' ')}>{text.dialogTitle}</h3>

            <div className="mt-4 space-y-3">
              <div className={['grid grid-cols-2 gap-3 text-sm', isDark ? 'text-slate-300' : 'text-gray-700'].join(' ')}>
                <div className={['rounded-lg p-3', isDark ? 'bg-slate-800' : 'bg-gray-50'].join(' ')}>
                  <div className={isDark ? 'text-slate-400' : 'text-gray-500'}>{text.orderAmount}</div>
                  <div className="mt-1 font-semibold">¥{refundOrder.amount.toFixed(2)}</div>
                </div>
                <div className={['rounded-lg p-3', isDark ? 'bg-slate-800' : 'bg-gray-50'].join(' ')}>
                  <div className={isDark ? 'text-slate-400' : 'text-gray-500'}>{text.currentBalance}</div>
                  <div className="mt-1 font-semibold">¥{userBalance.toFixed(2)}</div>
                </div>
              </div>

              <div>
                <label className={['mb-1 block text-sm font-medium', isDark ? 'text-slate-300' : 'text-gray-700'].join(' ')}>
                  {text.refundAmount}
                </label>
                <input
                  type="number"
                  min="0.01"
                  max={Math.min(refundOrder.amount, userBalance).toFixed(2)}
                  step="0.01"
                  value={refundAmount}
                  onChange={(e) => setRefundAmount(e.target.value)}
                  className={[
                    'w-full rounded-lg border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none',
                    isDark ? 'border-slate-600 bg-slate-800 text-slate-100' : 'border-gray-300 bg-white text-gray-900',
                  ].join(' ')}
                />
                {amountError && <div className={['mt-1 text-xs', isDark ? 'text-red-400' : 'text-red-600'].join(' ')}>{amountError}</div>}
              </div>

              <div>
                <label className={['mb-1 block text-sm font-medium', isDark ? 'text-slate-300' : 'text-gray-700'].join(' ')}>
                  {text.refundReason}
                </label>
                <textarea
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  placeholder={text.refundReasonPlaceholder}
                  rows={3}
                  className={[
                    'w-full rounded-lg border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none',
                    isDark ? 'border-slate-600 bg-slate-800 text-slate-100' : 'border-gray-300 bg-white text-gray-900',
                  ].join(' ')}
                />
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={closeRefundDialog}
                disabled={submittingId === refundOrder.id}
                className={[
                  'flex-1 rounded-lg border py-2 text-sm',
                  isDark ? 'border-slate-600 text-slate-300 hover:bg-slate-800' : 'border-gray-300 text-gray-600 hover:bg-gray-50',
                ].join(' ')}
              >
                {text.cancel}
              </button>
              <button
                type="button"
                onClick={handleRefundRequest}
                disabled={submittingId === refundOrder.id || !!amountError}
                className={[
                  'flex-1 rounded-lg py-2 text-sm font-medium text-white disabled:cursor-not-allowed',
                  isDark ? 'bg-red-600/90 hover:bg-red-700 disabled:bg-slate-700 disabled:text-slate-500' : 'bg-red-600 hover:bg-red-700 disabled:bg-gray-300 disabled:text-gray-400',
                ].join(' ')}
              >
                {submittingId === refundOrder.id ? text.submitting : text.submit}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
