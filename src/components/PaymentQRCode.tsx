'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import QRCode from 'qrcode';

interface PaymentQRCodeProps {
  orderId: string;
  payUrl?: string | null;
  qrCode?: string | null;
  checkoutUrl?: string | null;
  paymentType?: 'alipay' | 'wxpay' | 'stripe';
  amount: number;
  expiresAt: string;
  onStatusChange: (status: string) => void;
  onBack: () => void;
  dark?: boolean;
}

const TEXT_EXPIRED = '\u8BA2\u5355\u5DF2\u8D85\u65F6';
const TEXT_REMAINING = '\u5269\u4F59\u652F\u4ED8\u65F6\u95F4';
const TEXT_GO_PAY = '\u70B9\u51FB\u524D\u5F80\u652F\u4ED8';
const TEXT_SCAN_PAY = '\u8BF7\u4F7F\u7528\u652F\u4ED8\u5E94\u7528\u626B\u7801\u652F\u4ED8';
const TEXT_BACK = '\u8FD4\u56DE';
const TEXT_CANCEL_ORDER = '\u53D6\u6D88\u8BA2\u5355';
const TERMINAL_STATUSES = new Set(['COMPLETED', 'FAILED', 'CANCELLED', 'EXPIRED', 'REFUNDED', 'REFUND_FAILED']);

function isSafeCheckoutUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.hostname.endsWith('.stripe.com');
  } catch {
    return false;
  }
}

export default function PaymentQRCode({
  orderId,
  payUrl,
  qrCode,
  checkoutUrl,
  paymentType,
  amount,
  expiresAt,
  onStatusChange,
  onBack,
  dark = false,
}: PaymentQRCodeProps) {
  const [timeLeft, setTimeLeft] = useState('');
  const [expired, setExpired] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [imageLoading, setImageLoading] = useState(false);
  const [stripeOpened, setStripeOpened] = useState(false);

  const qrPayload = useMemo(() => {
    const value = (qrCode || payUrl || '').trim();
    return value;
  }, [qrCode, payUrl]);

  useEffect(() => {
    let cancelled = false;
    if (!qrPayload) {
      setQrDataUrl('');
      return;
    }

    setImageLoading(true);
    QRCode.toDataURL(qrPayload, {
      width: 224,
      margin: 1,
      errorCorrectionLevel: 'M',
    })
      .then((url) => {
        if (!cancelled) {
          setQrDataUrl(url);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setQrDataUrl('');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setImageLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [qrPayload]);

  useEffect(() => {
    const updateTimer = () => {
      const now = Date.now();
      const expiry = new Date(expiresAt).getTime();
      const diff = expiry - now;

      if (diff <= 0) {
        setTimeLeft(TEXT_EXPIRED);
        setExpired(true);
        return;
      }

      const minutes = Math.floor(diff / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      setTimeLeft(`${minutes}:${seconds.toString().padStart(2, '0')}`);
    };

    updateTimer();
    const timer = setInterval(updateTimer, 1000);
    return () => clearInterval(timer);
  }, [expiresAt]);

  const pollStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/orders/${orderId}`);
      if (res.ok) {
        const data = await res.json();
        if (TERMINAL_STATUSES.has(data.status)) {
          onStatusChange(data.status);
        }
      }
    } catch {
      // ignore polling errors
    }
  }, [orderId, onStatusChange]);

  useEffect(() => {
    if (expired) return;
    pollStatus();
    const timer = setInterval(pollStatus, 2000);
    return () => clearInterval(timer);
  }, [pollStatus, expired]);

  const handleCancel = async () => {
    try {
      const res = await fetch(`/api/orders/${orderId}`);
      if (!res.ok) return;
      const data = await res.json();
      const cancelRes = await fetch(`/api/orders/${orderId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: data.user_id }),
      });
      if (cancelRes.ok) {
        onStatusChange('CANCELLED');
      }
    } catch {
      // ignore
    }
  };

  const isStripe = paymentType === 'stripe';
  const isWx = paymentType === 'wxpay';
  const iconSrc = isStripe ? '' : isWx ? '/icons/wxpay.svg' : '/icons/alipay.svg';
  const channelLabel = isStripe ? 'Stripe' : isWx ? '\u5FAE\u4FE1' : '\u652F\u4ED8\u5B9D';
  const iconBgClass = isStripe ? 'bg-[#635bff]' : isWx ? 'bg-[#07C160]' : 'bg-[#1677FF]';

  return (
    <div className="flex flex-col items-center space-y-4">
      <div className="text-center">
        <div className="text-4xl font-bold text-blue-600">{'\u00A5'}{amount.toFixed(2)}</div>
        <div className={`mt-1 text-sm ${expired ? 'text-red-500' : dark ? 'text-slate-400' : 'text-gray-500'}`}>
          {expired ? TEXT_EXPIRED : `${TEXT_REMAINING}: ${timeLeft}`}
        </div>
      </div>

      {!expired && (
        <>
          {isStripe ? (
            <>
              <button
                type="button"
                disabled={!checkoutUrl || !isSafeCheckoutUrl(checkoutUrl) || stripeOpened}
                onClick={() => {
                  if (checkoutUrl && isSafeCheckoutUrl(checkoutUrl)) {
                    window.open(checkoutUrl, '_blank', 'noopener,noreferrer');
                    setStripeOpened(true);
                  }
                }}
                className={[
                  'inline-flex items-center gap-2 rounded-lg px-8 py-3 font-medium text-white shadow-md transition-colors',
                  !checkoutUrl || !isSafeCheckoutUrl(checkoutUrl) || stripeOpened
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'bg-[#635bff] hover:bg-[#5249d9] active:bg-[#4840c4]',
                ].join(' ')}
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
                  <line x1="1" y1="10" x2="23" y2="10" />
                </svg>
                {stripeOpened ? '\u5DF2\u6253\u5F00\u652F\u4ED8\u9875\u9762' : '\u524D\u5F80 Stripe \u652F\u4ED8'}
              </button>
              {stripeOpened && (
                <button
                  type="button"
                  onClick={() => {
                    if (checkoutUrl && isSafeCheckoutUrl(checkoutUrl)) {
                      window.open(checkoutUrl, '_blank', 'noopener,noreferrer');
                    }
                  }}
                  className={['text-sm underline', dark ? 'text-slate-400 hover:text-slate-300' : 'text-gray-500 hover:text-gray-700'].join(' ')}
                >
                  {'\u91CD\u65B0\u6253\u5F00\u652F\u4ED8\u9875\u9762'}
                </button>
              )}
              <p className={['text-center text-sm', dark ? 'text-slate-400' : 'text-gray-500'].join(' ')}>
                {!checkoutUrl || !isSafeCheckoutUrl(checkoutUrl)
                  ? '\u652F\u4ED8\u94FE\u63A5\u521B\u5EFA\u5931\u8D25\uFF0C\u8BF7\u8FD4\u56DE\u91CD\u8BD5'
                  : '\u5728\u65B0\u7A97\u53E3\u5B8C\u6210\u652F\u4ED8\u540E\uFF0C\u6B64\u9875\u9762\u5C06\u81EA\u52A8\u66F4\u65B0'}
              </p>
            </>
          ) : (
            <>
              {qrDataUrl && (
                <div className={['relative rounded-lg border p-4', dark ? 'border-slate-700 bg-slate-900' : 'border-gray-200 bg-white'].join(' ')}>
                  {imageLoading && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-black/10">
                      <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
                    </div>
                  )}
                  <img src={qrDataUrl} alt="payment qrcode" className="h-56 w-56 rounded" />
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <span className={`rounded-full p-2 shadow ring-2 ring-white ${iconBgClass}`}>
                      <img src={iconSrc} alt={channelLabel} className="h-5 w-5 brightness-0 invert" />
                    </span>
                  </div>
                </div>
              )}

              {!qrDataUrl && payUrl && (
                <a
                  href={payUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg bg-blue-600 px-8 py-3 font-medium text-white hover:bg-blue-700"
                >
                  {TEXT_GO_PAY}
                </a>
              )}

              {!qrDataUrl && !payUrl && (
                <div className="text-center">
                  <div className={['rounded-lg border-2 border-dashed p-8', dark ? 'border-slate-700' : 'border-gray-300'].join(' ')}>
                    <p className={['text-sm', dark ? 'text-slate-400' : 'text-gray-500'].join(' ')}>{TEXT_SCAN_PAY}</p>
                  </div>
                </div>
              )}

              <p className={['text-center text-sm', dark ? 'text-slate-400' : 'text-gray-500'].join(' ')}>
                {`\u8BF7\u6253\u5F00${channelLabel}\u626B\u4E00\u626B\u5B8C\u6210\u652F\u4ED8`}
              </p>
            </>
          )}
        </>
      )}

      <div className="flex w-full gap-3">
        <button
          onClick={onBack}
          className={[
            'flex-1 rounded-lg border py-2 text-sm',
            dark ? 'border-slate-700 text-slate-300 hover:bg-slate-800' : 'border-gray-300 text-gray-600 hover:bg-gray-50',
          ].join(' ')}
        >
          {TEXT_BACK}
        </button>
        {!expired && (
          <button
            onClick={handleCancel}
            className="flex-1 rounded-lg border border-red-300 py-2 text-sm text-red-600 hover:bg-red-50"
          >
            {TEXT_CANCEL_ORDER}
          </button>
        )}
      </div>
    </div>
  );
}
