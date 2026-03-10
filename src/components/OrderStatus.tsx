
'use client';

import { useEffect, useState } from 'react';
import type { Locale } from '@/lib/locale';
import type { PublicOrderStatusSnapshot } from '@/lib/order/status';

interface OrderStatusProps {
  orderId: string;
  order: PublicOrderStatusSnapshot;
  statusAccessToken?: string;
  onBack: () => void;
  onStateChange?: (order: PublicOrderStatusSnapshot) => void;
  dark?: boolean;
  locale?: Locale;
}

function buildOrderStatusUrl(orderId: string, statusAccessToken?: string): string {
  const query = new URLSearchParams();
  if (statusAccessToken) {
    query.set('access_token', statusAccessToken);
  }
  const suffix = query.toString();
  return suffix ? `/api/orders/${orderId}?${suffix}` : `/api/orders/${orderId}`;
}

function getStatusConfig(order: PublicOrderStatusSnapshot, locale: Locale) {
  if (order.rechargeSuccess) {
    return locale === 'en'
      ? { label: 'Recharge Successful', color: 'text-green-600', icon: '✓', message: 'Your balance has been credited. Thank you for your payment.' }
      : { label: '充值成功', color: 'text-green-600', icon: '✓', message: '余额已到账，感谢您的充值！' };
  }

  if (order.paymentSuccess) {
    if (order.rechargeStatus === 'paid_pending' || order.rechargeStatus === 'recharging') {
      return locale === 'en'
        ? { label: 'Recharging', color: 'text-blue-600', icon: '⟳', message: 'Payment received. Recharging your balance...' }
        : { label: '充值中', color: 'text-blue-600', icon: '⟳', message: '支付成功，正在充值余额中，请稍候...' };
    }

    if (order.rechargeStatus === 'failed') {
      return locale === 'en'
        ? { label: 'Payment Successful', color: 'text-amber-600', icon: '!', message: 'Payment completed, but the balance top-up has not finished yet. The system may retry automatically. Please check the order list later or contact the administrator if it remains unresolved.' }
        : { label: '支付成功', color: 'text-amber-600', icon: '!', message: '支付已完成，但余额充值暂未完成。系统可能会自动重试，请稍后在订单列表查看；如长时间未到账请联系管理员。' };
    }
  }

  if (order.status === 'FAILED') {
    return locale === 'en'
      ? { label: 'Payment Failed', color: 'text-red-600', icon: '✗', message: 'Payment was not completed. Please try again. If funds were deducted but not credited, contact the administrator.' }
      : { label: '支付失败', color: 'text-red-600', icon: '✗', message: '支付未完成，请重新发起支付；如已扣款未到账，请联系管理员处理。' };
  }

  if (order.status === 'PENDING') {
    return locale === 'en'
      ? { label: 'Awaiting Payment', color: 'text-yellow-600', icon: '⏳', message: 'The order has not been paid yet.' }
      : { label: '等待支付', color: 'text-yellow-600', icon: '⏳', message: '订单尚未完成支付。' };
  }

  if (order.status === 'EXPIRED') {
    return locale === 'en'
      ? { label: 'Order Expired', color: 'text-gray-500', icon: '⏰', message: 'This order has expired. Please create a new one.' }
      : { label: '订单超时', color: 'text-gray-500', icon: '⏰', message: '订单已超时，请重新创建订单。' };
  }

  if (order.status === 'CANCELLED') {
    return locale === 'en'
      ? { label: 'Cancelled', color: 'text-gray-500', icon: '✗', message: 'The order has been cancelled.' }
      : { label: '已取消', color: 'text-gray-500', icon: '✗', message: '订单已取消。' };
  }

  return locale === 'en'
    ? { label: 'Payment Error', color: 'text-red-600', icon: '✗', message: 'Payment status is abnormal. Please contact the administrator.' }
    : { label: '支付异常', color: 'text-red-600', icon: '✗', message: '支付状态异常，请联系管理员处理。' };
}

export default function OrderStatus({
  orderId,
  order,
  statusAccessToken,
  onBack,
  onStateChange,
  dark = false,
  locale = 'zh',
}: OrderStatusProps) {
  const [currentOrder, setCurrentOrder] = useState(order);

  useEffect(() => {
    setCurrentOrder(order);
  }, [order]);

  useEffect(() => {
    if (!orderId || !currentOrder.paymentSuccess || currentOrder.rechargeSuccess) {
      return;
    }

    let cancelled = false;

    const refreshOrder = async () => {
      try {
        const response = await fetch(buildOrderStatusUrl(orderId, statusAccessToken));
        if (!response.ok) return;
        const nextOrder = (await response.json()) as PublicOrderStatusSnapshot;
        if (cancelled) return;
        setCurrentOrder(nextOrder);
        onStateChange?.(nextOrder);
      } catch {
      }
    };

    refreshOrder();
    const timer = setInterval(refreshOrder, 3000);
    const timeout = setTimeout(() => clearInterval(timer), 30000);

    return () => {
      cancelled = true;
      clearInterval(timer);
      clearTimeout(timeout);
    };
  }, [orderId, currentOrder.paymentSuccess, currentOrder.rechargeSuccess, onStateChange, statusAccessToken]);

  const config = getStatusConfig(currentOrder, locale);
  const doneLabel = locale === 'en' ? 'Done' : '完成';
  const backLabel = locale === 'en' ? 'Back to Recharge' : '返回充值';

  return (
    <div className="flex flex-col items-center space-y-4 py-8">
      <div className={`text-6xl ${config.color}`}>{config.icon}</div>
      <h2 className={`text-xl font-bold ${config.color}`}>{config.label}</h2>
      <p className={['text-center', dark ? 'text-slate-400' : 'text-gray-500'].join(' ')}>{config.message}</p>
      <button
        onClick={onBack}
        className={[
          'mt-4 w-full rounded-lg py-3 font-medium text-white',
          dark ? 'bg-blue-600 hover:bg-blue-500' : 'bg-blue-600 hover:bg-blue-700',
        ].join(' ')}
      >
        {currentOrder.rechargeSuccess ? doneLabel : backLabel}
      </button>
    </div>
  );
}
