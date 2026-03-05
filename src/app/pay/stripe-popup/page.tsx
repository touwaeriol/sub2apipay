'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState, useCallback, Suspense } from 'react';

function StripePopupContent() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get('order_id') || '';
  const amount = parseFloat(searchParams.get('amount') || '0') || 0;
  const theme = searchParams.get('theme') === 'dark' ? 'dark' : 'light';
  const method = searchParams.get('method') || '';
  const isDark = theme === 'dark';
  const isAlipay = method === 'alipay';

  // Sensitive data received via postMessage from parent, NOT from URL
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
    return returnUrl.toString();
  }, [orderId]);

  // Listen for credentials from parent window via postMessage
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
    // Signal parent that popup is ready to receive data
    if (window.opener) {
      window.opener.postMessage({ type: 'STRIPE_POPUP_READY' }, window.location.origin);
    }
    return () => window.removeEventListener('message', handler);
  }, []);

  // Initialize Stripe once credentials are received
  useEffect(() => {
    if (!credentials) return;
    let cancelled = false;
    const { clientSecret, publishableKey } = credentials;

    import('@stripe/stripe-js').then(({ loadStripe }) => {
      loadStripe(publishableKey).then((stripe) => {
        if (cancelled || !stripe) {
          if (!cancelled) {
            setStripeError('支付组件加载失败，请关闭窗口重试');
            setStripeLoaded(true);
          }
          return;
        }

        if (isAlipay) {
          // Alipay: confirm directly and redirect, no Payment Element needed
          stripe
            .confirmAlipayPayment(clientSecret, {
              return_url: buildReturnUrl(),
            })
            .then((result) => {
              if (cancelled) return;
              if (result.error) {
                setStripeError(result.error.message || '支付失败，请重试');
                setStripeLoaded(true);
              }
              // If no error, the page has already been redirected
            });
          return;
        }

        // Fallback: create Elements for Payment Element flow
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
  }, [credentials, isDark, isAlipay, buildReturnUrl]);

  // Mount Payment Element (only for non-alipay methods)
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
      setStripeError(error.message || '支付失败，请重试');
      setStripeSubmitting(false);
    } else {
      setStripeSuccess(true);
      setStripeSubmitting(false);
    }
  };

  // Auto-close after success
  useEffect(() => {
    if (!stripeSuccess) return;
    const timer = setTimeout(() => {
      window.close();
    }, 2000);
    return () => clearTimeout(timer);
  }, [stripeSuccess]);

  // Waiting for credentials from parent
  if (!credentials) {
    return (
      <div className={`flex min-h-screen items-center justify-center p-4 ${isDark ? 'bg-slate-950' : 'bg-slate-50'}`}>
        <div
          className={`w-full max-w-md space-y-4 rounded-2xl border p-6 ${isDark ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-white'} shadow-lg`}
        >
          <div className="flex items-center justify-center py-8">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#635bff] border-t-transparent" />
            <span className={`ml-3 text-sm ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>正在初始化...</span>
          </div>
        </div>
      </div>
    );
  }

  // Alipay direct confirm: show loading/redirecting state
  if (isAlipay) {
    return (
      <div className={`flex min-h-screen items-center justify-center p-4 ${isDark ? 'bg-slate-950' : 'bg-slate-50'}`}>
        <div
          className={`w-full max-w-md space-y-4 rounded-2xl border p-6 ${isDark ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-white'} shadow-lg`}
        >
          <div className="text-center">
            <div className="text-3xl font-bold text-blue-600">
              {'\u00A5'}
              {amount.toFixed(2)}
            </div>
            <p className={`mt-1 text-sm ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>订单号: {orderId}</p>
          </div>
          {stripeError ? (
            <div className="space-y-3">
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">{stripeError}</div>
              <button
                type="button"
                onClick={() => window.close()}
                className="w-full text-sm text-blue-600 underline hover:text-blue-700"
              >
                关闭窗口
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-center py-8">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#635bff] border-t-transparent" />
              <span className={`ml-3 text-sm ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
                正在跳转到支付页面...
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
            {'\u00A5'}
            {amount.toFixed(2)}
          </div>
          <p className={`mt-1 text-sm ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>订单号: {orderId}</p>
        </div>

        {!stripeLoaded ? (
          <div className="flex items-center justify-center py-8">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#635bff] border-t-transparent" />
            <span className={`ml-3 text-sm ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>正在加载支付表单...</span>
          </div>
        ) : stripeSuccess ? (
          <div className="py-6 text-center">
            <div className="text-5xl text-green-600">{'\u2713'}</div>
            <p className={`mt-3 text-sm ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
              支付成功，窗口即将自动关闭...
            </p>
            <button
              type="button"
              onClick={() => window.close()}
              className="mt-4 text-sm text-blue-600 underline hover:text-blue-700"
            >
              手动关闭窗口
            </button>
          </div>
        ) : (
          <>
            {stripeError && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">{stripeError}</div>
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
          </>
        )}
      </div>
    </div>
  );
}

export default function StripePopupPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <div className="text-gray-500">加载中...</div>
        </div>
      }
    >
      <StripePopupContent />
    </Suspense>
  );
}
