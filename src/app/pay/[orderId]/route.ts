import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { ORDER_STATUS } from '@/lib/constants';
import { getEnv } from '@/lib/config';
import { buildAlipayPaymentUrl } from '@/lib/alipay/provider';
import { deriveOrderState, getOrderDisplayState, type OrderStatusLike } from '@/lib/order/status';
import { buildOrderResultUrl } from '@/lib/order/status-access';

export const dynamic = 'force-dynamic';

const MOBILE_UA_PATTERN = /AlipayClient|Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i;
const ALIPAY_APP_UA_PATTERN = /AlipayClient/i;

type ShortLinkOrderStatus = OrderStatusLike & { id: string };

function getUserAgent(request: NextRequest): string {
  return request.headers.get('user-agent') || '';
}

function isMobileRequest(request: NextRequest): boolean {
  return MOBILE_UA_PATTERN.test(getUserAgent(request));
}

function isAlipayAppRequest(request: NextRequest): boolean {
  return ALIPAY_APP_UA_PATTERN.test(getUserAgent(request));
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildAppUrl(pathname = '/'): string {
  return new URL(pathname, getEnv().NEXT_PUBLIC_APP_URL).toString();
}

function buildResultUrl(orderId: string): string {
  return buildOrderResultUrl(getEnv().NEXT_PUBLIC_APP_URL, orderId);
}

function serializeScriptString(value: string): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function getStatusDisplay(order: OrderStatusLike) {
  return getOrderDisplayState({
    status: order.status,
    ...deriveOrderState(order),
  });
}

function renderHtml(title: string, body: string, headExtra = ''): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="robots" content="noindex,nofollow" />
    <title>${escapeHtml(title)}</title>
    ${headExtra}
    <style>
      :root { color-scheme: light; }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: linear-gradient(180deg, #f5faff 0%, #eef6ff 100%);
        color: #0f172a;
      }
      .card {
        width: 100%;
        max-width: 420px;
        background: #fff;
        border-radius: 20px;
        padding: 28px 24px;
        box-shadow: 0 20px 50px rgba(15, 23, 42, 0.12);
        text-align: center;
      }
      .icon {
        width: 60px;
        height: 60px;
        margin: 0 auto 18px;
        border-radius: 18px;
        background: #1677ff;
        color: #fff;
        font-size: 30px;
        line-height: 60px;
        font-weight: 700;
      }
      h1 {
        margin: 0;
        font-size: 22px;
        line-height: 1.35;
      }
      p {
        margin: 12px 0 0;
        font-size: 14px;
        line-height: 1.7;
        color: #475569;
      }
      .button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        min-height: 46px;
        margin-top: 20px;
        padding: 12px 16px;
        border-radius: 12px;
        background: #1677ff;
        color: #fff;
        font-weight: 600;
        text-decoration: none;
      }
      .button.secondary {
        margin-top: 12px;
        background: #eff6ff;
        color: #1677ff;
      }
      .spinner {
        width: 30px;
        height: 30px;
        margin: 18px auto 0;
        border-radius: 9999px;
        border: 3px solid rgba(22, 119, 255, 0.18);
        border-top-color: #1677ff;
        animation: spin 1s linear infinite;
      }
      .order {
        margin-top: 18px;
        padding: 10px 12px;
        border-radius: 12px;
        background: #f8fafc;
        color: #334155;
        font-size: 12px;
        word-break: break-all;
      }
      .hint {
        margin-top: 16px;
        font-size: 13px;
        color: #64748b;
      }
      .text-link {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        margin-top: 14px;
        color: #1677ff;
        font-size: 14px;
        font-weight: 500;
        text-decoration: none;
      }
      .text-link:hover {
        text-decoration: underline;
      }
      @keyframes spin { to { transform: rotate(360deg); } }
    </style>
  </head>
  <body>
    ${body}
  </body>
</html>`;
}

function renderErrorPage(title: string, message: string, orderId?: string, status = 400): NextResponse {
  const html = renderHtml(
    title,
    `<main class="card">
      <div class="icon">!</div>
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(message)}</p>
      ${orderId ? `<div class="order">订单号：${escapeHtml(orderId)}</div>` : ''}
      <a class="button secondary" href="${escapeHtml(buildAppUrl('/'))}">返回支付首页</a>
    </main>`,
  );

  return new NextResponse(html, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
}

function renderStatusPage(order: ShortLinkOrderStatus): NextResponse {
  const display = getStatusDisplay(order);
  const html = renderHtml(
    display.label,
    `<main class="card">
      <div class="icon">${escapeHtml(display.icon)}</div>
      <h1>${escapeHtml(display.label)}</h1>
      <p>${escapeHtml(display.message)}</p>
      <div class="order">订单号：${escapeHtml(order.id)}</div>
      <a class="button secondary" href="${escapeHtml(buildResultUrl(order.id))}">查看订单结果</a>
    </main>`,
  );

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
}

function renderRedirectPage(orderId: string, payUrl: string): NextResponse {
  const html = renderHtml(
    '正在跳转支付宝',
    `<main class="card">
      <div class="icon">支</div>
      <h1>正在拉起支付宝</h1>
      <p>请稍候，系统正在自动跳转到支付宝完成支付。</p>
      <div class="spinner"></div>
      <div class="order">订单号：${escapeHtml(orderId)}</div>
      <p class="hint">如未自动拉起支付宝，请返回原充值页后重新发起支付。</p>
      <a class="text-link" href="${escapeHtml(buildResultUrl(orderId))}">已支付？查看订单结果</a>
      <script>
        const payUrl = ${serializeScriptString(payUrl)};
        window.location.replace(payUrl);
        setTimeout(() => {
          if (document.visibilityState === 'visible') {
            window.location.replace(payUrl);
          }
        }, 800);
      </script>
    </main>`,
    `<noscript><meta http-equiv="refresh" content="0;url=${escapeHtml(payUrl)}" /></noscript>`,
  );

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      amount: true,
      payAmount: true,
      paymentType: true,
      status: true,
      expiresAt: true,
      paidAt: true,
      completedAt: true,
    },
  });

  if (!order) {
    return renderErrorPage('订单不存在', '未找到对应订单，请确认二维码是否正确', orderId, 404);
  }

  if (order.paymentType !== 'alipay_direct') {
    return renderErrorPage('支付方式不匹配', '该订单不是支付宝直连订单，无法通过当前链接支付', orderId, 400);
  }

  if (order.status !== ORDER_STATUS.PENDING) {
    return renderStatusPage(order);
  }

  if (order.expiresAt.getTime() <= Date.now()) {
    return renderStatusPage({
      id: order.id,
      status: ORDER_STATUS.EXPIRED,
      paidAt: order.paidAt,
      completedAt: order.completedAt,
    });
  }

  const payAmount = Number(order.payAmount ?? order.amount);
  if (!Number.isFinite(payAmount) || payAmount <= 0) {
    return renderErrorPage('订单金额异常', '订单金额无效，请返回原页面重新发起支付', order.id, 500);
  }

  const env = getEnv();
  const payUrl = buildAlipayPaymentUrl({
    orderId: order.id,
    amount: payAmount,
    subject: `${env.PRODUCT_NAME} ${payAmount.toFixed(2)} CNY`,
    notifyUrl: env.ALIPAY_NOTIFY_URL,
    returnUrl: isAlipayAppRequest(request) ? null : buildResultUrl(order.id),
    isMobile: isMobileRequest(request),
  });

  return renderRedirectPage(order.id, payUrl);
}
