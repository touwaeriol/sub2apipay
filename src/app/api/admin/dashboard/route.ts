import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { verifyAdminToken, unauthorizedResponse } from '@/lib/admin-auth';
import { OrderStatus } from '@prisma/client';
import { BIZ_TZ_NAME, getBizDayStartUTC, toBizDateStr } from '@/lib/time/biz-day';

export async function GET(request: NextRequest) {
  if (!(await verifyAdminToken(request))) return unauthorizedResponse();

  const searchParams = request.nextUrl.searchParams;
  const days = Math.min(365, Math.max(1, Number(searchParams.get('days') || '30')));

  const now = new Date();
  const todayStart = getBizDayStartUTC(now);
  const startDate = new Date(todayStart.getTime() - days * 24 * 60 * 60 * 1000);

  const paidStatuses: OrderStatus[] = [
    OrderStatus.PAID,
    OrderStatus.RECHARGING,
    OrderStatus.COMPLETED,
    OrderStatus.REFUNDING,
    OrderStatus.REFUNDED,
    OrderStatus.REFUND_FAILED,
  ];

  const [todayStats, totalStats, todayOrders, totalOrders, dailyRaw, leaderboardRaw, paymentMethodStats] =
    await Promise.all([
      // Today paid aggregate
      prisma.order.aggregate({
        where: { status: { in: paidStatuses }, paidAt: { gte: todayStart } },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      // Total paid aggregate
      prisma.order.aggregate({
        where: { status: { in: paidStatuses } },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      // Today total orders
      prisma.order.count({ where: { createdAt: { gte: todayStart } } }),
      // Total orders
      prisma.order.count(),
      // Daily series: use AT TIME ZONE to group by business timezone date
      // Prisma.raw() inlines the timezone name to avoid parameterization mismatch between SELECT and GROUP BY
      prisma.$queryRaw<{ date: string; amount: string; count: bigint }[]>`
        SELECT (paid_at AT TIME ZONE 'UTC' AT TIME ZONE ${Prisma.raw(`'${BIZ_TZ_NAME}'`)})::date::text as date,
               SUM(amount)::text as amount, COUNT(*) as count
        FROM orders
        WHERE status IN ('PAID', 'RECHARGING', 'COMPLETED', 'REFUNDING', 'REFUNDED', 'REFUND_FAILED')
          AND paid_at >= ${startDate}
        GROUP BY (paid_at AT TIME ZONE 'UTC' AT TIME ZONE ${Prisma.raw(`'${BIZ_TZ_NAME}'`)})::date
        ORDER BY date
      `,
      // Leaderboard: GROUP BY user_id only, MAX() for name/email
      prisma.$queryRaw<
        {
          user_id: number;
          user_name: string | null;
          user_email: string | null;
          total_amount: string;
          order_count: bigint;
        }[]
      >`
        SELECT user_id, MAX(user_name) as user_name, MAX(user_email) as user_email,
               SUM(amount)::text as total_amount, COUNT(*) as order_count
        FROM orders
        WHERE status IN ('PAID', 'RECHARGING', 'COMPLETED', 'REFUNDING', 'REFUNDED', 'REFUND_FAILED')
          AND paid_at >= ${startDate}
        GROUP BY user_id
        ORDER BY SUM(amount) DESC
        LIMIT 10
      `,
      // Payment method distribution (within time range)
      prisma.order.groupBy({
        by: ['paymentType'],
        where: { status: { in: paidStatuses }, paidAt: { gte: startDate } },
        _sum: { amount: true },
        _count: { _all: true },
      }),
    ]);

  // Fill missing dates for continuous line chart
  const dailyMap = new Map<string, { amount: number; count: number }>();
  for (const row of dailyRaw) {
    dailyMap.set(row.date, { amount: Number(row.amount), count: Number(row.count) });
  }

  const dailySeries: { date: string; amount: number; count: number }[] = [];
  const cursor = new Date(startDate);
  while (cursor <= now) {
    const dateStr = toBizDateStr(cursor);
    const entry = dailyMap.get(dateStr);
    dailySeries.push({ date: dateStr, amount: entry?.amount ?? 0, count: entry?.count ?? 0 });
    cursor.setTime(cursor.getTime() + 24 * 60 * 60 * 1000);
  }

  // Deduplicate: toBizDateStr on consecutive UTC days near midnight can produce the same biz date
  const seen = new Set<string>();
  const deduped = dailySeries.filter((d) => {
    if (seen.has(d.date)) return false;
    seen.add(d.date);
    return true;
  });

  // Calculate summary
  const todayPaidAmount = Number(todayStats._sum?.amount || 0);
  const todayPaidCount = todayStats._count._all;
  const totalPaidAmount = Number(totalStats._sum?.amount || 0);
  const totalPaidCount = totalStats._count._all;
  const successRate = totalOrders > 0 ? (totalPaidCount / totalOrders) * 100 : 0;
  const avgAmount = totalPaidCount > 0 ? totalPaidAmount / totalPaidCount : 0;

  // Payment method total for percentage calc
  const paymentTotal = paymentMethodStats.reduce((sum, m) => sum + Number(m._sum?.amount || 0), 0);

  return NextResponse.json({
    summary: {
      today: { amount: todayPaidAmount, orderCount: todayOrders, paidCount: todayPaidCount },
      total: { amount: totalPaidAmount, orderCount: totalOrders, paidCount: totalPaidCount },
      successRate: Math.round(successRate * 10) / 10,
      avgAmount: Math.round(avgAmount * 100) / 100,
    },
    dailySeries: deduped,
    leaderboard: leaderboardRaw.map((row) => ({
      userId: row.user_id,
      userName: row.user_name,
      userEmail: row.user_email,
      totalAmount: Number(row.total_amount),
      orderCount: Number(row.order_count),
    })),
    paymentMethods: paymentMethodStats.map((m) => {
      const amount = Number(m._sum?.amount || 0);
      return {
        paymentType: m.paymentType,
        amount,
        count: m._count._all,
        percentage: paymentTotal > 0 ? Math.round((amount / paymentTotal) * 1000) / 10 : 0,
      };
    }),
    meta: { days, generatedAt: now.toISOString() },
  });
}
