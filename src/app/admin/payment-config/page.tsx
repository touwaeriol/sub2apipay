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
        overrideEnvConfig: 'Override Env Config',
        overrideEnvHint: 'When enabled, database settings override environment variables',
        providerConfig: 'Payment Providers',
        providerConfigured: 'Configured',
        providerNotConfigured: 'Not Configured (set in env vars)',
        enabledPaymentTypes: 'Enabled Payment Channels',
        minRechargeAmount: 'Min Recharge Amount',
        maxRechargeAmount: 'Max Recharge Amount',
        dailyRechargeLimit: 'Daily Recharge Limit (0=unlimited)',
        orderTimeoutMinutes: 'Order Timeout (minutes)',
        loadingEnvDefaults: 'Loading defaults...',
        instanceManagement: 'Provider Instances',
        instanceManagementHint: 'Configure multiple instances for load balancing',
        addInstance: 'Add Instance',
        editInstance: 'Edit Instance',
        instanceName: 'Instance Name',
        instanceProvider: 'Provider',
        instanceEnabled: 'Enabled',
        instanceConfig: 'Credentials',
        loadBalanceStrategy: 'Load Balance Strategy',
        strategyRoundRobin: 'Round Robin',
        strategyLeastAmount: 'Least Daily Amount',
        noInstances: 'No instances configured. Using environment variable config.',
        deleteInstanceConfirm: 'Are you sure you want to delete this instance?',
        todayAmount: 'Today',
        instanceSortOrder: 'Sort Order',
        cancel: 'Cancel',
        save: 'Save',
        saving: 'Saving...',
        instanceSaveFailed: 'Failed to save instance',
        instanceDeleteFailed: 'Failed to delete instance',
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
        overrideEnvConfig: '覆盖环境变量配置',
        overrideEnvHint: '开启后，数据库配置将覆盖环境变量',
        providerConfig: '支付服务商',
        providerConfigured: '已配置',
        providerNotConfigured: '未配置（需在环境变量中设置）',
        enabledPaymentTypes: '启用的支付渠道',
        minRechargeAmount: '最小充值金额',
        maxRechargeAmount: '最大充值金额',
        dailyRechargeLimit: '每日充值限额（0=不限）',
        orderTimeoutMinutes: '订单超时（分钟）',
        loadingEnvDefaults: '加载默认值...',
        instanceManagement: '服务商实例',
        instanceManagementHint: '配置多个服务商实例实现负载均衡',
        addInstance: '添加实例',
        editInstance: '编辑实例',
        instanceName: '实例名称',
        instanceProvider: '服务商',
        instanceEnabled: '启用',
        instanceConfig: '凭证配置',
        loadBalanceStrategy: '负载策略',
        strategyRoundRobin: '轮询',
        strategyLeastAmount: '基于已支付金额',
        noInstances: '未配置实例，使用环境变量配置。',
        deleteInstanceConfirm: '确定删除该实例？',
        todayAmount: '今日',
        instanceSortOrder: '排序',
        cancel: '取消',
        save: '保存',
        saving: '保存中...',
        instanceSaveFailed: '保存实例失败',
        instanceDeleteFailed: '删除实例失败',
      };
}

// ── Payment type & provider display names ──

const PAYMENT_TYPE_LABELS: Record<string, { zh: string; en: string }> = {
  alipay: { zh: '支付宝', en: 'Alipay' },
  wxpay: { zh: '微信支付', en: 'WeChat Pay' },
  alipay_direct: { zh: '支付宝', en: 'Alipay' },
  wxpay_direct: { zh: '微信支付', en: 'WeChat Pay' },
  stripe: { zh: 'Stripe', en: 'Stripe' },
};

const PROVIDER_LABELS: Record<string, { zh: string; en: string }> = {
  easypay: { zh: '易支付', en: 'EasyPay' },
  alipay: { zh: '支付宝直连', en: 'Alipay Direct' },
  wxpay: { zh: '微信支付直连', en: 'WeChat Pay Direct' },
  stripe: { zh: 'Stripe', en: 'Stripe' },
};

interface ProviderInfo {
  key: string;
  configured: boolean;
  types: string[];
}

// ── Provider config field definitions ──

interface ConfigFieldDef {
  key: string;
  label: { en: string; zh: string };
  sensitive: boolean;
  optional?: boolean;
}

const PROVIDER_CONFIG_FIELDS: Record<string, ConfigFieldDef[]> = {
  easypay: [
    { key: 'pid', label: { en: 'PID', zh: 'PID' }, sensitive: false },
    { key: 'pkey', label: { en: 'PKey (Secret)', zh: 'PKey（密钥）' }, sensitive: true },
    { key: 'apiBase', label: { en: 'API Base URL', zh: 'API 基础地址' }, sensitive: false, optional: true },
    { key: 'notifyUrl', label: { en: 'Notify URL', zh: '异步通知地址' }, sensitive: false, optional: true },
    { key: 'returnUrl', label: { en: 'Return URL', zh: '同步跳转地址' }, sensitive: false, optional: true },
    { key: 'cid', label: { en: 'Channel ID (optional)', zh: '渠道 ID（可选）' }, sensitive: false, optional: true },
    {
      key: 'cidAlipay',
      label: { en: 'Alipay Channel ID (optional)', zh: '支付宝渠道 ID（可选）' },
      sensitive: false,
      optional: true,
    },
    {
      key: 'cidWxpay',
      label: { en: 'WeChat Channel ID (optional)', zh: '微信渠道 ID（可选）' },
      sensitive: false,
      optional: true,
    },
  ],
  alipay: [
    { key: 'appId', label: { en: 'App ID', zh: 'App ID' }, sensitive: false },
    { key: 'privateKey', label: { en: 'Private Key', zh: '私钥' }, sensitive: true },
    { key: 'publicKey', label: { en: 'Alipay Public Key', zh: '支付宝公钥' }, sensitive: true },
    { key: 'notifyUrl', label: { en: 'Notify URL', zh: '异步通知地址' }, sensitive: false, optional: true },
    { key: 'returnUrl', label: { en: 'Return URL', zh: '同步跳转地址' }, sensitive: false, optional: true },
  ],
  wxpay: [
    { key: 'appId', label: { en: 'App ID', zh: 'App ID' }, sensitive: false },
    { key: 'mchId', label: { en: 'Merchant ID', zh: '商户号' }, sensitive: false },
    { key: 'privateKey', label: { en: 'Private Key', zh: '私钥' }, sensitive: true },
    { key: 'apiV3Key', label: { en: 'API v3 Key', zh: 'API v3 密钥' }, sensitive: true },
    { key: 'publicKey', label: { en: 'Public Key', zh: '公钥' }, sensitive: true },
    { key: 'publicKeyId', label: { en: 'Public Key ID', zh: '公钥 ID' }, sensitive: false },
    { key: 'certSerial', label: { en: 'Certificate Serial', zh: '证书序列号' }, sensitive: false },
    { key: 'notifyUrl', label: { en: 'Notify URL', zh: '异步通知地址' }, sensitive: false, optional: true },
  ],
  stripe: [
    { key: 'secretKey', label: { en: 'Secret Key', zh: '密钥' }, sensitive: true },
    { key: 'publishableKey', label: { en: 'Publishable Key', zh: '公开密钥' }, sensitive: false },
    { key: 'webhookSecret', label: { en: 'Webhook Secret', zh: 'Webhook 密钥' }, sensitive: true },
  ],
};

interface ProviderInstanceData {
  id: string;
  providerKey: string;
  name: string;
  config: Record<string, string>;
  enabled: boolean;
  sortOrder: number;
  todayAmount?: number;
  createdAt: string;
  updatedAt: string;
}

interface InstanceFormData {
  providerKey: string;
  name: string;
  enabled: boolean;
  sortOrder: number;
  config: Record<string, string>;
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
  const [rcOverrideEnv, setRcOverrideEnv] = useState(false);
  const [rcOverrideSaved, setRcOverrideSaved] = useState(false);
  const [rcEnabledPaymentTypes, setRcEnabledPaymentTypes] = useState('');
  const [rcMinAmount, setRcMinAmount] = useState('');
  const [rcMaxAmount, setRcMaxAmount] = useState('');
  const [rcDailyLimit, setRcDailyLimit] = useState('');
  const [rcOrderTimeout, setRcOrderTimeout] = useState('');
  const [loadingEnvDefaults, setLoadingEnvDefaults] = useState(false);
  const [availablePaymentTypes, setAvailablePaymentTypes] = useState<string[]>([]);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);

  // Provider instances state
  const [instances, setInstances] = useState<ProviderInstanceData[]>([]);
  const [instanceModalOpen, setInstanceModalOpen] = useState(false);
  const [editingInstance, setEditingInstance] = useState<ProviderInstanceData | null>(null);
  const [instanceForm, setInstanceForm] = useState<InstanceFormData>({
    providerKey: 'easypay',
    name: '',
    enabled: true,
    sortOrder: 0,
    config: {},
  });
  const [instanceSaving, setInstanceSaving] = useState(false);
  const [rcLoadBalanceStrategy, setRcLoadBalanceStrategy] = useState('round-robin');

  // Fetch recharge config
  const fetchRechargeConfig = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`/api/admin/config?token=${encodeURIComponent(token)}`);
      if (res.ok) {
        const data = await res.json();
        const configs: { key: string; value: string }[] = data.configs ?? [];
        const overrideKeys = [
          'ENABLED_PAYMENT_TYPES',
          'RECHARGE_MIN_AMOUNT',
          'RECHARGE_MAX_AMOUNT',
          'DAILY_RECHARGE_LIMIT',
          'ORDER_TIMEOUT_MINUTES',
        ];
        let hasOverride = false;
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
          if (c.key === 'ENABLED_PAYMENT_TYPES') setRcEnabledPaymentTypes(c.value);
          if (c.key === 'RECHARGE_MIN_AMOUNT') setRcMinAmount(c.value);
          if (c.key === 'RECHARGE_MAX_AMOUNT') setRcMaxAmount(c.value);
          if (c.key === 'DAILY_RECHARGE_LIMIT') setRcDailyLimit(c.value);
          if (c.key === 'ORDER_TIMEOUT_MINUTES') setRcOrderTimeout(c.value);
          if (c.key === 'LOAD_BALANCE_STRATEGY') setRcLoadBalanceStrategy(c.value || 'round-robin');
          if (overrideKeys.includes(c.key)) hasOverride = true;
        }
        setRcOverrideEnv(hasOverride);
        setRcOverrideSaved(hasOverride);
      }
    } catch {
      /* ignore */
    }
  }, [token]);

  const fetchEnvDefaults = async () => {
    setLoadingEnvDefaults(true);
    try {
      const res = await fetch(`/api/admin/config/env-defaults?token=${encodeURIComponent(token)}`);
      if (res.ok) {
        const data = await res.json();
        const d = data.defaults;
        if (data.availablePaymentTypes) setAvailablePaymentTypes(data.availablePaymentTypes);
        if (data.providers) setProviders(data.providers);
        setRcEnabledPaymentTypes(d.ENABLED_PAYMENT_TYPES || '');
        setRcMinAmount(d.RECHARGE_MIN_AMOUNT || '1');
        setRcMaxAmount(d.RECHARGE_MAX_AMOUNT || '1000');
        setRcDailyLimit(d.DAILY_RECHARGE_LIMIT || '10000');
        setRcOrderTimeout(d.ORDER_TIMEOUT_MINUTES || '5');
      }
    } catch {
      /* ignore */
    } finally {
      setLoadingEnvDefaults(false);
    }
  };

  const handleOverrideEnvToggle = () => {
    if (rcOverrideSaved) return; // 已保存的覆盖不允许关闭
    const newValue = !rcOverrideEnv;
    setRcOverrideEnv(newValue);
    if (newValue && !rcEnabledPaymentTypes && !rcMinAmount && !rcMaxAmount && !rcDailyLimit && !rcOrderTimeout) {
      fetchEnvDefaults();
    }
  };

  // ── Provider Instances ──

  const fetchInstances = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`/api/admin/provider-instances?token=${encodeURIComponent(token)}`);
      if (res.ok) {
        const data = await res.json();
        setInstances(data.instances ?? []);
      }
    } catch {
      /* ignore */
    }
  }, [token]);

  const saveInstance = async () => {
    setInstanceSaving(true);
    setError('');
    try {
      const url = editingInstance
        ? `/api/admin/provider-instances/${editingInstance.id}`
        : '/api/admin/provider-instances';
      const method = editingInstance ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          providerKey: instanceForm.providerKey,
          name: instanceForm.name.trim(),
          enabled: instanceForm.enabled,
          sortOrder: instanceForm.sortOrder,
          config: instanceForm.config,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || t.instanceSaveFailed);
        return;
      }

      setInstanceModalOpen(false);
      setEditingInstance(null);
      fetchInstances();
    } catch {
      setError(t.instanceSaveFailed);
    } finally {
      setInstanceSaving(false);
    }
  };

  const handleDeleteInstance = async (id: string) => {
    if (!confirm(t.deleteInstanceConfirm)) return;
    try {
      const res = await fetch(`/api/admin/provider-instances/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || t.instanceDeleteFailed);
        return;
      }
      fetchInstances();
    } catch {
      setError(t.instanceDeleteFailed);
    }
  };

  const openEditInstance = (inst: ProviderInstanceData) => {
    setEditingInstance(inst);
    setInstanceForm({
      providerKey: inst.providerKey,
      name: inst.name,
      enabled: inst.enabled,
      sortOrder: inst.sortOrder,
      config: { ...inst.config },
    });
    setInstanceModalOpen(true);
  };

  const openCreateInstance = () => {
    setEditingInstance(null);
    setInstanceForm({
      providerKey: 'easypay',
      name: '',
      enabled: true,
      sortOrder: 0,
      config: {},
    });
    setInstanceModalOpen(true);
  };

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
            ...(rcOverrideEnv
              ? [
                  {
                    key: 'ENABLED_PAYMENT_TYPES',
                    value: rcEnabledPaymentTypes,
                    group: 'payment',
                    label: '启用的支付方式',
                  },
                  { key: 'RECHARGE_MIN_AMOUNT', value: rcMinAmount, group: 'payment', label: '最小充值金额' },
                  { key: 'RECHARGE_MAX_AMOUNT', value: rcMaxAmount, group: 'payment', label: '最大充值金额' },
                  { key: 'DAILY_RECHARGE_LIMIT', value: rcDailyLimit, group: 'payment', label: '每日充值限额' },
                  { key: 'ORDER_TIMEOUT_MINUTES', value: rcOrderTimeout, group: 'payment', label: '订单超时时间' },
                  {
                    key: 'LOAD_BALANCE_STRATEGY',
                    value: rcLoadBalanceStrategy,
                    group: 'payment',
                    label: '负载均衡策略',
                  },
                ]
              : []),
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
    fetchInstances();
  }, [fetchRechargeConfig, fetchInstances]);

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

      {/* ── Override Env Config ── */}
      <div
        className={[
          'rounded-xl border p-4 mb-4',
          isDark ? 'border-slate-700 bg-slate-800/70' : 'border-slate-200 bg-white shadow-sm',
        ].join(' ')}
      >
        <div className="flex items-center gap-3 mb-2">
          <button
            type="button"
            onClick={handleOverrideEnvToggle}
            disabled={rcOverrideSaved}
            className={[
              'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
              rcOverrideEnv ? 'bg-emerald-500' : isDark ? 'bg-slate-600' : 'bg-slate-300',
              rcOverrideSaved ? 'cursor-not-allowed opacity-60' : '',
            ].join(' ')}
          >
            <span
              className={[
                'inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform',
                rcOverrideEnv ? 'translate-x-4.5' : 'translate-x-0.5',
              ].join(' ')}
            />
          </button>
          <span className={['text-sm', isDark ? 'text-slate-300' : 'text-slate-700'].join(' ')}>
            {t.overrideEnvConfig}
          </span>
        </div>
        <p className={['text-xs mb-3', isDark ? 'text-slate-400' : 'text-slate-500'].join(' ')}>{t.overrideEnvHint}</p>

        {rcOverrideEnv &&
          (loadingEnvDefaults ? (
            <div className={['text-sm', isDark ? 'text-slate-400' : 'text-slate-500'].join(' ')}>
              {t.loadingEnvDefaults}
            </div>
          ) : (
            <>
              {/* 服务商配置 + 渠道开关 */}
              <div className="mb-4">
                <label className={labelCls}>{t.providerConfig}</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
                  {providers.map((provider) => {
                    const providerLabel = PROVIDER_LABELS[provider.key]?.[locale] || provider.key;
                    const enabledSet = new Set(
                      rcEnabledPaymentTypes
                        .split(',')
                        .map((s) => s.trim())
                        .filter(Boolean),
                    );
                    return (
                      <div
                        key={provider.key}
                        className={[
                          'rounded-lg border p-3',
                          provider.configured
                            ? isDark
                              ? 'border-slate-600 bg-slate-700/50'
                              : 'border-slate-200 bg-slate-50'
                            : isDark
                              ? 'border-slate-700 bg-slate-800/30 opacity-60'
                              : 'border-slate-200 bg-slate-100/50 opacity-60',
                        ].join(' ')}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span
                            className={['text-sm font-medium', isDark ? 'text-slate-200' : 'text-slate-800'].join(' ')}
                          >
                            {providerLabel}
                          </span>
                          <span
                            className={[
                              'text-[10px] px-2 py-0.5 rounded-full',
                              provider.configured
                                ? isDark
                                  ? 'bg-emerald-500/20 text-emerald-300'
                                  : 'bg-emerald-100 text-emerald-700'
                                : isDark
                                  ? 'bg-slate-600 text-slate-400'
                                  : 'bg-slate-200 text-slate-500',
                            ].join(' ')}
                          >
                            {provider.configured ? t.providerConfigured : t.providerNotConfigured}
                          </span>
                        </div>
                        {provider.configured && (
                          <div className="flex flex-wrap gap-2">
                            {provider.types.map((type) => {
                              const isEnabled = enabledSet.has(type);
                              const typeLabel = PAYMENT_TYPE_LABELS[type]?.[locale] || type;
                              return (
                                <button
                                  key={type}
                                  type="button"
                                  onClick={() => {
                                    const current = rcEnabledPaymentTypes
                                      .split(',')
                                      .map((s) => s.trim())
                                      .filter(Boolean);
                                    const next = isEnabled ? current.filter((t) => t !== type) : [...current, type];
                                    setRcEnabledPaymentTypes(next.join(','));
                                  }}
                                  className={[
                                    'rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
                                    isEnabled
                                      ? 'border-emerald-500 bg-emerald-500/15 text-emerald-600'
                                      : isDark
                                        ? 'border-slate-500 text-slate-400 hover:border-slate-400'
                                        : 'border-slate-300 text-slate-500 hover:border-slate-400',
                                  ].join(' ')}
                                >
                                  {isEnabled ? '✓ ' : ''}
                                  {typeLabel}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>{t.minRechargeAmount}</label>
                  <input
                    type="number"
                    min="0"
                    value={rcMinAmount}
                    onChange={(e) => setRcMinAmount(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>{t.maxRechargeAmount}</label>
                  <input
                    type="number"
                    min="0"
                    value={rcMaxAmount}
                    onChange={(e) => setRcMaxAmount(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>{t.dailyRechargeLimit}</label>
                  <input
                    type="number"
                    min="0"
                    value={rcDailyLimit}
                    onChange={(e) => setRcDailyLimit(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>{t.orderTimeoutMinutes}</label>
                  <input
                    type="number"
                    min="1"
                    value={rcOrderTimeout}
                    onChange={(e) => setRcOrderTimeout(e.target.value)}
                    className={inputCls}
                  />
                </div>
              </div>
            </>
          ))}
      </div>

      {/* ── Provider Instances ── */}
      {rcOverrideEnv && (
        <div
          className={[
            'rounded-xl border p-4 mb-4',
            isDark ? 'border-slate-700 bg-slate-800/70' : 'border-slate-200 bg-white shadow-sm',
          ].join(' ')}
        >
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className={['text-sm font-semibold', isDark ? 'text-slate-100' : 'text-slate-900'].join(' ')}>
                {t.instanceManagement}
              </h3>
              <p className={['text-xs mt-0.5', isDark ? 'text-slate-400' : 'text-slate-500'].join(' ')}>
                {t.instanceManagementHint}
              </p>
            </div>
            <button
              type="button"
              onClick={openCreateInstance}
              className="inline-flex items-center rounded-lg border border-emerald-500 bg-emerald-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-600"
            >
              {t.addInstance}
            </button>
          </div>

          {/* Load balance strategy selector */}
          <div className="mb-3 flex items-center gap-3">
            <label className={['text-sm', isDark ? 'text-slate-300' : 'text-slate-700'].join(' ')}>
              {t.loadBalanceStrategy}
            </label>
            <select
              value={rcLoadBalanceStrategy}
              onChange={(e) => setRcLoadBalanceStrategy(e.target.value)}
              className={[inputCls, 'w-auto'].join(' ')}
            >
              <option value="round-robin">{t.strategyRoundRobin}</option>
              <option value="least-amount">{t.strategyLeastAmount}</option>
            </select>
          </div>

          {/* Instance list */}
          {instances.length === 0 ? (
            <p className={['text-sm', isDark ? 'text-slate-400' : 'text-slate-500'].join(' ')}>{t.noInstances}</p>
          ) : (
            <div className="space-y-2">
              {instances.map((inst) => (
                <div
                  key={inst.id}
                  className={[
                    'flex items-center justify-between rounded-lg border p-3',
                    isDark ? 'border-slate-600 bg-slate-700/50' : 'border-slate-200 bg-slate-50',
                  ].join(' ')}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={['font-medium text-sm', isDark ? 'text-slate-100' : 'text-slate-900'].join(' ')}>
                      {inst.name}
                    </span>
                    <span
                      className={[
                        'text-[10px] px-2 py-0.5 rounded-full shrink-0',
                        isDark ? 'bg-slate-600 text-slate-300' : 'bg-slate-200 text-slate-600',
                      ].join(' ')}
                    >
                      {PROVIDER_LABELS[inst.providerKey]?.[locale] || inst.providerKey}
                    </span>
                    {inst.todayAmount !== undefined && inst.todayAmount > 0 && (
                      <span className={['text-xs', isDark ? 'text-slate-400' : 'text-slate-500'].join(' ')}>
                        {t.todayAmount}: ¥{inst.todayAmount}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={inst.enabled ? 'text-emerald-500' : isDark ? 'text-slate-500' : 'text-slate-400'}>
                      {inst.enabled ? '●' : '○'}
                    </span>
                    <button
                      type="button"
                      onClick={() => openEditInstance(inst)}
                      className={[
                        'rounded-md px-2 py-1 text-xs font-medium transition-colors',
                        isDark ? 'text-indigo-400 hover:bg-indigo-500/20' : 'text-indigo-600 hover:bg-indigo-50',
                      ].join(' ')}
                    >
                      {locale === 'en' ? 'Edit' : '编辑'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteInstance(inst.id)}
                      className={[
                        'rounded-md px-2 py-1 text-xs font-medium transition-colors',
                        isDark ? 'text-red-400 hover:bg-red-500/20' : 'text-red-600 hover:bg-red-50',
                      ].join(' ')}
                    >
                      {locale === 'en' ? 'Delete' : '删除'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
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

      {/* ── Instance Edit / Create Modal ── */}
      {instanceModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div
            className={[
              'relative w-full max-w-lg overflow-y-auto rounded-2xl border p-6 shadow-2xl',
              isDark ? 'border-slate-700 bg-slate-800' : 'border-slate-200 bg-white',
            ].join(' ')}
            style={{ maxHeight: '90vh' }}
          >
            <h2 className={`mb-5 text-lg font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
              {editingInstance ? t.editInstance : t.addInstance}
            </h2>

            <div className="space-y-4">
              {/* Provider */}
              <div>
                <label className={labelCls}>{t.instanceProvider}</label>
                <select
                  value={instanceForm.providerKey}
                  onChange={(e) => setInstanceForm({ ...instanceForm, providerKey: e.target.value, config: {} })}
                  className={inputCls}
                  disabled={!!editingInstance}
                >
                  {Object.entries(PROVIDER_LABELS).map(([key, labels]) => (
                    <option key={key} value={key}>
                      {labels[locale]}
                    </option>
                  ))}
                </select>
              </div>

              {/* Instance name */}
              <div>
                <label className={labelCls}>{t.instanceName}</label>
                <input
                  type="text"
                  value={instanceForm.name}
                  onChange={(e) => setInstanceForm({ ...instanceForm, name: e.target.value })}
                  className={inputCls}
                  required
                />
              </div>

              {/* Sort order */}
              <div>
                <label className={labelCls}>{t.instanceSortOrder}</label>
                <input
                  type="number"
                  min="0"
                  value={instanceForm.sortOrder}
                  onChange={(e) => setInstanceForm({ ...instanceForm, sortOrder: parseInt(e.target.value, 10) || 0 })}
                  className={[inputCls, 'w-24'].join(' ')}
                />
              </div>

              {/* Enabled toggle */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setInstanceForm({ ...instanceForm, enabled: !instanceForm.enabled })}
                  className={[
                    'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                    instanceForm.enabled ? 'bg-emerald-500' : isDark ? 'bg-slate-600' : 'bg-slate-300',
                  ].join(' ')}
                >
                  <span
                    className={[
                      'inline-block h-4 w-4 rounded-full bg-white transition-transform',
                      instanceForm.enabled ? 'translate-x-6' : 'translate-x-1',
                    ].join(' ')}
                  />
                </button>
                <span className={`text-sm ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{t.instanceEnabled}</span>
              </div>

              {/* Config fields */}
              <div>
                <label className={[labelCls, 'mb-2'].join(' ')}>{t.instanceConfig}</label>
                <div className="space-y-3">
                  {(PROVIDER_CONFIG_FIELDS[instanceForm.providerKey] ?? []).map((field) => (
                    <div key={field.key}>
                      <label
                        className={[
                          'block text-xs font-medium mb-0.5',
                          isDark ? 'text-slate-400' : 'text-slate-500',
                        ].join(' ')}
                      >
                        {field.label[locale]}
                        {field.optional && (
                          <span className="ml-1 opacity-50">({locale === 'en' ? 'optional' : '可选'})</span>
                        )}
                      </label>
                      <input
                        type={field.sensitive ? 'password' : 'text'}
                        value={instanceForm.config[field.key] ?? ''}
                        onChange={(e) =>
                          setInstanceForm({
                            ...instanceForm,
                            config: { ...instanceForm.config, [field.key]: e.target.value },
                          })
                        }
                        className={inputCls}
                        autoComplete="off"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setInstanceModalOpen(false);
                  setEditingInstance(null);
                }}
                className={[
                  'rounded-lg px-4 py-2 text-sm font-medium transition-colors',
                  isDark ? 'text-slate-400 hover:bg-slate-700' : 'text-slate-600 hover:bg-slate-100',
                ].join(' ')}
              >
                {t.cancel}
              </button>
              <button
                type="button"
                onClick={saveInstance}
                disabled={instanceSaving || !instanceForm.name.trim()}
                className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {instanceSaving ? t.saving : t.save}
              </button>
            </div>
          </div>
        </div>
      )}
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
