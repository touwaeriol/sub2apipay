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

    // 并发检查每个套餐对应的 Sub2API 分组是否仍然存在，并获取分组名称
    const results = await Promise.all(
      plans.map(async (plan) => {
        let groupExists = false;
        let groupName: string | null = null;
        let group: Awaited<ReturnType<typeof getGroup>> | null = null;

        if (plan.groupId !== null) {
          try {
            group = await getGroup(plan.groupId);
            groupExists = group !== null;
            groupName = group?.name ?? null;
          } catch {
            groupExists = false;
          }

          // 分组已失效：自动清除绑定并下架
          if (!groupExists) {
            prisma.subscriptionPlan
              .update({
                where: { id: plan.id },
                data: { groupId: null, forSale: false },
              })
              .catch((err) => console.error(`Failed to unbind stale group for plan ${plan.id}:`, err));
          }
        }

        return {
          id: plan.id,
          groupId: groupExists ? String(plan.groupId) : null,
          groupName,
          name: plan.name,
          description: plan.description,
          price: Number(plan.price),
          originalPrice: plan.originalPrice ? Number(plan.originalPrice) : null,
          validDays: plan.validityDays,
          validityUnit: plan.validityUnit,
          features: plan.features ? JSON.parse(plan.features) : [],
          sortOrder: plan.sortOrder,
          enabled: groupExists ? plan.forSale : false,
          groupExists,
          groupPlatform: group?.platform ?? null,
          groupRateMultiplier: group?.rate_multiplier ?? null,
          groupDailyLimit: group?.daily_limit_usd ?? null,
          groupWeeklyLimit: group?.weekly_limit_usd ?? null,
          groupMonthlyLimit: group?.monthly_limit_usd ?? null,
          groupModelScopes: group?.supported_model_scopes ?? null,
          groupAllowMessagesDispatch: group?.allow_messages_dispatch ?? false,
          groupDefaultMappedModel: group?.default_mapped_model ?? null,
          productName: plan.productName ?? null,
          createdAt: plan.createdAt,
          updatedAt: plan.updatedAt,
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
    const {
      group_id,
      name,
      description,
      price,
      original_price,
      validity_days,
      validity_unit,
      features,
      for_sale,
      sort_order,
      product_name,
    } = body;

    if (!group_id || !name || price === undefined) {
      return NextResponse.json({ error: '缺少必填字段: group_id, name, price' }, { status: 400 });
    }

    if (typeof price !== 'number' || price <= 0 || price > 99999999.99) {
      return NextResponse.json({ error: 'price 必须是 0.01 ~ 99999999.99 之间的数值' }, { status: 400 });
    }
    if (
      original_price !== undefined &&
      original_price !== null &&
      (typeof original_price !== 'number' || original_price <= 0 || original_price > 99999999.99)
    ) {
      return NextResponse.json({ error: 'original_price 必须是 0.01 ~ 99999999.99 之间的数值' }, { status: 400 });
    }
    if (validity_days !== undefined && (!Number.isInteger(validity_days) || validity_days <= 0)) {
      return NextResponse.json({ error: 'validity_days 必须是正整数' }, { status: 400 });
    }
    if (sort_order !== undefined && (!Number.isInteger(sort_order) || sort_order < 0)) {
      return NextResponse.json({ error: 'sort_order 必须是非负整数' }, { status: 400 });
    }

    // 验证 group_id 唯一性
    const existing = await prisma.subscriptionPlan.findUnique({
      where: { groupId: Number(group_id) },
    });

    if (existing) {
      return NextResponse.json({ error: `分组 ID ${group_id} 已被套餐「${existing.name}」使用` }, { status: 409 });
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
        features: features ? JSON.stringify(features) : null,
        productName: product_name?.trim() || null,
        forSale: for_sale ?? false,
        sortOrder: sort_order ?? 0,
      },
    });

    return NextResponse.json(
      {
        id: plan.id,
        groupId: String(plan.groupId),
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
      },
      { status: 201 },
    );
  } catch (error) {
    console.error('Failed to create subscription plan:', error);
    return NextResponse.json({ error: '创建订阅套餐失败' }, { status: 500 });
  }
}
