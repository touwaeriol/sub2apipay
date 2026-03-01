import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Sub2API 充值',
  description: 'Sub2API 余额充值平台',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="bg-gray-50 text-gray-900 antialiased">{children}</body>
    </html>
  );
}
