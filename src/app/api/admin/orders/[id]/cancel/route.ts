import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminToken, unauthorizedResponse } from '@/lib/admin-auth';
import { adminCancelOrder, OrderError } from '@/lib/order/service';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!verifyAdminToken(request)) return unauthorizedResponse();

  try {
    const { id } = await params;
    await adminCancelOrder(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof OrderError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    console.error('Admin cancel order error:', error);
    return NextResponse.json({ error: '取消订单失败' }, { status: 500 });
  }
}
