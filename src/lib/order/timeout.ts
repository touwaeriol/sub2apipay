import { prisma } from '@/lib/db';
import { initPaymentProviders, paymentRegistry } from '@/lib/payment';
import type { PaymentType } from '@/lib/payment';
import { confirmPayment } from './service';

const INTERVAL_MS = 30_000; // 30 seconds
let timer: ReturnType<typeof setInterval> | null = null;

export async function expireOrders(): Promise<number> {
  const orders = await prisma.order.findMany({
    where: {
      status: 'PENDING',
      expiresAt: { lt: new Date() },
    },
    select: {
      id: true,
      paymentTradeNo: true,
      paymentType: true,
    },
  });

  if (orders.length === 0) return 0;

  let expiredCount = 0;

  for (const order of orders) {
    try {
      // If order has a payment on the platform, check its actual status
      if (order.paymentTradeNo && order.paymentType) {
        try {
          initPaymentProviders();
          const provider = paymentRegistry.getProvider(order.paymentType as PaymentType);

          // Query the real payment status before expiring
          const queryResult = await provider.queryOrder(order.paymentTradeNo);

          if (queryResult.status === 'paid') {
            // User already paid — process as success instead of expiring
            await confirmPayment({
              orderId: order.id,
              tradeNo: order.paymentTradeNo,
              paidAmount: queryResult.amount,
              providerName: provider.name,
            });
            console.log(`Order ${order.id} was paid during timeout, processed as success`);
            continue;
          }

          // Not paid — cancel on the platform
          if (provider.cancelPayment) {
            try {
              await provider.cancelPayment(order.paymentTradeNo);
            } catch (cancelErr) {
              // Cancel may fail if session already expired on platform side — that's fine
              console.warn(`Failed to cancel payment for order ${order.id}:`, cancelErr);
            }
          }
        } catch (platformErr) {
          // Platform unreachable — still expire the order locally
          console.warn(`Platform check failed for order ${order.id}, expiring anyway:`, platformErr);
        }
      }

      // Mark as expired in database (WHERE status='PENDING' ensures idempotency)
      const result = await prisma.order.updateMany({
        where: { id: order.id, status: 'PENDING' },
        data: { status: 'EXPIRED' },
      });

      if (result.count > 0) expiredCount++;
    } catch (err) {
      console.error(`Error expiring order ${order.id}:`, err);
    }
  }

  if (expiredCount > 0) {
    console.log(`Expired ${expiredCount} orders`);
  }

  return expiredCount;
}

export function startTimeoutScheduler(): void {
  if (timer) return;

  // Run immediately on startup
  expireOrders().catch(console.error);

  // Then run every 30 seconds
  timer = setInterval(() => {
    expireOrders().catch(console.error);
  }, INTERVAL_MS);

  console.log('Order timeout scheduler started');
}

export function stopTimeoutScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
    console.log('Order timeout scheduler stopped');
  }
}
