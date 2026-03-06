'use client';

import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import QRCode from 'qrcode';

interface PaymentQRCodeProps {
  orderId: string;
  token?: string;
  payUrl?: string | null;
  qrCode?: string | null;
  clientSecret?: string | null;
  stripePublishableKey?: string | null;
  paymentType?: string;
  amount: number;
  payAmount?: number;
  expiresAt: string;
  onStatusChange: (status: string) => void;
  onBack: () => void;
  dark?: boolean;
  isEmbedded?: boolean;
  isMobile?: boolean;
}

const TEXT_EXPIRED = '\u8BA2\u5355\u5DF2\u8D85\u65F6';
const TEXT_REMAINING = '\u5269\u4F59\u652F\u4ED8\u65F6\u95F4';
const TEXT_GO_PAY = '\u70B9\u51FB\u524D\u5F80\u652F\u4ED8';
const TEXT_SCAN_PAY = '\u8BF7\u4F7F\u7528\u652F\u4ED8\u5E94\u7528\u626B\u7801\u652F\u4ED8';
const TEXT_BACK = '\u8FD4\u56DE';
const TEXT_CANCEL_ORDER = '\u53D6\u6D88\u8BA2\u5355';
const TEXT_H5_HINT =
  '\u652F\u4ED8\u5B8C\u6210\u540E\u8BF7\u8FD4\u56DE\u6B64\u9875\u9762\uFF0C\u7CFB\u7EDF\u5C06\u81EA\u52A8\u786E\u8BA4';
const TERMINAL_STATUSES = new Set(['COMPLETED', 'FAILED', 'CANCELLED', 'EXPIRED', 'REFUNDED', 'REFUND_FAILED']);

export default function PaymentQRCode({
  orderId,
  token,
  payUrl,
  qrCode,
  clientSecret,
  stripePublishableKey,
  paymentType,
  amount,
  payAmount: payAmountProp,
  expiresAt,
  onStatusChange,
  onBack,
  dark = false,
  isEmbedded = false,
  isMobile = false,
}: PaymentQRCodeProps) {
  const displayAmount = payAmountProp ?? amount;
  const hasFeeDiff = payAmountProp !== undefined && payAmountProp !== amount;
  const [timeLeft, setTimeLeft] = useState('');
  const [expired, setExpired] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [imageLoading, setImageLoading] = useState(false);
  const [cancelBlocked, setCancelBlocked] = useState(false);

  // Stripe Payment Element state
  const [stripeLoaded, setStripeLoaded] = useState(false);
  const [stripeSubmitting, setStripeSubmitting] = useState(false);
  const [stripeError, setStripeError] = useState('');
  const [stripeSuccess, setStripeSuccess] = useState(false);
  const [stripeLib, setStripeLib] = useState<{
    stripe: import('@stripe/stripe-js').Stripe;
    elements: import('@stripe/stripe-js').StripeElements;
  } | null>(null);
  // Track selected payment method in Payment Element (for embedded popup decision)
  const [stripePaymentMethod, setStripePaymentMethod] = useState('card');
  const [popupBlocked, setPopupBlocked] = useState(false);
  const paymentMethodListenerAdded = useRef(false);

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

  // Initialize Stripe Payment Element
  const isStripe = paymentType?.startsWith('stripe');

  useEffect(() => {
    if (!isStripe || !clientSecret || !stripePublishableKey) return;
    let cancelled = false;

    import('@stripe/stripe-js').then(({ loadStripe }) => {
      loadStripe(stripePublishableKey).then((stripe) => {
        if (cancelled) return;
        if (!stripe) {
          setStripeError('支付组件加载失败，请刷新页面重试');
          setStripeLoaded(true);
          return;
        }
        const elements = stripe.elements({
          clientSecret,
          appearance: {
            theme: dark ? 'night' : 'stripe',
            variables: {
              borderRadius: '8px',
            },
          },
        });
        setStripeLib({ stripe, elements });
        setStripeLoaded(true);
      });
    });

    return () => {
      cancelled = true;
    };
  }, [isStripe, clientSecret, stripePublishableKey, dark]);

  // Mount Payment Element when container is available
  const stripeContainerRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (!node || !stripeLib) return;
      let pe = stripeLib.elements.getElement('payment');
      if (pe) {
        pe.mount(node);
      } else {
        pe = stripeLib.elements.create('payment', { layout: 'tabs' });
        pe.mount(node);
      }
      if (!paymentMethodListenerAdded.current) {
        paymentMethodListenerAdded.current = true;
        pe.on('change', (event: { value?: { type?: string } }) => {
          if (event.value?.type) {
            setStripePaymentMethod(event.value.type);
          }
        });
      }
    },
    [stripeLib],
  );

  const handleStripeSubmit = async () => {
    if (!stripeLib || stripeSubmitting) return;

    // In embedded mode, Alipay redirects to a page with X-Frame-Options that breaks iframe
    if (isEmbedded && stripePaymentMethod === 'alipay') {
      handleOpenPopup();
      return;
    }

    setStripeSubmitting(true);
    setStripeError('');

    const { stripe, elements } = stripeLib;
    const returnUrl = new URL(window.location.href);
    returnUrl.pathname = '/pay/result';
    returnUrl.search = '';
    returnUrl.searchParams.set('order_id', orderId);
    returnUrl.searchParams.set('status', 'success');

    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: returnUrl.toString(),
      },
      redirect: 'if_required',
    });

    if (error) {
      setStripeError(error.message || '支付失败，请重试');
      setStripeSubmitting(false);
    } else {
      // Payment succeeded (or no redirect needed)
      setStripeSuccess(true);
      setStripeSubmitting(false);
      // Polling will pick up the status change
    }
  };

  const handleOpenPopup = () => {
    if (!clientSecret || !stripePublishableKey) return;
    setPopupBlocked(false);
    // Only pass display params in URL — sensitive data sent via postMessage
    const popupUrl = new URL(window.location.href);
    popupUrl.pathname = '/pay/stripe-popup';
    popupUrl.search = '';
    popupUrl.searchParams.set('order_id', orderId);
    popupUrl.searchParams.set('amount', String(amount));
    popupUrl.searchParams.set('theme', dark ? 'dark' : 'light');
    popupUrl.searchParams.set('method', stripePaymentMethod);

    const popup = window.open(popupUrl.toString(), 'stripe_payment', 'width=500,height=700,scrollbars=yes');
    if (!popup || popup.closed) {
      setPopupBlocked(true);
      return;
    }
    // Send sensitive data via postMessage after popup loads
    const onReady = (event: MessageEvent) => {
      if (event.source !== popup || event.data?.type !== 'STRIPE_POPUP_READY') return;
      window.removeEventListener('message', onReady);
      popup.postMessage(
        {
          type: 'STRIPE_POPUP_INIT',
          clientSecret,
          publishableKey: stripePublishableKey,
        },
        window.location.origin,
      );
    };
    window.addEventListener('message', onReady);
  };

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
    if (!token) return;
    try {
      // 先检查当前订单状态
      const res = await fetch(`/api/orders/${orderId}`);
      if (!res.ok) return;
      const data = await res.json();

      if (TERMINAL_STATUSES.has(data.status)) {
        onStatusChange(data.status);
        return;
      }

      const cancelRes = await fetch(`/api/orders/${orderId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      if (cancelRes.ok) {
        const cancelData = await cancelRes.json();
        if (cancelData.status === 'PAID') {
          setCancelBlocked(true);
          return;
        }
        onStatusChange('CANCELLED');
      } else {
        await pollStatus();
      }
    } catch {
      // ignore
    }
  };

  const isWx = paymentType?.startsWith('wxpay');
  const iconSrc = isStripe ? '' : isWx ? '/icons/wxpay.svg' : '/icons/alipay.svg';
  const channelLabel = isStripe ? 'Stripe' : isWx ? '\u5FAE\u4FE1' : '\u652F\u4ED8\u5B9D';
  const iconBgClass = isStripe ? 'bg-[#635bff]' : isWx ? 'bg-[#07C160]' : 'bg-[#1677FF]';

  if (cancelBlocked) {
    return (
      <div className="flex flex-col items-center space-y-4 py-8">
        <div className="text-6xl text-green-600">{'\u2713'}</div>
        <h2 className="text-xl font-bold text-green-600">{'\u8BA2\u5355\u5DF2\u652F\u4ED8'}</h2>
        <p className={['text-center text-sm', dark ? 'text-slate-400' : 'text-gray-500'].join(' ')}>
          {
            '\u8BE5\u8BA2\u5355\u5DF2\u652F\u4ED8\u5B8C\u6210\uFF0C\u65E0\u6CD5\u53D6\u6D88\u3002\u5145\u503C\u5C06\u81EA\u52A8\u5230\u8D26\u3002'
          }
        </p>
        <button
          onClick={onBack}
          className="mt-4 w-full rounded-lg bg-blue-600 py-3 font-medium text-white hover:bg-blue-700"
        >
          {'\u8FD4\u56DE\u5145\u503C'}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center space-y-4">
      <div className="text-center">
        <div className="text-4xl font-bold text-blue-600">
          {'\u00A5'}
          {displayAmount.toFixed(2)}
        </div>
        {hasFeeDiff && (
          <div className={['mt-1 text-sm', dark ? 'text-slate-400' : 'text-gray-500'].join(' ')}>
            到账 ¥{amount.toFixed(2)}
          </div>
        )}
        <div className={`mt-1 text-sm ${expired ? 'text-red-500' : dark ? 'text-slate-400' : 'text-gray-500'}`}>
          {expired ? TEXT_EXPIRED : `${TEXT_REMAINING}: ${timeLeft}`}
        </div>
      </div>

      {!expired && (
        <>
          {isStripe ? (
            <div className="w-full max-w-md space-y-4">
              {!clientSecret || !stripePublishableKey ? (
                <div
                  className={[
                    'rounded-lg border-2 border-dashed p-8 text-center',
                    dark ? 'border-slate-700' : 'border-gray-300',
                  ].join(' ')}
                >
                  <p className={['text-sm', dark ? 'text-slate-400' : 'text-gray-500'].join(' ')}>
                    支付初始化失败，请返回重试
                  </p>
                </div>
              ) : !stripeLoaded ? (
                <div className="flex items-center justify-center py-8">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#635bff] border-t-transparent" />
                  <span className={['ml-3 text-sm', dark ? 'text-slate-400' : 'text-gray-500'].join(' ')}>
                    正在加载支付表单...
                  </span>
                </div>
              ) : stripeError && !stripeLib ? (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">{stripeError}</div>
              ) : (
                <>
                  <div
                    ref={stripeContainerRef}
                    className={[
                      'rounded-lg border p-4',
                      dark ? 'border-slate-700 bg-slate-900' : 'border-gray-200 bg-white',
                    ].join(' ')}
                  />
                  {stripeError && (
                    <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
                      {stripeError}
                    </div>
                  )}
                  {stripeSuccess ? (
                    <div className="text-center">
                      <div className="text-4xl text-green-600">{'\u2713'}</div>
                      <p className={['mt-2 text-sm', dark ? 'text-slate-400' : 'text-gray-500'].join(' ')}>
                        支付成功，正在处理订单...
                      </p>
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={stripeSubmitting}
                      onClick={handleStripeSubmit}
                      className={[
                        'w-full rounded-lg py-3 font-medium text-white shadow-md transition-colors',
                        stripeSubmitting
                          ? 'bg-gray-400 cursor-not-allowed'
                          : 'bg-[#635bff] hover:bg-[#5249d9] active:bg-[#4840c4]',
                      ].join(' ')}
                    >
                      {stripeSubmitting ? (
                        <span className="inline-flex items-center gap-2">
                          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                          处理中...
                        </span>
                      ) : (
                        `支付 ¥${amount.toFixed(2)}`
                      )}
                    </button>
                  )}
                  {popupBlocked && (
                    <div
                      className={[
                        'rounded-lg border p-3 text-sm',
                        dark
                          ? 'border-amber-700 bg-amber-900/30 text-amber-300'
                          : 'border-amber-200 bg-amber-50 text-amber-700',
                      ].join(' ')}
                    >
                      弹出窗口被浏览器拦截，请允许本站弹出窗口后重试
                    </div>
                  )}
                </>
              )}
            </div>
          ) : isMobile && payUrl ? (
            <>
              <a
                href={payUrl}
                target={isEmbedded ? '_blank' : '_self'}
                rel="noopener noreferrer"
                className={`flex w-full items-center justify-center gap-2 rounded-lg py-3 font-medium text-white shadow-md ${iconBgClass}`}
              >
                <img src={iconSrc} alt={channelLabel} className="h-5 w-5 brightness-0 invert" />
                {`打开${channelLabel}支付`}
              </a>
              <p className={['text-center text-sm', dark ? 'text-slate-400' : 'text-gray-500'].join(' ')}>
                {TEXT_H5_HINT}
              </p>
            </>
          ) : (
            <>
              {qrDataUrl && (
                <div
                  className={[
                    'relative rounded-lg border p-4',
                    dark ? 'border-slate-700 bg-slate-900' : 'border-gray-200 bg-white',
                  ].join(' ')}
                >
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
                  <div
                    className={[
                      'rounded-lg border-2 border-dashed p-8',
                      dark ? 'border-slate-700' : 'border-gray-300',
                    ].join(' ')}
                  >
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
            dark
              ? 'border-slate-700 text-slate-300 hover:bg-slate-800'
              : 'border-gray-300 text-gray-600 hover:bg-gray-50',
          ].join(' ')}
        >
          {TEXT_BACK}
        </button>
        {!expired && token && (
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
