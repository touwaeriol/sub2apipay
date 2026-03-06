import { NextRequest, NextResponse } from 'next/server';
import { OrderError } from '@/lib/order/service';

/** 统一处理 OrderError 和未知错误 */
export function handleApiError(error: unknown, fallbackMessage: string): NextResponse {
  if (error instanceof OrderError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
  }
  console.error(`${fallbackMessage}:`, error);
  return NextResponse.json({ error: fallbackMessage }, { status: 500 });
}

/** 从 NextRequest 提取 headers 为普通对象 */
export function extractHeaders(request: NextRequest): Record<string, string> {
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });
  return headers;
}
