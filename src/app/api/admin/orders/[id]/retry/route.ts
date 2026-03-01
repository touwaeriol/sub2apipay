import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminToken, unauthorizedResponse } from '@/lib/admin-auth';
import { retryRecharge, OrderError } from '@/lib/order/service';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!verifyAdminToken(request)) return unauthorizedResponse();

  try {
    const { id } = await params;
    await retryRecharge(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof OrderError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    console.error('Retry recharge error:', error);
    return NextResponse.json({ error: '重试充值失败' }, { status: 500 });
  }
}
