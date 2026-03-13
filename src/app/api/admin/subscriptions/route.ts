import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminToken, unauthorizedResponse } from '@/lib/admin-auth';
import { getUserSubscriptions, getUser } from '@/lib/sub2api/client';

export async function GET(request: NextRequest) {
  if (!(await verifyAdminToken(request))) return unauthorizedResponse(request);

  try {
    const searchParams = request.nextUrl.searchParams;
    const userId = searchParams.get('user_id');

    if (!userId) {
      return NextResponse.json({ error: '缺少必填参数: user_id' }, { status: 400 });
    }

    const parsedUserId = Number(userId);
    if (!Number.isFinite(parsedUserId) || parsedUserId <= 0) {
      return NextResponse.json({ error: '无效的 user_id' }, { status: 400 });
    }

    const [subscriptions, user] = await Promise.all([
      getUserSubscriptions(parsedUserId),
      getUser(parsedUserId).catch(() => null),
    ]);

    // 如果提供了 group_id 筛选，过滤结果
    const groupId = searchParams.get('group_id');
    const filtered = groupId
      ? subscriptions.filter((s) => s.group_id === Number(groupId))
      : subscriptions;

    return NextResponse.json({
      subscriptions: filtered,
      user: user ? { id: user.id, username: user.username, email: user.email } : null,
    });
  } catch (error) {
    console.error('Failed to query subscriptions:', error);
    return NextResponse.json({ error: '查询订阅信息失败' }, { status: 500 });
  }
}
