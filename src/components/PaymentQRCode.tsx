'use client';

import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import QRCode from 'qrcode';
import type { Locale } from '@/lib/locale';
import type { PublicOrderStatusSnapshot } from '@/lib/order/status';
import {
  isStripeType,
  getPaymentMeta,
  getPaymentIconSrc,
  getPaymentChannelLabel,
} from '@/lib/pay-utils';
import { buildOrderStatusUrl } from '@/lib/order/status-url';
import { TERMINAL_STATUSES } from '@/lib/constants';

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
  statusAccessToken?: string;
  onStatusChange: (status: PublicOrderStatusSnapshot) => void;
  onBack: () => void;
  dark?: boolean;
  isEmbedded?: boolean;
  isMobile?: boolean;
  locale?: Locale;
}

function isVisibleOrderOutcome(data: PublicOrderStatusSnapshot): boolean {
  return data.paymentSuccess || TERMINAL_STATUSES.has(data.status);
}

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
  statusAccessToken,
  onStatusChange,
  onBack,
  dark = false,
  isEmbedded = false,
  isMobile = false,
  locale = 'zh',
}: PaymentQRCodeProps) {
  const displayAmount = payAmountProp ?? amount;
  const hasFeeDiff = payAmountProp !== undefined && payAmountProp !== amount;
  const [timeLeft, setTimeLeft] = useState('');
  const [timeLeftSeconds, setTimeLeftSeconds] = useState(Infinity);
  const [expired, setExpired] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [imageLoading, setImageLoading] = useState(false);
  const [cancelBlocked, setCancelBlocked] = useState(false);
  const [redirected, setRedirected] = useState(false);

  const [stripeLoaded, setStripeLoaded] = useState(false);
  const [stripeSubmitting, setStripeSubmitting] = useState(false);
  const [stripeError, setStripeError] = useState('');
  const [stripeSuccess, setStripeSuccess] = useState(false);
  const [stripeLib, setStripeLib] = useState<{
    stripe: import('@stripe/stripe-js').Stripe;
    elements: import('@stripe/stripe-js').StripeElements;
  } | null>(null);
  const [stripePaymentMethod, setStripePaymentMethod] = useState('card');
  const [popupBlocked, setPopupBlocked] = useState(false);
  const paymentMethodListenerAdded = useRef(false);

  const t = {
    expired: locale === 'en' ? 'Order Expired' : '订单已超时',
    remaining: locale === 'en' ? 'Time Remaining' : '剩余支付时间',
    scanPay: locale === 'en' ? 'Please scan with your payment app' : '请使用支付应用扫码支付',
    back: locale === 'en' ? 'Back' : '返回',
    cancelOrder: locale === 'en' ? 'Cancel Order' : '取消订单',
    h5Hint: locale === 'en' ? 'After payment, please return to this page. The system will confirm automatically.' : '支付完成后请返回此页面，系统将自动确认',
    paid: locale === 'en' ? 'Order Paid' : '订单已支付',
    paidCancelBlocked:
      locale === 'en' ? 'This order has already been paid and cannot be cancelled. The recharge will be credited automatically.' : '该订单已支付完成，无法取消。充值将自动到账。',
    backToRecharge: locale === 'en' ? 'Back to Recharge' : '返回充值',
    credited: locale === 'en' ? 'Credited ¥' : '到账 ¥',
    stripeLoadFailed: locale === 'en' ? 'Failed to load payment component. Please refresh and try again.' : '支付组件加载失败，请刷新页面重试',
    initFailed: locale === 'en' ? 'Payment initialization failed. Please go back and try again.' : '支付初始化失败，请返回重试',
    loadingForm: locale === 'en' ? 'Loading payment form...' : '正在加载支付表单...',
    payFailed: locale === 'en' ? 'Payment failed. Please try again.' : '支付失败，请重试',
    successProcessing: locale === 'en' ? 'Payment successful, processing your order...' : '支付成功，正在处理订单...',
    processing: locale === 'en' ? 'Processing...' : '处理中...',
    payNow: locale === 'en' ? 'Pay' : '支付',
    popupBlocked:
      locale === 'en' ? 'Popup was blocked by your browser. Please allow popups for this site and try again.' : '弹出窗口被浏览器拦截，请允许本站弹出窗口后重试',
    redirectingPrefix: locale === 'en' ? 'Redirecting to ' : '正在跳转到',
    redirectingSuffix: locale === 'en' ? '...' : '...',
    redirectRetryHint: locale === 'en' ? 'If the payment app does not open automatically, go back and try again.' : '如未自动拉起支付应用，请返回上一页后重新发起支付。',
    notRedirectedPrefix: locale === 'en' ? 'Not redirected? Open ' : '未跳转？点击前往',
    goPaySuffix: locale === 'en' ? '' : '',
    gotoPrefix: locale === 'en' ? 'Open ' : '前往',
    gotoSuffix: locale === 'en' ? ' to pay' : '支付',
    openScanPrefix: locale === 'en' ? 'Open ' : '请打开',
    openScanSuffix: locale === 'en' ? ' and scan to complete payment' : '扫一扫完成支付',
  };

  const shouldAutoRedirect = !expired && !isStripeType(paymentType) && !!payUrl && (isMobile || !qrCode);

  useEffect(() => {
    if (!shouldAutoRedirect || redirected) return;
    setRedirected(true);
    if (isEmbedded) {
      window.open(payUrl!, '_blank');
    } else {
      window.location.replace(payUrl!);
    }
  }, [shouldAutoRedirect, redirected, payUrl, isEmbedded]);

  const qrPayload = useMemo(() => {
    return (qrCode || '').trim();
  }, [qrCode]);

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

  const isStripe = isStripeType(paymentType);

  useEffect(() => {
    if (!isStripe || !clientSecret || !stripePublishableKey) return;
    let cancelled = false;

    import('@stripe/stripe-js').then(({ loadStripe }) => {
      loadStripe(stripePublishableKey).then((stripe) => {
        if (cancelled) return;
        if (!stripe) {
          setStripeError(t.stripeLoadFailed);
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
  }, [isStripe, clientSecret, stripePublishableKey, dark, t.stripeLoadFailed]);

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
    if (statusAccessToken) {
      returnUrl.searchParams.set('access_token', statusAccessToken);
    }
    if (locale === 'en') {
      returnUrl.searchParams.set('lang', 'en');
    }

    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: returnUrl.toString(),
      },
      redirect: 'if_required',
    });

    if (error) {
      setStripeError(error.message || t.payFailed);
      setStripeSubmitting(false);
    } else {
      setStripeSuccess(true);
      setStripeSubmitting(false);
    }
  };

  const handleOpenPopup = () => {
    if (!clientSecret || !stripePublishableKey) return;
    setPopupBlocked(false);
    const popupUrl = new URL(window.location.href);
    popupUrl.pathname = '/pay/stripe-popup';
    popupUrl.search = '';
    popupUrl.searchParams.set('order_id', orderId);
    popupUrl.searchParams.set('amount', String(amount));
    popupUrl.searchParams.set('theme', dark ? 'dark' : 'light');
    popupUrl.searchParams.set('method', stripePaymentMethod);
    if (statusAccessToken) {
      popupUrl.searchParams.set('access_token', statusAccessToken);
    }
    if (locale === 'en') {
      popupUrl.searchParams.set('lang', 'en');
    }

    const popup = window.open(popupUrl.toString(), 'stripe_payment', 'width=500,height=700,scrollbars=yes');
    if (!popup || popup.closed) {
      setPopupBlocked(true);
      return;
    }
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
        setTimeLeft(t.expired);
        setTimeLeftSeconds(0);
        setExpired(true);
        return;
      }

      const totalSeconds = Math.floor(diff / 1000);
      const minutes = Math.floor(diff / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      setTimeLeft(`${minutes}:${seconds.toString().padStart(2, '0')}`);
      setTimeLeftSeconds(totalSeconds);
    };

    updateTimer();
    const timer = setInterval(updateTimer, 1000);
    return () => clearInterval(timer);
  }, [expiresAt, t.expired]);

  const pollStatus = useCallback(async () => {
    try {
      const res = await fetch(buildOrderStatusUrl(orderId, statusAccessToken));
      if (res.ok) {
        const data = (await res.json()) as PublicOrderStatusSnapshot;
        if (isVisibleOrderOutcome(data)) {
          onStatusChange(data);
        }
      }
    } catch {
    }
  }, [orderId, onStatusChange, statusAccessToken]);

  useEffect(() => {
    if (expired) return;
    pollStatus();
    const timer = setInterval(pollStatus, 2000);
    return () => clearInterval(timer);
  }, [pollStatus, expired]);

  const handleCancel = async () => {
    if (!token) return;
    try {
      const res = await fetch(buildOrderStatusUrl(orderId, statusAccessToken));
      if (!res.ok) return;
      const data = (await res.json()) as PublicOrderStatusSnapshot;

      if (data.paymentSuccess || TERMINAL_STATUSES.has(data.status)) {
        onStatusChange(data);
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
        onStatusChange({
          id: orderId,
          status: 'CANCELLED',
          expiresAt,
          paymentSuccess: false,
          rechargeSuccess: false,
          rechargeStatus: 'closed',
        });
      } else {
        await pollStatus();
      }
    } catch {
    }
  };

  const meta = getPaymentMeta(paymentType || 'alipay');
  const iconSrc = getPaymentIconSrc(paymentType || 'alipay');
  const channelLabel = getPaymentChannelLabel(paymentType || 'alipay', locale);
  const iconBgClass = meta.iconBg;

  if (cancelBlocked) {
    return (
      <div className="flex flex-col items-center space-y-4 py-8">
        <div className="text-6xl text-green-600">{'✓'}</div>
        <h2 className="text-xl font-bold text-green-600">{t.paid}</h2>
        <p className={['text-center text-sm', dark ? 'text-slate-400' : 'text-gray-500'].join(' ')}>
          {t.paidCancelBlocked}
        </p>
        <button
          onClick={onBack}
          className="mt-4 w-full rounded-lg bg-blue-600 py-3 font-medium text-white hover:bg-blue-700"
        >
          {t.backToRecharge}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center space-y-4">
      <div className="text-center">
        <div className="text-4xl font-bold text-blue-600">
          {'¥'}
          {displayAmount.toFixed(2)}
        </div>
        {hasFeeDiff && (
          <div className={['mt-1 text-sm', dark ? 'text-slate-400' : 'text-gray-500'].join(' ')}>
            {t.credited}
            {amount.toFixed(2)}
          </div>
        )}
        <div className={`mt-1 text-sm ${expired ? 'text-red-500' : !expired && timeLeftSeconds <= 60 ? 'text-red-500 animate-pulse' : dark ? 'text-slate-400' : 'text-gray-500'}`}>
          {expired ? t.expired : `${t.remaining}: ${timeLeft}`}
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
                    {t.initFailed}
                  </p>
                </div>
              ) : !stripeLoaded ? (
                <div className="flex items-center justify-center py-8">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#635bff] border-t-transparent" />
                  <span className={['ml-3 text-sm', dark ? 'text-slate-400' : 'text-gray-500'].join(' ')}>
                    {t.loadingForm}
                  </span>
                </div>
              ) : stripeError && !stripeLib ? (
                <div className={[
                  'rounded-lg border p-3 text-sm',
                  dark ? 'border-red-700 bg-red-900/30 text-red-400' : 'border-red-200 bg-red-50 text-red-600',
                ].join(' ')}>{stripeError}</div>
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
                      <div className="text-4xl text-green-600">{'✓'}</div>
                      <p className={['mt-2 text-sm', dark ? 'text-slate-400' : 'text-gray-500'].join(' ')}>
                        {t.successProcessing}
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
                          ? 'cursor-not-allowed bg-gray-400'
                          : meta.buttonClass,
                      ].join(' ')}
                    >
                      {stripeSubmitting ? (
                        <span className="inline-flex items-center gap-2">
                          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                          {t.processing}
                        </span>
                      ) : (
                        `${t.payNow} ¥${amount.toFixed(2)}`
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
                      {t.popupBlocked}
                    </div>
                  )}
                </>
              )}
            </div>
          ) : shouldAutoRedirect ? (
            <>
              <div className="flex items-center justify-center py-6">
                <div className={`h-8 w-8 animate-spin rounded-full border-2 border-t-transparent`} style={{ borderColor: meta.color, borderTopColor: 'transparent' }} />
                <span className={['ml-3 text-sm', dark ? 'text-slate-400' : 'text-gray-500'].join(' ')}>
                  {`${t.redirectingPrefix}${channelLabel}${t.redirectingSuffix}`}
                </span>
              </div>
              <a
                href={payUrl!}
                target={isEmbedded ? '_blank' : '_self'}
                rel="noopener noreferrer"
                className={`flex w-full items-center justify-center gap-2 rounded-lg py-3 font-medium text-white shadow-md ${meta.buttonClass}`}
              >
                {iconSrc && <img src={iconSrc} alt={channelLabel} className="h-5 w-5 brightness-0 invert" />}
                {redirected ? `${t.notRedirectedPrefix}${channelLabel}` : `${t.gotoPrefix}${channelLabel}${t.gotoSuffix}`}
              </a>
              <p className={['text-center text-sm', dark ? 'text-slate-400' : 'text-gray-500'].join(' ')}>
                {t.h5Hint}
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

              {!qrDataUrl && (
                <div className="text-center">
                  <div
                    className={[
                      'rounded-lg border-2 border-dashed p-8',
                      dark ? 'border-slate-700' : 'border-gray-300',
                    ].join(' ')}
                  >
                    <p className={['text-sm', dark ? 'text-slate-400' : 'text-gray-500'].join(' ')}>{t.scanPay}</p>
                  </div>
                </div>
              )}

              <p className={['text-center text-sm', dark ? 'text-slate-400' : 'text-gray-500'].join(' ')}>
                {`${t.openScanPrefix}${channelLabel}${t.openScanSuffix}`}
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
          {t.back}
        </button>
        {!expired && token && (
          <button
            onClick={handleCancel}
            className={[
              'flex-1 rounded-lg border py-2 text-sm',
              dark
                ? 'border-red-700 text-red-400 hover:bg-red-900/30'
                : 'border-red-300 text-red-600 hover:bg-red-50',
            ].join(' ')}
          >
            {t.cancelOrder}
          </button>
        )}
      </div>
    </div>
  );
}
