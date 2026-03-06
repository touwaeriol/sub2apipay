import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminToken, unauthorizedResponse } from '@/lib/admin-auth';
import { adminCancelOrder } from '@/lib/order/service';
import { handleApiError } from '@/lib/utils/api';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await verifyAdminToken(request))) return unauthorizedResponse();

  try {
    const { id } = await params;
    const outcome = await adminCancelOrder(id);
    if (outcome === 'already_paid') {
      return NextResponse.json({ success: true, status: 'PAID', message: '订单已支付完成' });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, '取消订单失败');
  }
}
