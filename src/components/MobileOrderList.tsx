'use client';

import { useMemo, useState } from 'react';
import OrderFilterBar from '@/components/OrderFilterBar';
import { formatStatus, formatCreatedAt, getStatusBadgeClass, type MyOrder, type OrderStatusFilter } from '@/lib/pay-utils';

interface MobileOrderListProps {
  isDark: boolean;
  hasToken: boolean;
  orders: MyOrder[];
  onRefresh: () => void;
}

export default function MobileOrderList({ isDark, hasToken, orders, onRefresh }: MobileOrderListProps) {
  const [activeFilter, setActiveFilter] = useState<OrderStatusFilter>('ALL');

  const filteredOrders = useMemo(() => {
    if (activeFilter === 'ALL') return orders;
    return orders.filter((item) => item.status === activeFilter);
  }, [orders, activeFilter]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className={['text-base font-semibold', isDark ? 'text-slate-100' : 'text-slate-900'].join(' ')}>我的订单</h3>
        <button
          type="button"
          onClick={onRefresh}
          className={[
            'rounded-lg border px-2.5 py-1 text-xs font-medium',
            isDark ? 'border-slate-600 text-slate-200 hover:bg-slate-800' : 'border-slate-300 text-slate-700 hover:bg-slate-100',
          ].join(' ')}
        >
          刷新
        </button>
      </div>

      <OrderFilterBar isDark={isDark} activeFilter={activeFilter} onChange={setActiveFilter} />

      {!hasToken ? (
        <div className={['rounded-xl border border-dashed px-4 py-8 text-center text-sm', isDark ? 'border-amber-500/40 text-amber-200' : 'border-amber-300 text-amber-700'].join(' ')}>
          当前链接未携带登录 token，无法查询"我的订单"。
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className={['rounded-xl border border-dashed px-4 py-8 text-center text-sm', isDark ? 'border-slate-600 text-slate-400' : 'border-slate-300 text-slate-500'].join(' ')}>
          暂无符合条件的订单记录
        </div>
      ) : (
        <div className="space-y-2">
          {filteredOrders.map((order) => (
            <div
              key={order.id}
              className={['rounded-xl border px-3 py-3', isDark ? 'border-slate-700 bg-slate-900/70' : 'border-slate-200 bg-white'].join(' ')}
            >
              <div className="flex items-center justify-between">
                <span className="text-2xl font-semibold">¥{order.amount.toFixed(2)}</span>
                <span className={['rounded-full px-2 py-0.5 text-xs', getStatusBadgeClass(order.status, isDark)].join(' ')}>
                  {formatStatus(order.status)}
                </span>
              </div>
              <div className={['mt-1 text-sm', isDark ? 'text-slate-300' : 'text-slate-600'].join(' ')}>
                {order.paymentType}
              </div>
              <div className={['mt-0.5 text-xs', isDark ? 'text-slate-400' : 'text-slate-500'].join(' ')}>
                {formatCreatedAt(order.createdAt)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
