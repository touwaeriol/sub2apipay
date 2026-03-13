import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminToken, unauthorizedResponse } from '@/lib/admin-auth';
import { prisma } from '@/lib/db';
import { getGroup } from '@/lib/sub2api/client';

export async function GET(request: NextRequest) {
  if (!(await verifyAdminToken(request))) return unauthorizedResponse(request);

  try {
    const plans = await prisma.subscriptionPlan.findMany({
      orderBy: { sortOrder: 'asc' },
    });

    // 并发检查每个套餐对应的 Sub2API 分组是否仍然存在
    const results = await Promise.all(
      plans.map(async (plan) => {
        let groupExists = false;
        try {
          const group = await getGroup(plan.groupId);
          groupExists = group !== null;
        } catch {
          groupExists = false;
        }
        return {
          ...plan,
          price: Number(plan.price),
          originalPrice: plan.originalPrice ? Number(plan.originalPrice) : null,
          groupExists,
        };
      }),
    );

    return NextResponse.json({ plans: results });
  } catch (error) {
    console.error('Failed to list subscription plans:', error);
    return NextResponse.json({ error: '获取订阅套餐列表失败' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!(await verifyAdminToken(request))) return unauthorizedResponse(request);

  try {
    const body = await request.json();
    const { group_id, name, description, price, original_price, validity_days, validity_unit, features, for_sale, sort_order } = body;

    if (!group_id || !name || price === undefined) {
      return NextResponse.json({ error: '缺少必填字段: group_id, name, price' }, { status: 400 });
    }

    // 验证 group_id 唯一性
    const existing = await prisma.subscriptionPlan.findUnique({
      where: { groupId: Number(group_id) },
    });

    if (existing) {
      return NextResponse.json(
        { error: `分组 ID ${group_id} 已被套餐「${existing.name}」使用` },
        { status: 409 },
      );
    }

    const plan = await prisma.subscriptionPlan.create({
      data: {
        groupId: Number(group_id),
        name,
        description: description ?? null,
        price,
        originalPrice: original_price ?? null,
        validityDays: validity_days ?? 30,
        validityUnit: ['day', 'week', 'month'].includes(validity_unit) ? validity_unit : 'day',
        features: features ?? null,
        forSale: for_sale ?? false,
        sortOrder: sort_order ?? 0,
      },
    });

    return NextResponse.json(
      {
        ...plan,
        price: Number(plan.price),
        originalPrice: plan.originalPrice ? Number(plan.originalPrice) : null,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error('Failed to create subscription plan:', error);
    return NextResponse.json({ error: '创建订阅套餐失败' }, { status: 500 });
  }
}
