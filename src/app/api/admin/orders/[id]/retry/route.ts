import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminToken, unauthorizedResponse } from '@/lib/admin-auth';
import { retryRecharge } from '@/lib/order/service';
import { handleApiError } from '@/lib/utils/api';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await verifyAdminToken(request))) return unauthorizedResponse();

  try {
    const { id } = await params;
    await retryRecharge(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, '重试充值失败');
  }
}
