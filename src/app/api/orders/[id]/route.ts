import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

/**
 * 订单状态轮询接口 — 仅返回 status / expiresAt 两个字段。
 *
 * 安全考虑：
 * - 订单 ID 使用 CUID（25 位随机字符），具有足够的不可预测性，
 *   暴力猜测的成本远高于信息价值。
 * - 仅暴露 status 和 expiresAt，不涉及用户隐私或金额信息。
 * - 前端 PaymentQRCode 组件每 2 秒轮询此接口以更新支付状态，
 *   添加认证会增加不必要的复杂度且影响轮询性能。
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const order = await prisma.order.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      expiresAt: true,
    },
  });

  if (!order) {
    return NextResponse.json({ error: '订单不存在' }, { status: 404 });
  }

  return NextResponse.json({
    id: order.id,
    status: order.status,
    expiresAt: order.expiresAt,
  });
}
