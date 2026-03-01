import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyAdminToken, unauthorizedResponse } from '@/lib/admin-auth';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!verifyAdminToken(request)) return unauthorizedResponse();

  const { id } = await params;

  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      auditLogs: {
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  if (!order) {
    return NextResponse.json({ error: '订单不存在' }, { status: 404 });
  }

  return NextResponse.json({
    ...order,
    amount: Number(order.amount),
    refundAmount: order.refundAmount ? Number(order.refundAmount) : null,
  });
}
