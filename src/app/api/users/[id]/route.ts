import { NextResponse } from 'next/server';
import { getUser } from '@/lib/sub2api/client';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = Number(id);

  if (!Number.isInteger(userId) || userId <= 0) {
    return NextResponse.json({ error: 'Invalid user id' }, { status: 400 });
  }

  try {
    const user = await getUser(userId);
    const displayName = user.username || user.email || `User #${user.id}`;

    return NextResponse.json({
      id: user.id,
      username: user.username,
      email: user.email,
      displayName,
      balance: user.balance,
      status: user.status,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'USER_NOT_FOUND') {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    console.error('Get user info error:', error);
    return NextResponse.json({ error: 'Get user info failed' }, { status: 500 });
  }
}
