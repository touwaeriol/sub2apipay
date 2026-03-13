import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminToken, unauthorizedResponse } from '@/lib/admin-auth';
import { prisma } from '@/lib/db';
import { getGroup } from '@/lib/sub2api/client';

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await verifyAdminToken(request))) return unauthorizedResponse(request);

  try {
    const { id } = await params;
    const body = await request.json();

    const existing = await prisma.subscriptionPlan.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: '订阅套餐不存在' }, { status: 404 });
    }

    // 确定最终 groupId：如果传了 group_id 用传入值，否则用现有值
    const finalGroupId = body.group_id !== undefined ? (body.group_id ? Number(body.group_id) : null) : existing.groupId;

    // 必须绑定分组才能保存
    if (finalGroupId === null || finalGroupId === undefined) {
      return NextResponse.json({ error: '必须关联一个 Sub2API 分组' }, { status: 400 });
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

    // 校验分组在 Sub2API 中仍然存在
    const group = await getGroup(finalGroupId);
    if (!group) {
      // 分组已被删除，自动解绑
      await prisma.subscriptionPlan.update({
        where: { id },
        data: { groupId: null, forSale: false },
      });
      return NextResponse.json(
        { error: '该分组在 Sub2API 中已被删除，已自动解绑，请重新选择分组' },
        { status: 409 },
      );
    }

    if (body.price !== undefined && (typeof body.price !== 'number' || body.price <= 0 || body.price > 99999999.99)) {
      return NextResponse.json({ error: 'price 必须是 0.01 ~ 99999999.99 之间的数值' }, { status: 400 });
    }
    if (
      body.original_price !== undefined &&
      body.original_price !== null &&
      (typeof body.original_price !== 'number' || body.original_price <= 0 || body.original_price > 99999999.99)
    ) {
      return NextResponse.json({ error: 'original_price 必须是 0.01 ~ 99999999.99 之间的数值' }, { status: 400 });
    }
    if (body.validity_days !== undefined && (!Number.isInteger(body.validity_days) || body.validity_days <= 0)) {
      return NextResponse.json({ error: 'validity_days 必须是正整数' }, { status: 400 });
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
    if (body.features !== undefined) data.features = body.features ? JSON.stringify(body.features) : null;
    if (body.product_name !== undefined) data.productName = body.product_name?.trim() || null;
    if (body.for_sale !== undefined) data.forSale = body.for_sale;
    if (body.sort_order !== undefined) data.sortOrder = body.sort_order;

    const plan = await prisma.subscriptionPlan.update({
      where: { id },
      data,
    });

    return NextResponse.json({
      id: plan.id,
      groupId: plan.groupId != null ? String(plan.groupId) : null,
      groupName: null,
      name: plan.name,
      description: plan.description,
      price: Number(plan.price),
      originalPrice: plan.originalPrice ? Number(plan.originalPrice) : null,
      validDays: plan.validityDays,
      validityUnit: plan.validityUnit,
      features: plan.features ? JSON.parse(plan.features) : [],
      sortOrder: plan.sortOrder,
      enabled: plan.forSale,
      productName: plan.productName ?? null,
      createdAt: plan.createdAt,
      updatedAt: plan.updatedAt,
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
      return NextResponse.json({ error: `该套餐仍有 ${activeOrderCount} 个活跃订单，无法删除` }, { status: 409 });
    }

    await prisma.subscriptionPlan.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete subscription plan:', error);
    return NextResponse.json({ error: '删除订阅套餐失败' }, { status: 500 });
  }
}
