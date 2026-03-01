import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const response = NextResponse.next();

  // IFRAME_ALLOW_ORIGINS: 允许嵌入 iframe 的外部域名（逗号分隔）
  const allowOrigins = process.env.IFRAME_ALLOW_ORIGINS || '';

  const origins = allowOrigins
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (origins.length > 0) {
    response.headers.set('Content-Security-Policy', `frame-ancestors 'self' ${origins.join(' ')}`);
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
