'use client';

import { useSearchParams } from 'next/navigation';
import { useState, useEffect, useCallback, Suspense } from 'react';
import PayPageLayout from '@/components/PayPageLayout';
import { resolveLocale, type Locale } from '@/lib/locale';

// ── i18n ──

function getTexts(locale: Locale) {
  return locale === 'en'
    ? {
        missingToken: 'Missing admin token',
        missingTokenHint: 'Please access the admin page from the Sub2API platform.',
        invalidToken: 'Invalid admin token',
        title: 'Payment Config',
        subtitle: 'Configure recharge and payment settings',
        productNamePrefix: 'Product Name Prefix',
        productNameSuffix: 'Product Name Suffix',
        preview: 'Preview',
        enableBalanceRecharge: 'Enable Balance Recharge',
        saveConfig: 'Save',
        savingConfig: 'Saving...',
        configSaved: 'Configuration saved',
        configSaveFailed: 'Failed to save configuration',
        cancelRateLimit: 'Order Cancel Rate Limit',
        cancelRateLimitWindow: 'Window',
        cancelRateLimitUnit: 'Unit',
        cancelRateLimitMax: 'Max Cancellations',
        cancelRateLimitUnitMinute: 'Minutes',
        cancelRateLimitUnitHour: 'Hours',
        cancelRateLimitUnitDay: 'Days',
        maxPendingOrders: 'Max Pending Orders',
        cancelRateLimitWindowMode: 'Window Mode',
        cancelRateLimitWindowModeRolling: 'Rolling',
        cancelRateLimitWindowModeFixed: 'Fixed',
        cancelRateLimitHint: (w: string, u: string, m: string, mode: string) =>
          `Within ${w} ${u === 'minute' ? 'minute(s)' : u === 'day' ? 'day(s)' : 'hour(s)'}, max ${m} cancellation(s) (${mode === 'fixed' ? 'fixed window' : 'rolling window'})`,
      }
    : {
        missingToken: '缺少管理员凭证',
        missingTokenHint: '请从 Sub2API 平台正确访问管理页面',
        invalidToken: '管理员凭证无效',
        title: '支付配置',
        subtitle: '充值与支付相关配置',
        productNamePrefix: '商品名前缀',
        productNameSuffix: '商品名后缀',
        preview: '预览',
        enableBalanceRecharge: '启用余额充值',
        saveConfig: '保存',
        savingConfig: '保存中...',
        configSaved: '配置已保存',
        configSaveFailed: '保存配置失败',
        cancelRateLimit: '订单取消频率限制',
        cancelRateLimitWindow: '窗口',
        cancelRateLimitUnit: '周期单位',
        cancelRateLimitMax: '最大取消次数',
        cancelRateLimitUnitMinute: '分钟',
        cancelRateLimitUnitHour: '小时',
        cancelRateLimitUnitDay: '天',
        maxPendingOrders: '最多可存在支付中订单',
        cancelRateLimitWindowMode: '窗口模式',
        cancelRateLimitWindowModeRolling: '滚动',
        cancelRateLimitWindowModeFixed: '固定',
        cancelRateLimitHint: (w: string, u: string, m: string, mode: string) =>
          `${w} ${u === 'minute' ? '分钟' : u === 'day' ? '天' : '小时'}内最多可取消 ${m} 次（${mode === 'fixed' ? '固定窗口' : '滚动窗口'}）`,
      };
}

// ── Main Content ──

function PaymentConfigContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';
  const theme = searchParams.get('theme') === 'dark' ? 'dark' : 'light';
  const uiMode = searchParams.get('ui_mode') || 'standalone';
  const locale = resolveLocale(searchParams.get('lang'));
  const isDark = theme === 'dark';
  const isEmbedded = uiMode === 'embedded';
  const t = getTexts(locale);

  const [error, setError] = useState('');

  // Recharge config state
  const [rcPrefix, setRcPrefix] = useState('');
  const [rcSuffix, setRcSuffix] = useState('');
  const [rcBalanceEnabled, setRcBalanceEnabled] = useState(true);
  const [rcCancelRateLimitEnabled, setRcCancelRateLimitEnabled] = useState(false);
  const [rcCancelRateLimitWindow, setRcCancelRateLimitWindow] = useState('1');
  const [rcCancelRateLimitUnit, setRcCancelRateLimitUnit] = useState('day');
  const [rcCancelRateLimitMax, setRcCancelRateLimitMax] = useState('10');
  const [rcCancelRateLimitWindowMode, setRcCancelRateLimitWindowMode] = useState('rolling');
  const [rcMaxPendingOrders, setRcMaxPendingOrders] = useState('3');
  const [rcSaving, setRcSaving] = useState(false);

  // Fetch recharge config
  const fetchRechargeConfig = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`/api/admin/config?token=${encodeURIComponent(token)}`);
      if (res.ok) {
        const data = await res.json();
        const configs: { key: string; value: string }[] = data.configs ?? [];
        for (const c of configs) {
          if (c.key === 'PRODUCT_NAME_PREFIX') setRcPrefix(c.value);
          if (c.key === 'PRODUCT_NAME_SUFFIX') setRcSuffix(c.value);
          if (c.key === 'BALANCE_PAYMENT_DISABLED') setRcBalanceEnabled(c.value !== 'true');
          if (c.key === 'CANCEL_RATE_LIMIT_ENABLED') setRcCancelRateLimitEnabled(c.value === 'true');
          if (c.key === 'CANCEL_RATE_LIMIT_WINDOW') setRcCancelRateLimitWindow(c.value || '1');
          if (c.key === 'CANCEL_RATE_LIMIT_UNIT') setRcCancelRateLimitUnit(c.value || 'day');
          if (c.key === 'CANCEL_RATE_LIMIT_MAX') setRcCancelRateLimitMax(c.value || '10');
          if (c.key === 'CANCEL_RATE_LIMIT_WINDOW_MODE') setRcCancelRateLimitWindowMode(c.value || 'rolling');
          if (c.key === 'MAX_PENDING_ORDERS') setRcMaxPendingOrders(c.value || '3');
        }
      }
    } catch {
      /* ignore */
    }
  }, [token]);

  const saveRechargeConfig = async () => {
    setRcSaving(true);
    setError('');
    try {
      const res = await fetch('/api/admin/config', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          configs: [
            { key: 'PRODUCT_NAME_PREFIX', value: rcPrefix.trim(), group: 'payment', label: '商品名前缀' },
            { key: 'PRODUCT_NAME_SUFFIX', value: rcSuffix.trim(), group: 'payment', label: '商品名后缀' },
            {
              key: 'BALANCE_PAYMENT_DISABLED',
              value: rcBalanceEnabled ? 'false' : 'true',
              group: 'payment',
              label: '余额充值禁用',
            },
            {
              key: 'CANCEL_RATE_LIMIT_ENABLED',
              value: rcCancelRateLimitEnabled ? 'true' : 'false',
              group: 'payment',
              label: '订单取消频率限制',
            },
            {
              key: 'CANCEL_RATE_LIMIT_WINDOW',
              value: rcCancelRateLimitWindow,
              group: 'payment',
              label: '频率限制窗口',
            },
            {
              key: 'CANCEL_RATE_LIMIT_UNIT',
              value: rcCancelRateLimitUnit,
              group: 'payment',
              label: '频率限制周期单位',
            },
            {
              key: 'CANCEL_RATE_LIMIT_MAX',
              value: rcCancelRateLimitMax,
              group: 'payment',
              label: '频率限制最大次数',
            },
            {
              key: 'CANCEL_RATE_LIMIT_WINDOW_MODE',
              value: rcCancelRateLimitWindowMode,
              group: 'payment',
              label: '频率限制窗口模式',
            },
            {
              key: 'MAX_PENDING_ORDERS',
              value: rcMaxPendingOrders,
              group: 'payment',
              label: '最多可存在支付中订单',
            },
          ],
        }),
      });
      if (!res.ok) {
        setError(t.configSaveFailed);
      }
    } catch {
      setError(t.configSaveFailed);
    } finally {
      setRcSaving(false);
    }
  };

  useEffect(() => {
    fetchRechargeConfig();
  }, [fetchRechargeConfig]);

  // ── Missing token ──

  if (!token) {
    return (
      <div className={`flex min-h-screen items-center justify-center p-4 ${isDark ? 'bg-slate-950' : 'bg-slate-50'}`}>
        <div className="text-center text-red-500">
          <p className="text-lg font-medium">{t.missingToken}</p>
          <p className={`mt-2 text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{t.missingTokenHint}</p>
        </div>
      </div>
    );
  }

  // ── Shared input classes ──

  const inputCls = [
    'w-full rounded-lg border px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500/50',
    isDark
      ? 'border-slate-600 bg-slate-700 text-slate-100 placeholder-slate-400'
      : 'border-slate-300 bg-white text-slate-900 placeholder-slate-400',
  ].join(' ');

  const labelCls = ['block text-sm font-medium mb-1', isDark ? 'text-slate-300' : 'text-slate-700'].join(' ');

  // ── Render ──

  return (
    <PayPageLayout
      isDark={isDark}
      isEmbedded={isEmbedded}
      maxWidth="full"
      title={t.title}
      subtitle={t.subtitle}
      locale={locale}
    >
      {/* Error banner */}
      {error && (
        <div
          className={`mb-4 rounded-lg border p-3 text-sm ${isDark ? 'border-red-800 bg-red-950/50 text-red-400' : 'border-red-200 bg-red-50 text-red-600'}`}
        >
          {error}
          <button onClick={() => setError('')} className="ml-2 opacity-60 hover:opacity-100">
            ✕
          </button>
        </div>
      )}

      {/* ── Payment Config ── */}
      <div
        className={[
          'rounded-xl border p-4',
          isDark ? 'border-slate-700 bg-slate-800/70' : 'border-slate-200 bg-white shadow-sm',
        ].join(' ')}
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className={labelCls}>{t.productNamePrefix}</label>
            <input
              type="text"
              value={rcPrefix}
              onChange={(e) => setRcPrefix(e.target.value)}
              className={inputCls}
              placeholder="Sub2API"
            />
          </div>
          <div>
            <label className={labelCls}>{t.productNameSuffix}</label>
            <input
              type="text"
              value={rcSuffix}
              onChange={(e) => setRcSuffix(e.target.value)}
              className={inputCls}
              placeholder="CNY"
            />
          </div>
          <div>
            <label className={labelCls}>{t.preview}</label>
            <div
              className={[
                'rounded-lg border px-3 py-2 text-sm',
                isDark ? 'border-slate-600 bg-slate-700 text-slate-300' : 'border-slate-300 bg-slate-50 text-slate-600',
              ].join(' ')}
            >
              {`${rcPrefix.trim() || 'Sub2API'} 100 ${rcSuffix.trim() || 'CNY'}`.trim()}
            </div>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setRcBalanceEnabled(!rcBalanceEnabled)}
              className={[
                'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
                rcBalanceEnabled ? 'bg-emerald-500' : isDark ? 'bg-slate-600' : 'bg-slate-300',
              ].join(' ')}
            >
              <span
                className={[
                  'inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform',
                  rcBalanceEnabled ? 'translate-x-4.5' : 'translate-x-0.5',
                ].join(' ')}
              />
            </button>
            <span className={['text-sm', isDark ? 'text-slate-300' : 'text-slate-700'].join(' ')}>
              {t.enableBalanceRecharge}
            </span>
          </div>
        </div>

        {/* Max pending orders */}
        <div className="mt-3">
          <label className={labelCls}>{t.maxPendingOrders}</label>
          <input
            type="number"
            min="1"
            max="99"
            value={rcMaxPendingOrders}
            onChange={(e) => setRcMaxPendingOrders(e.target.value)}
            className={[inputCls, 'w-24'].join(' ')}
          />
        </div>

        {/* Order cancel rate limit */}
        <div className="mt-3">
          <div className="flex items-center gap-3 mb-2">
            <button
              type="button"
              onClick={() => setRcCancelRateLimitEnabled(!rcCancelRateLimitEnabled)}
              className={[
                'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
                rcCancelRateLimitEnabled ? 'bg-emerald-500' : isDark ? 'bg-slate-600' : 'bg-slate-300',
              ].join(' ')}
            >
              <span
                className={[
                  'inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform',
                  rcCancelRateLimitEnabled ? 'translate-x-4.5' : 'translate-x-0.5',
                ].join(' ')}
              />
            </button>
            <span className={['text-sm', isDark ? 'text-slate-300' : 'text-slate-700'].join(' ')}>
              {t.cancelRateLimit}
            </span>
          </div>
          {rcCancelRateLimitEnabled && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div>
                  <label className={labelCls}>{t.cancelRateLimitWindow}</label>
                  <input
                    type="number"
                    min="1"
                    max="999"
                    value={rcCancelRateLimitWindow}
                    onChange={(e) => setRcCancelRateLimitWindow(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>{t.cancelRateLimitUnit}</label>
                  <select
                    value={rcCancelRateLimitUnit}
                    onChange={(e) => setRcCancelRateLimitUnit(e.target.value)}
                    className={inputCls}
                  >
                    <option value="minute">{t.cancelRateLimitUnitMinute}</option>
                    <option value="hour">{t.cancelRateLimitUnitHour}</option>
                    <option value="day">{t.cancelRateLimitUnitDay}</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>{t.cancelRateLimitMax}</label>
                  <input
                    type="number"
                    min="1"
                    max="999"
                    value={rcCancelRateLimitMax}
                    onChange={(e) => setRcCancelRateLimitMax(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>{t.cancelRateLimitWindowMode}</label>
                  <select
                    value={rcCancelRateLimitWindowMode}
                    onChange={(e) => setRcCancelRateLimitWindowMode(e.target.value)}
                    className={inputCls}
                  >
                    <option value="rolling">{t.cancelRateLimitWindowModeRolling}</option>
                    <option value="fixed">{t.cancelRateLimitWindowModeFixed}</option>
                  </select>
                </div>
              </div>
              <p className={['mt-1 text-xs', isDark ? 'text-slate-400' : 'text-slate-500'].join(' ')}>
                {t.cancelRateLimitHint(
                  rcCancelRateLimitWindow,
                  rcCancelRateLimitUnit,
                  rcCancelRateLimitMax,
                  rcCancelRateLimitWindowMode,
                )}
              </p>
            </>
          )}
        </div>

        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={saveRechargeConfig}
            disabled={rcSaving}
            className="inline-flex items-center rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-600 disabled:opacity-50"
          >
            {rcSaving ? t.savingConfig : t.saveConfig}
          </button>
        </div>
      </div>
    </PayPageLayout>
  );
}

function PaymentConfigPageFallback() {
  const searchParams = useSearchParams();
  const locale = resolveLocale(searchParams.get('lang'));

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-slate-500">{locale === 'en' ? 'Loading...' : '加载中...'}</div>
    </div>
  );
}

export default function PaymentConfigPage() {
  return (
    <Suspense fallback={<PaymentConfigPageFallback />}>
      <PaymentConfigContent />
    </Suspense>
  );
}
