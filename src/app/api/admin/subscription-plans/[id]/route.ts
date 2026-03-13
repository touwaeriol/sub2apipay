import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminToken, unauthorizedResponse } from '@/lib/admin-auth';
import { prisma } from '@/lib/db';

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await verifyAdminToken(request))) return unauthorizedResponse(request);

  try {
    const { id } = await params;
    const body = await request.json();

    const existing = await prisma.subscriptionPlan.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: '订阅套餐不存在' }, { status: 404 });
    }

    // 如果更新了 group_id，检查唯一性
    if (body.group_id !== undefined && Number(body.group_id) !== existing.groupId) {
      const conflict = await prisma.subscriptionPlan.findUnique({
        where: { groupId: Number(body.group_id) },
      });
      if (conflict) {
        return NextResponse.json(
          { error: `分组 ID ${body.group_id} 已被套餐「${conflict.name}」使用` },
          { status: 409 },
        );
      }
    }

    const data: Record<string, unknown> = {};
    if (body.group_id !== undefined) data.groupId = Number(body.group_id);
    if (body.name !== undefined) data.name = body.name;
    if (body.description !== undefined) data.description = body.description;
    if (body.price !== undefined) data.price = body.price;
    if (body.original_price !== undefined) data.originalPrice = body.original_price;
    if (body.validity_days !== undefined) data.validityDays = body.validity_days;
    if (body.validity_unit !== undefined && ['day', 'week', 'month'].includes(body.validity_unit)) {
      data.validityUnit = body.validity_unit;
    }
    if (body.features !== undefined) data.features = body.features;
    if (body.for_sale !== undefined) data.forSale = body.for_sale;
    if (body.sort_order !== undefined) data.sortOrder = body.sort_order;

    const plan = await prisma.subscriptionPlan.update({
      where: { id },
      data,
    });

    return NextResponse.json({
      ...plan,
      price: Number(plan.price),
      originalPrice: plan.originalPrice ? Number(plan.originalPrice) : null,
    });
  } catch (error) {
    console.error('Failed to update subscription plan:', error);
    return NextResponse.json({ error: '更新订阅套餐失败' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await verifyAdminToken(request))) return unauthorizedResponse(request);

  try {
    const { id } = await params;

    const existing = await prisma.subscriptionPlan.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: '订阅套餐不存在' }, { status: 404 });
    }

    // 检查是否有活跃订单引用此套餐
    const activeOrderCount = await prisma.order.count({
      where: {
        planId: id,
        status: { in: ['PENDING', 'PAID', 'RECHARGING'] },
      },
    });

    if (activeOrderCount > 0) {
      return NextResponse.json(
        { error: `该套餐仍有 ${activeOrderCount} 个活跃订单，无法删除` },
        { status: 409 },
      );
    }

    await prisma.subscriptionPlan.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete subscription plan:', error);
    return NextResponse.json({ error: '删除订阅套餐失败' }, { status: 500 });
  }
}
