import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUserByToken } from '@/lib/sub2api/client';
import { deriveOrderState, isRechargeRetryable } from '@/lib/order/status';

const VALID_PAGE_SIZES = [20, 50, 100];

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const token = searchParams.get('token')?.trim();
  if (!token) {
    return NextResponse.json({ error: 'token is required' }, { status: 400 });
  }

  const page = Math.max(1, Number(searchParams.get('page') || '1'));
  const rawPageSize = Number(searchParams.get('page_size') || '20');
  const pageSize = VALID_PAGE_SIZES.includes(rawPageSize) ? rawPageSize : 20;

  // 单独处理认证，区分认证失败和其他错误
  let user;
  try {
    user = await getCurrentUserByToken(token);
  } catch (error) {
    console.error('Auth error in /api/orders/my:', error);
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    const where = { userId: user.id };

    const [orders, total, statusGroups] = await Promise.all([
      prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          amount: true,
          status: true,
          paymentType: true,
          createdAt: true,
          paidAt: true,
          completedAt: true,
        },
      }),
      prisma.order.count({ where }),
      prisma.order.groupBy({ by: ['status'], where, _count: true }),
    ]);

    const sc = Object.fromEntries(statusGroups.map((g) => [g.status, g._count]));

    return NextResponse.json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        displayName: user.username || user.email || `User #${user.id}`,
        balance: user.balance,
      },
      orders: orders.map((item) => {
        const derived = deriveOrderState(item);
        return {
          id: item.id,
          amount: Number(item.amount),
          status: item.status,
          paymentType: item.paymentType,
          createdAt: item.createdAt,
          paymentSuccess: derived.paymentSuccess,
          rechargeSuccess: derived.rechargeSuccess,
          rechargeStatus: derived.rechargeStatus,
          rechargeRetryable: isRechargeRetryable(item),
        };
      }),
      summary: {
        total,
        pending: sc['PENDING'] || 0,
        completed: (sc['COMPLETED'] || 0) + (sc['PAID'] || 0) + (sc['RECHARGING'] || 0),
        failed: (sc['FAILED'] || 0) + (sc['CANCELLED'] || 0) + (sc['EXPIRED'] || 0),
      },
      page,
      page_size: pageSize,
      total_pages: Math.ceil(total / pageSize),
    });
  } catch (error) {
    console.error('Get my orders error:', error);
    return NextResponse.json({ error: '获取订单失败' }, { status: 500 });
  }
}
