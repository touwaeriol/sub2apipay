import { prisma } from '@/lib/db';
import { ORDER_STATUS } from '@/lib/constants';
import { cancelOrderCore } from './service';

const INTERVAL_MS = 30_000; // 30 seconds
let timer: ReturnType<typeof setInterval> | null = null;

export async function expireOrders(): Promise<number> {
  const orders = await prisma.order.findMany({
    where: {
      status: ORDER_STATUS.PENDING,
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
      const outcome = await cancelOrderCore({
        orderId: order.id,
        paymentTradeNo: order.paymentTradeNo,
        paymentType: order.paymentType,
        finalStatus: ORDER_STATUS.EXPIRED,
        operator: 'timeout',
        auditDetail: 'Order expired',
      });

      if (outcome === 'cancelled') expiredCount++;
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
