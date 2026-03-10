import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyAdminToken } from '@/lib/admin-auth';
import { deriveOrderState } from '@/lib/order/status';
import { ORDER_STATUS_ACCESS_QUERY_KEY, verifyOrderStatusAccessToken } from '@/lib/order/status-access';

/**
 * 订单状态轮询接口。
 *
 * 返回最小必要信息供前端判断：
 * - 原始订单状态（status / expiresAt）
 * - 支付是否成功（paymentSuccess）
 * - 充值是否成功 / 当前充值阶段（rechargeSuccess / rechargeStatus）
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const accessToken = request.nextUrl.searchParams.get(ORDER_STATUS_ACCESS_QUERY_KEY);
  const isAuthorized = verifyOrderStatusAccessToken(id, accessToken) || (await verifyAdminToken(request));

  if (!isAuthorized) {
    return NextResponse.json({ error: '未授权访问该订单状态' }, { status: 401 });
  }

  const order = await prisma.order.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      expiresAt: true,
      paidAt: true,
      completedAt: true,
    },
  });

  if (!order) {
    return NextResponse.json({ error: '订单不存在' }, { status: 404 });
  }

  const derived = deriveOrderState(order);

  return NextResponse.json({
    id: order.id,
    status: order.status,
    expiresAt: order.expiresAt,
    paymentSuccess: derived.paymentSuccess,
    rechargeSuccess: derived.rechargeSuccess,
    rechargeStatus: derived.rechargeStatus,
  });
}
