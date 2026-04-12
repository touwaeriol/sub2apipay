import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const { mockUseSearchParams } = vi.hoisted(() => ({
  mockUseSearchParams: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: mockUseSearchParams,
}));

vi.mock('@/components/PayPageLayout', () => ({
  default: ({ title, subtitle, actions, children }: React.PropsWithChildren<{ title: string; subtitle: string; actions?: React.ReactNode }>) => (
    <div>
      <div>{title}</div>
      <div>{subtitle}</div>
      <div>{actions}</div>
      <div>{children}</div>
    </div>
  ),
}));

vi.mock('@/components/OrderFilterBar', () => ({
  default: () => <div>filter-bar</div>,
}));

vi.mock('@/components/OrderSummaryCards', () => ({
  default: () => <div>summary-cards</div>,
}));

vi.mock('@/components/OrderTable', () => ({
  default: () => <div>order-table</div>,
}));

vi.mock('@/components/PaginationBar', () => ({
  default: () => <div>pagination-bar</div>,
}));

vi.mock('@/lib/pay-utils', () => ({
  detectDeviceIsMobile: () => false,
}));

import OrdersPage from '@/app/pay/orders/page';

describe('OrdersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows back to pay link even when src_host is present', () => {
    mockUseSearchParams.mockReturnValue(
      new URLSearchParams(
        'token=test-token&theme=light&ui_mode=embedded&src_host=aiapi.muskpay.top&src_url=https%3A%2F%2Faiapi.muskpay.top%2Faccount&lang=zh',
      ),
    );

    const html = renderToStaticMarkup(<OrdersPage />);

    expect(html).toContain('返回充值');
    expect(html).toContain('/pay?token=test-token');
    expect(html).toContain('src_host=aiapi.muskpay.top');
    expect(html).toContain('src_url=https%3A%2F%2Faiapi.muskpay.top%2Faccount');
  });
});
