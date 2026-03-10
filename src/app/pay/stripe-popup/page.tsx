'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState, useCallback, Suspense } from 'react';
import { applyLocaleToSearchParams, pickLocaleText, resolveLocale } from '@/lib/locale';
import { getPaymentMeta } from '@/lib/pay-utils';

function StripePopupContent() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get('order_id') || '';
  const amount = parseFloat(searchParams.get('amount') || '0') || 0;
  const theme = searchParams.get('theme') === 'dark' ? 'dark' : 'light';
  const method = searchParams.get('method') || '';
  const accessToken = searchParams.get('access_token');
  const locale = resolveLocale(searchParams.get('lang'));
  const isDark = theme === 'dark';
  const isAlipay = method === 'alipay';

  const text = {
    init: pickLocaleText(locale, '正在初始化...', 'Initializing...'),
    orderId: pickLocaleText(locale, '订单号', 'Order ID'),
    loadFailed: pickLocaleText(locale, '支付组件加载失败，请关闭窗口重试', 'Failed to load payment component. Please close the window and try again.'),
    payFailed: pickLocaleText(locale, '支付失败，请重试', 'Payment failed. Please try again.'),
    closeWindow: pickLocaleText(locale, '关闭窗口', 'Close window'),
    redirecting: pickLocaleText(locale, '正在跳转到支付页面...', 'Redirecting to payment page...'),
    loadingForm: pickLocaleText(locale, '正在加载支付表单...', 'Loading payment form...'),
    successClosing: pickLocaleText(locale, '支付成功，窗口即将自动关闭...', 'Payment successful. This window will close automatically...'),
    closeWindowManually: pickLocaleText(locale, '手动关闭窗口', 'Close window manually'),
    processing: pickLocaleText(locale, '处理中...', 'Processing...'),
    payAmount: pickLocaleText(locale, `支付 ¥${amount.toFixed(2)}`, `Pay ¥${amount.toFixed(2)}`),
  };

  const [credentials, setCredentials] = useState<{
    clientSecret: string;
    publishableKey: string;
  } | null>(null);
  const [stripeLoaded, setStripeLoaded] = useState(false);
  const [stripeSubmitting, setStripeSubmitting] = useState(false);
  const [stripeError, setStripeError] = useState('');
  const [stripeSuccess, setStripeSuccess] = useState(false);
  const [stripeLib, setStripeLib] = useState<{
    stripe: import('@stripe/stripe-js').Stripe;
    elements: import('@stripe/stripe-js').StripeElements;
  } | null>(null);

  const buildReturnUrl = useCallback(() => {
    const returnUrl = new URL(window.location.href);
    returnUrl.pathname = '/pay/result';
    returnUrl.search = '';
    returnUrl.searchParams.set('order_id', orderId);
    returnUrl.searchParams.set('status', 'success');
    returnUrl.searchParams.set('popup', '1');
    returnUrl.searchParams.set('theme', theme);
    if (accessToken) {
      returnUrl.searchParams.set('access_token', accessToken);
    }
    applyLocaleToSearchParams(returnUrl.searchParams, locale);
    return returnUrl.toString();
  }, [orderId, theme, locale, accessToken]);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type !== 'STRIPE_POPUP_INIT') return;
      const { clientSecret, publishableKey } = event.data;
      if (clientSecret && publishableKey) {
        setCredentials({ clientSecret, publishableKey });
      }
    };
    window.addEventListener('message', handler);
    if (window.opener) {
      window.opener.postMessage({ type: 'STRIPE_POPUP_READY' }, window.location.origin);
    }
    return () => window.removeEventListener('message', handler);
  }, []);

  useEffect(() => {
    if (!credentials) return;
    let cancelled = false;
    const { clientSecret, publishableKey } = credentials;

    import('@stripe/stripe-js').then(({ loadStripe }) => {
      loadStripe(publishableKey).then((stripe) => {
        if (cancelled || !stripe) {
          if (!cancelled) {
            setStripeError(text.loadFailed);
            setStripeLoaded(true);
          }
          return;
        }

        if (isAlipay) {
          stripe
            .confirmAlipayPayment(clientSecret, {
              return_url: buildReturnUrl(),
            })
            .then((result) => {
              if (cancelled) return;
              if (result.error) {
                setStripeError(result.error.message || text.payFailed);
                setStripeLoaded(true);
              }
            });
          return;
        }

        const elements = stripe.elements({
          clientSecret,
          appearance: {
            theme: isDark ? 'night' : 'stripe',
            variables: { borderRadius: '8px' },
          },
        });
        setStripeLib({ stripe, elements });
        setStripeLoaded(true);
      });
    });
    return () => {
      cancelled = true;
    };
  }, [credentials, isDark, isAlipay, buildReturnUrl, text.loadFailed, text.payFailed]);

  const stripeContainerRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (!node || !stripeLib) return;
      const existing = stripeLib.elements.getElement('payment');
      if (existing) {
        existing.mount(node);
      } else {
        stripeLib.elements.create('payment', { layout: 'tabs' }).mount(node);
      }
    },
    [stripeLib],
  );

  const handleSubmit = async () => {
    if (!stripeLib || stripeSubmitting) return;
    setStripeSubmitting(true);
    setStripeError('');

    const { stripe, elements } = stripeLib;

    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: buildReturnUrl(),
      },
      redirect: 'if_required',
    });

    if (error) {
      setStripeError(error.message || text.payFailed);
      setStripeSubmitting(false);
    } else {
      setStripeSuccess(true);
      setStripeSubmitting(false);
    }
  };

  useEffect(() => {
    if (!stripeSuccess) return;
    const timer = setTimeout(() => {
      window.close();
    }, 2000);
    return () => clearTimeout(timer);
  }, [stripeSuccess]);

  if (!credentials) {
    return (
      <div className={`flex min-h-screen items-center justify-center p-4 ${isDark ? 'bg-slate-950' : 'bg-slate-50'}`}>
        <div
          className={`w-full max-w-md space-y-4 rounded-2xl border p-6 ${isDark ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-white'} shadow-lg`}
        >
          <div className="flex items-center justify-center py-8">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#635bff] border-t-transparent" />
            <span className={`ml-3 text-sm ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>{text.init}</span>
          </div>
        </div>
      </div>
    );
  }

  if (isAlipay) {
    return (
      <div className={`flex min-h-screen items-center justify-center p-4 ${isDark ? 'bg-slate-950' : 'bg-slate-50'}`}>
        <div
          className={`w-full max-w-md space-y-4 rounded-2xl border p-6 ${isDark ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-white'} shadow-lg`}
        >
          <div className="text-center">
            <div className="text-3xl font-bold text-blue-600">
              {'¥'}
              {amount.toFixed(2)}
            </div>
            <p className={`mt-1 text-sm ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>{text.orderId}: {orderId}</p>
          </div>
          {stripeError ? (
            <div className="space-y-3">
              <div className={`rounded-lg border p-3 text-sm ${isDark ? 'border-red-700 bg-red-900/30 text-red-400' : 'border-red-200 bg-red-50 text-red-600'}`}>{stripeError}</div>
              <button
                type="button"
                onClick={() => window.close()}
                className="w-full text-sm text-blue-600 underline hover:text-blue-700"
              >
                {text.closeWindow}
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-center py-8">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#635bff] border-t-transparent" />
              <span className={`ml-3 text-sm ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
                {text.redirecting}
              </span>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`flex min-h-screen items-center justify-center p-4 ${isDark ? 'bg-slate-950' : 'bg-slate-50'}`}>
      <div
        className={`w-full max-w-md space-y-4 rounded-2xl border p-6 ${isDark ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-white'} shadow-lg`}
      >
        <div className="text-center">
          <div className="text-3xl font-bold text-blue-600">
            {'¥'}
            {amount.toFixed(2)}
          </div>
          <p className={`mt-1 text-sm ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>{text.orderId}: {orderId}</p>
        </div>

        {!stripeLoaded ? (
          <div className="flex items-center justify-center py-8">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#635bff] border-t-transparent" />
            <span className={`ml-3 text-sm ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>{text.loadingForm}</span>
          </div>
        ) : stripeSuccess ? (
          <div className="py-6 text-center">
            <div className="text-5xl text-green-600">{'✓'}</div>
            <p className={`mt-3 text-sm ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
              {text.successClosing}
            </p>
            <button
              type="button"
              onClick={() => window.close()}
              className="mt-4 text-sm text-blue-600 underline hover:text-blue-700"
            >
              {text.closeWindowManually}
            </button>
          </div>
        ) : (
          <>
            {stripeError && (
              <div className={`rounded-lg border p-3 text-sm ${isDark ? 'border-red-700 bg-red-900/30 text-red-400' : 'border-red-200 bg-red-50 text-red-600'}`}>{stripeError}</div>
            )}
            <div
              ref={stripeContainerRef}
              className={`rounded-lg border p-4 ${isDark ? 'border-slate-700 bg-slate-800' : 'border-gray-200 bg-white'}`}
            />
            <button
              type="button"
              disabled={stripeSubmitting}
              onClick={handleSubmit}
              className={[
                'w-full rounded-lg py-3 font-medium text-white shadow-md transition-colors',
                stripeSubmitting
                  ? 'bg-gray-400 cursor-not-allowed'
                  : getPaymentMeta('stripe').buttonClass,
              ].join(' ')}
            >
              {stripeSubmitting ? (
                <span className="inline-flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  {text.processing}
                </span>
              ) : (
                text.payAmount
              )}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function StripePopupFallback() {
  const searchParams = useSearchParams();
  const locale = resolveLocale(searchParams.get('lang'));

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-gray-500">{pickLocaleText(locale, '加载中...', 'Loading...')}</div>
    </div>
  );
}

export default function StripePopupPage() {
  return (
    <Suspense fallback={<StripePopupFallback />}>
      <StripePopupContent />
    </Suspense>
  );
}
