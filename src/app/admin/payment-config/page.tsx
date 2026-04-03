'use client';

import { useSearchParams } from 'next/navigation';
import { useState, useEffect, useCallback, useMemo, Suspense } from 'react';
import PayPageLayout from '@/components/PayPageLayout';
import { resolveLocale, type Locale } from '@/lib/locale';

// ── i18n ──

function getTexts(locale: Locale) {
  return locale === 'en'
    ? {
        missingToken: 'Missing admin token',
        missingTokenHint: 'Please access the admin page from the Sub2API platform.',
        title: 'Payment Config',
        subtitle: 'Configure payment providers and settings',
        basicConfig: 'Basic Settings',
        basicConfigHint: 'Recharge, order and environment configuration',
        productNamePrefix: 'Product Name Prefix',
        productNameSuffix: 'Product Name Suffix',
        preview: 'Preview',
        enableBalanceRecharge: 'Enable Balance Recharge',
        saveConfig: 'Save Settings',
        savingConfig: 'Saving...',
        configSaveFailed: 'Failed to save configuration',
        cancelRateLimit: 'Limit Cancel Rate',
        cancelRateLimitWindow: 'Window',
        cancelRateLimitUnit: 'Unit',
        cancelRateLimitMax: 'Max',
        cancelRateLimitUnitMinute: 'Minutes',
        cancelRateLimitUnitHour: 'Hours',
        cancelRateLimitUnitDay: 'Days',
        maxPendingOrders: 'Max Pending Orders',
        cancelRateLimitWindowMode: 'Window Mode',
        cancelRateLimitWindowModeRolling: 'Rolling',
        cancelRateLimitWindowModeFixed: 'Fixed',
        cancelRateLimitHint: (w: string, u: string, m: string, mode: string) =>
          `Within ${w} ${u === 'minute' ? 'min' : u === 'day' ? 'day' : 'hr'}, max ${m} cancel(s) (${mode === 'fixed' ? 'fixed' : 'rolling'})`,
        overrideEnvConfig: 'Override Env Config',
        overrideEnvHint: 'When enabled, database settings override environment variables',
        enabledProviders: 'Enabled Provider Types',
        minRechargeAmount: 'Min Recharge Amount',
        maxRechargeAmount: 'Max Recharge Amount',
        dailyRechargeLimit: 'Daily Limit (0=unlimited)',
        orderTimeoutMinutes: 'Order Timeout (min)',
        loadingEnvDefaults: 'Loading defaults...',
        providerManagement: 'Provider Management',
        addInstance: 'Add Instance',
        editInstance: 'Edit Instance',
        instanceName: 'Instance Name',
        instanceProvider: 'Provider Type',
        instanceEnabled: 'Enabled',
        instanceRefundEnabled: 'Allow Refund',
        instanceConfig: 'Credentials',
        supportedChannels: 'Supported Channels',
        supportedChannelsHint: 'Select which payment channels this instance supports',
        loadBalanceStrategy: 'Load Balance',
        strategyRoundRobin: 'Round Robin',
        strategyLeastAmount: 'Least Daily Amount',
        noInstances: 'No instances configured yet.',
        deleteInstanceConfirm: 'Are you sure you want to delete this instance?',
        todayAmount: 'Today',
        instanceSortOrder: 'Sort Order',
        cancel: 'Cancel',
        save: 'Save',
        saving: 'Saving...',
        instanceSaveFailed: 'Failed to save instance',
        instanceDeleteFailed: 'Failed to delete instance',
        allChannels: 'All Channels',
        sub2apiAdminApiKey: 'Sub2API Admin API Key',
        sub2apiAdminApiKeyHint: 'Leave empty to use environment variable',
        autoRefund: 'Auto Refund',
        autoRefundHint: 'When enabled, user refund requests are executed immediately without admin approval',
      }
    : {
        missingToken: '缺少管理员凭证',
        missingTokenHint: '请从 Sub2API 平台正确访问管理页面',
        title: '支付配置',
        subtitle: '管理支付服务商与相关设置',
        basicConfig: '基础配置',
        basicConfigHint: '充值、订单与环境变量覆盖配置',
        productNamePrefix: '商品名前缀',
        productNameSuffix: '商品名后缀',
        preview: '预览',
        enableBalanceRecharge: '启用余额充值',
        saveConfig: '保存设置',
        savingConfig: '保存中...',
        configSaveFailed: '保存配置失败',
        cancelRateLimit: '限制取消频率',
        cancelRateLimitWindow: '窗口',
        cancelRateLimitUnit: '周期',
        cancelRateLimitMax: '次数',
        cancelRateLimitUnitMinute: '分钟',
        cancelRateLimitUnitHour: '小时',
        cancelRateLimitUnitDay: '天',
        maxPendingOrders: '最多支付中订单',
        cancelRateLimitWindowMode: '窗口模式',
        cancelRateLimitWindowModeRolling: '滚动',
        cancelRateLimitWindowModeFixed: '固定',
        cancelRateLimitHint: (w: string, u: string, m: string, mode: string) =>
          `${w} ${u === 'minute' ? '分钟' : u === 'day' ? '天' : '小时'}内最多可取消 ${m} 次（${mode === 'fixed' ? '固定窗口' : '滚动窗口'}）`,
        overrideEnvConfig: '覆盖环境变量配置',
        overrideEnvHint: '开启后，数据库配置将覆盖环境变量',
        enabledProviders: '启用的服务商类型',
        minRechargeAmount: '最小充值金额',
        maxRechargeAmount: '最大充值金额',
        dailyRechargeLimit: '每日限额（0=不限）',
        orderTimeoutMinutes: '订单超时（分钟）',
        loadingEnvDefaults: '加载默认值...',
        providerManagement: '服务商管理',
        addInstance: '添加实例',
        editInstance: '编辑实例',
        instanceName: '实例名称',
        instanceProvider: '服务商类型',
        instanceEnabled: '启用',
        instanceRefundEnabled: '允许退款',
        instanceConfig: '凭证配置',
        supportedChannels: '支持渠道',
        supportedChannelsHint: '选择此实例支持的支付渠道',
        loadBalanceStrategy: '负载策略',
        strategyRoundRobin: '轮询',
        strategyLeastAmount: '基于已支付金额',
        noInstances: '暂无实例，点击上方「添加实例」配置服务商。',
        deleteInstanceConfirm: '确定删除该实例？',
        todayAmount: '今日',
        instanceSortOrder: '排序',
        cancel: '取消',
        save: '保存',
        saving: '保存中...',
        instanceSaveFailed: '保存实例失败',
        instanceDeleteFailed: '删除实例失败',
        allChannels: '全部渠道',
        sub2apiAdminApiKey: 'Sub2API Admin API Key',
        sub2apiAdminApiKeyHint: '留空则使用环境变量',
        autoRefund: '自动退款',
        autoRefundHint: '开启后，用户提交退款申请会立即执行退款，无需管理员审核',
      };
}

// ── Constants ──

const ALL_PROVIDER_KEYS = ['easypay', 'alipay', 'wxpay', 'stripe'] as const;

const PAYMENT_TYPE_LABELS: Record<string, { zh: string; en: string }> = {
  alipay: { zh: '支付宝', en: 'Alipay' },
  wxpay: { zh: '微信支付', en: 'WeChat Pay' },
  stripe: { zh: 'Stripe', en: 'Stripe' },
};

const PROVIDER_LABELS: Record<string, { zh: string; en: string }> = {
  easypay: { zh: '易支付', en: 'EasyPay' },
  alipay: { zh: '支付宝官方', en: 'Alipay Official' },
  wxpay: { zh: '微信官方', en: 'WeChat Official' },
  stripe: { zh: 'Stripe', en: 'Stripe' },
};

const PROVIDER_SUPPORTED_TYPES: Record<string, string[]> = {
  easypay: ['alipay', 'wxpay'],
  alipay: ['alipay'],
  wxpay: ['wxpay'],
  stripe: ['stripe'],
};

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

interface ChannelLimits {
  dailyLimit?: number;
  singleMin?: number;
  singleMax?: number;
}

interface ProviderInstanceData {
  id: string;
  providerKey: string;
  name: string;
  config: Record<string, string>;
  supportedTypes: string;
  enabled: boolean;
  sortOrder: number;
  limits: Record<string, ChannelLimits> | null;
  refundEnabled: boolean;
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
  supportedTypes: string[];
  limits: Record<string, ChannelLimits>;
  refundEnabled: boolean;
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

  // Basic config
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
  const [rcLoadBalanceStrategy, setRcLoadBalanceStrategy] = useState('round-robin');
  const [rcSub2apiKey, setRcSub2apiKey] = useState('');
  const [rcAutoRefundEnabled, setRcAutoRefundEnabled] = useState(false);

  // Override env
  const [rcOverrideEnv, setRcOverrideEnv] = useState(false);
  const [rcOverrideSaved, setRcOverrideSaved] = useState(false);
  const [rcEnabledProviders, setRcEnabledProviders] = useState('');
  const [rcEnabledPaymentTypes, setRcEnabledPaymentTypes] = useState('');
  const [rcMinAmount, setRcMinAmount] = useState('');
  const [rcMaxAmount, setRcMaxAmount] = useState('');
  const [rcDailyLimit, setRcDailyLimit] = useState('');
  const [rcOrderTimeout, setRcOrderTimeout] = useState('');
  const [loadingEnvDefaults, setLoadingEnvDefaults] = useState(false);

  // Instances
  const [instances, setInstances] = useState<ProviderInstanceData[]>([]);
  const [instanceModalOpen, setInstanceModalOpen] = useState(false);
  const [editingInstance, setEditingInstance] = useState<ProviderInstanceData | null>(null);
  const [instanceForm, setInstanceForm] = useState<InstanceFormData>({
    providerKey: 'easypay',
    name: '',
    enabled: true,
    sortOrder: 0,
    config: {},
    supportedTypes: [],
    limits: {},
    refundEnabled: false,
  });
  const [instanceSaving, setInstanceSaving] = useState(false);
  const [limitsOpen, setLimitsOpen] = useState(false);

  const enabledProviderKeys = useMemo(
    () =>
      rcEnabledProviders
        .split(',')
        .map((s) => s.trim())
        .filter((k) => k in PROVIDER_LABELS),
    [rcEnabledProviders],
  );

  // ── Data fetching ──

  const fetchConfig = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`/api/admin/config?token=${encodeURIComponent(token)}`);
      if (!res.ok) return;
      const data = await res.json();
      const configs: { key: string; value: string }[] = data.configs ?? [];
      let hasOverride = false;
      for (const c of configs) {
        if (c.key === 'OVERRIDE_ENV_ENABLED') hasOverride = c.value === 'true';
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
        if (c.key === 'ENABLED_PROVIDERS') setRcEnabledProviders(c.value);
        if (c.key === 'RECHARGE_MIN_AMOUNT') setRcMinAmount(c.value);
        if (c.key === 'RECHARGE_MAX_AMOUNT') setRcMaxAmount(c.value);
        if (c.key === 'DAILY_RECHARGE_LIMIT') setRcDailyLimit(c.value);
        if (c.key === 'ORDER_TIMEOUT_MINUTES') setRcOrderTimeout(c.value);
        if (c.key === 'LOAD_BALANCE_STRATEGY') setRcLoadBalanceStrategy(c.value || 'round-robin');
        if (c.key === 'SUB2API_ADMIN_API_KEY') setRcSub2apiKey(/\*{4,}/.test(c.value) ? '' : c.value);
        if (c.key === 'AUTO_REFUND_ENABLED') setRcAutoRefundEnabled(c.value === 'true');
      }
      setRcOverrideEnv(hasOverride);
      setRcOverrideSaved(hasOverride);
    } catch {
      /* ignore */
    }
  }, [token]);

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

  useEffect(() => {
    fetchConfig();
    fetchInstances();
  }, [fetchConfig, fetchInstances]);

  // ── Override env toggle ──

  const handleOverrideEnvToggle = async () => {
    if (rcOverrideSaved) return;
    setRcOverrideEnv(true);
    setLoadingEnvDefaults(true);
    try {
      const res = await fetch(`/api/admin/config/env-defaults?token=${encodeURIComponent(token)}`);
      if (res.ok) {
        const data = await res.json();
        const d = data.defaults;
        const configuredProviders = (data.providers || [])
          .filter((p: { configured: boolean }) => p.configured)
          .map((p: { key: string }) => p.key);
        setRcEnabledProviders(configuredProviders.join(','));
        setRcEnabledPaymentTypes(d.ENABLED_PAYMENT_TYPES || '');
        setRcMinAmount(d.RECHARGE_MIN_AMOUNT || '1');
        setRcMaxAmount(d.RECHARGE_MAX_AMOUNT || '1000');
        setRcDailyLimit(d.DAILY_RECHARGE_LIMIT || '10000');
        setRcOrderTimeout(d.ORDER_TIMEOUT_MINUTES || '5');
        if (d.MAX_PENDING_ORDERS) setRcMaxPendingOrders(d.MAX_PENDING_ORDERS);

        // 自动创建服务商实例（仅当当前无实例时）
        const instDefaults = data.instanceDefaults || {};
        if (instances.length === 0) {
          for (const [providerKey, instData] of Object.entries(instDefaults)) {
            const { name, config, supportedTypes } = instData as {
              name: string;
              config: Record<string, string>;
              supportedTypes: string;
            };
            try {
              const instRes = await fetch('/api/admin/provider-instances', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ providerKey, name, config, supportedTypes, enabled: true, sortOrder: 0 }),
              });
              if (!instRes.ok) {
                console.warn(`Failed to create instance for ${providerKey}`);
              }
            } catch {
              /* ignore */
            }
          }
          fetchInstances();
        }
      }
    } catch {
      /* ignore */
    } finally {
      setLoadingEnvDefaults(false);
    }
  };

  const toggleProvider = (key: string) => {
    const current = rcEnabledProviders
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    // Prevent disabling if instances exist
    if (current.includes(key) && instances.some((inst) => inst.providerKey === key)) {
      setError(
        locale === 'en'
          ? `Cannot disable "${PROVIDER_LABELS[key]?.en || key}": instances exist. Delete all instances first.`
          : `无法关闭「${PROVIDER_LABELS[key]?.zh || key}」：存在关联实例，请先删除所有实例。`,
      );
      return;
    }
    const next = current.includes(key) ? current.filter((k) => k !== key) : [...current, key];
    setRcEnabledProviders(next.join(','));
    // Auto-derive enabled payment types
    const derivedTypes = new Set<string>();
    for (const pk of next) {
      for (const pt of PROVIDER_SUPPORTED_TYPES[pk] || []) derivedTypes.add(pt);
    }
    setRcEnabledPaymentTypes(Array.from(derivedTypes).join(','));
  };

  // ── Instance CRUD ──

  const saveInstance = async () => {
    setInstanceSaving(true);
    setError('');
    try {
      const url = editingInstance
        ? `/api/admin/provider-instances/${editingInstance.id}`
        : '/api/admin/provider-instances';
      const res = await fetch(url, {
        method: editingInstance ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          providerKey: instanceForm.providerKey,
          name: instanceForm.name.trim(),
          enabled: instanceForm.enabled,
          sortOrder: instanceForm.sortOrder,
          config: instanceForm.config,
          supportedTypes: instanceForm.supportedTypes.join(','),
          limits: Object.keys(instanceForm.limits).length > 0 ? instanceForm.limits : null,
          refundEnabled: instanceForm.refundEnabled,
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
      supportedTypes: inst.supportedTypes ? inst.supportedTypes.split(',').filter(Boolean) : [],
      limits: inst.limits ?? {},
      refundEnabled: inst.refundEnabled ?? false,
    });
    setError('');
    setInstanceModalOpen(true);
  };

  const openCreateInstance = () => {
    const key = enabledProviderKeys[0] || 'easypay';
    setEditingInstance(null);
    setInstanceForm({
      providerKey: key,
      name: '',
      enabled: true,
      sortOrder: 0,
      config: {},
      supportedTypes: PROVIDER_SUPPORTED_TYPES[key] || [],
      limits: {},
      refundEnabled: false,
    });
    setError('');
    setInstanceModalOpen(true);
  };

  const toggleInstanceEnabled = async (inst: ProviderInstanceData) => {
    try {
      const res = await fetch(`/api/admin/provider-instances/${inst.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ enabled: !inst.enabled }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || (locale === 'en' ? 'Failed to update instance' : '更新实例失败'));
        return;
      }
      setInstances((prev) => prev.map((i) => (i.id === inst.id ? { ...i, enabled: !inst.enabled } : i)));
    } catch {
      setError(locale === 'en' ? 'Failed to update instance' : '更新实例失败');
    }
  };

  const toggleInstanceRefundEnabled = async (inst: ProviderInstanceData) => {
    try {
      const res = await fetch(`/api/admin/provider-instances/${inst.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ refundEnabled: !inst.refundEnabled }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || (locale === 'en' ? 'Failed to update instance' : '更新实例失败'));
        return;
      }
      setInstances((prev) => prev.map((i) => (i.id === inst.id ? { ...i, refundEnabled: !inst.refundEnabled } : i)));
    } catch {
      setError(locale === 'en' ? 'Failed to update instance' : '更新实例失败');
    }
  };

  // ── Save config ──

  const saveConfig = async () => {
    setRcSaving(true);
    setError('');
    try {
      const res = await fetch('/api/admin/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
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
              key: 'AUTO_REFUND_ENABLED',
              value: rcAutoRefundEnabled ? 'true' : 'false',
              group: 'payment',
              label: '自动退款开关',
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
            { key: 'CANCEL_RATE_LIMIT_MAX', value: rcCancelRateLimitMax, group: 'payment', label: '频率限制最大次数' },
            {
              key: 'CANCEL_RATE_LIMIT_WINDOW_MODE',
              value: rcCancelRateLimitWindowMode,
              group: 'payment',
              label: '频率限制窗口模式',
            },
            {
              key: 'OVERRIDE_ENV_ENABLED',
              value: rcOverrideEnv ? 'true' : 'false',
              group: 'system',
              label: '覆盖环境变量开关',
            },
            ...(rcOverrideEnv
              ? [
                  {
                    key: 'MAX_PENDING_ORDERS',
                    value: rcMaxPendingOrders,
                    group: 'payment',
                    label: '最多可存在支付中订单',
                  },
                  {
                    key: 'SUB2API_ADMIN_API_KEY',
                    value: rcSub2apiKey,
                    group: 'connection',
                    label: 'Sub2API Admin API Key',
                  },
                  { key: 'RECHARGE_MIN_AMOUNT', value: rcMinAmount, group: 'payment', label: '最小充值金额' },
                  { key: 'RECHARGE_MAX_AMOUNT', value: rcMaxAmount, group: 'payment', label: '最大充值金额' },
                  { key: 'DAILY_RECHARGE_LIMIT', value: rcDailyLimit, group: 'payment', label: '每日充值限额' },
                  { key: 'ORDER_TIMEOUT_MINUTES', value: rcOrderTimeout, group: 'payment', label: '订单超时时间' },
                  { key: 'ENABLED_PROVIDERS', value: rcEnabledProviders, group: 'payment', label: '启用的服务商' },
                  {
                    key: 'ENABLED_PAYMENT_TYPES',
                    value: rcEnabledPaymentTypes,
                    group: 'payment',
                    label: '启用的支付方式',
                  },
                ]
              : []),
          ],
        }),
      });
      if (!res.ok) setError(t.configSaveFailed);
    } catch {
      setError(t.configSaveFailed);
    } finally {
      setRcSaving(false);
    }
  };

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

  // ── Shared classes ──
  const inputCls = [
    'w-full rounded-lg border px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500/50',
    isDark
      ? 'border-slate-600 bg-slate-700 text-slate-100 placeholder-slate-400'
      : 'border-slate-300 bg-white text-slate-900 placeholder-slate-400',
  ].join(' ');
  const labelCls = ['block text-sm font-medium mb-1', isDark ? 'text-slate-300' : 'text-slate-700'].join(' ');
  const cardCls = [
    'rounded-xl border p-5',
    isDark ? 'border-slate-700 bg-slate-800/70' : 'border-slate-200 bg-white shadow-sm',
  ].join(' ');
  const subCardCls = [
    'rounded-lg border p-4',
    isDark ? 'border-slate-600 bg-slate-700/40' : 'border-slate-200 bg-slate-50',
  ].join(' ');

  const Toggle = ({ value, onChange, disabled }: { value: boolean; onChange: () => void; disabled?: boolean }) => (
    <button
      type="button"
      onClick={onChange}
      disabled={disabled}
      className={[
        'relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0',
        value ? 'bg-emerald-500' : isDark ? 'bg-slate-600' : 'bg-slate-300',
        disabled ? 'cursor-not-allowed opacity-60' : '',
      ].join(' ')}
    >
      <span
        className={[
          'inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform',
          value ? 'translate-x-4.5' : 'translate-x-0.5',
        ].join(' ')}
      />
    </button>
  );

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

      {/* ══ 基础配置 ══ */}
      <div className={cardCls}>
        <h2 className={`text-base font-semibold mb-1 ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
          {t.basicConfig}
        </h2>
        <p className={`text-xs mb-4 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{t.basicConfigHint}</p>

        {/* Balance recharge toggle */}
        <div className="flex items-center gap-2 mb-4">
          <Toggle value={rcBalanceEnabled} onChange={() => setRcBalanceEnabled(!rcBalanceEnabled)} />
          <span className={`text-sm ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{t.enableBalanceRecharge}</span>
        </div>

        {/* Product name */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
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
              className={`rounded-lg border px-3 py-2 text-sm ${isDark ? 'border-slate-600 bg-slate-700 text-slate-300' : 'border-slate-300 bg-slate-50 text-slate-600'}`}
            >
              {`${rcPrefix.trim() || 'Sub2API'} 100 ${rcSuffix.trim() || 'CNY'}`.trim()}
            </div>
          </div>
        </div>

        {/* Toggles row */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 mb-4">
          <div className="flex items-center gap-2">
            <Toggle value={rcBalanceEnabled} onChange={() => setRcBalanceEnabled(!rcBalanceEnabled)} />
            <span className={`text-sm ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{t.enableBalanceRecharge}</span>
          </div>
          <div className="flex items-center gap-2">
            <Toggle value={rcAutoRefundEnabled} onChange={() => setRcAutoRefundEnabled(!rcAutoRefundEnabled)} />
            <span className={`text-sm ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{t.autoRefund}</span>
          </div>
          <span className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{t.autoRefundHint}</span>
        </div>

        {/* Cancel rate limit */}
        <div className="mb-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex items-center gap-2 self-center">
              <Toggle
                value={rcCancelRateLimitEnabled}
                onChange={() => setRcCancelRateLimitEnabled(!rcCancelRateLimitEnabled)}
              />
              <span className={`text-sm whitespace-nowrap ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                {t.cancelRateLimit}
              </span>
            </div>
            {rcCancelRateLimitEnabled && (
              <>
                <div className="w-20">
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
                <div className="w-24">
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
                <div className="w-20">
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
                <div className="w-24">
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
              </>
            )}
          </div>
          {rcCancelRateLimitEnabled && (
            <p className={`mt-1.5 text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              {t.cancelRateLimitHint(
                rcCancelRateLimitWindow,
                rcCancelRateLimitUnit,
                rcCancelRateLimitMax,
                rcCancelRateLimitWindowMode,
              )}
            </p>
          )}
        </div>

        {/* ── 覆盖环境变量配置 ── */}
        <div className={subCardCls}>
          <div className="flex items-center gap-3 mb-2">
            <Toggle value={rcOverrideEnv} onChange={handleOverrideEnvToggle} disabled={rcOverrideSaved} />
            <span className={`text-sm font-medium ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
              {t.overrideEnvConfig}
            </span>
          </div>
          <p className={`text-xs mb-3 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{t.overrideEnvHint}</p>

          {rcOverrideEnv &&
            (loadingEnvDefaults ? (
              <div className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{t.loadingEnvDefaults}</div>
            ) : (
              <>
                {/* Sub2API Admin API Key + Max pending orders */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                  <div>
                    <label className={labelCls}>{t.sub2apiAdminApiKey}</label>
                    <input
                      type="password"
                      value={rcSub2apiKey}
                      onChange={(e) => setRcSub2apiKey(e.target.value)}
                      className={inputCls}
                      placeholder={t.sub2apiAdminApiKeyHint}
                      autoComplete="off"
                    />
                    <p className={`mt-1 text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                      {t.sub2apiAdminApiKeyHint}
                    </p>
                  </div>
                  <div>
                    <label className={labelCls}>{t.maxPendingOrders}</label>
                    <input
                      type="number"
                      min="1"
                      max="99"
                      value={rcMaxPendingOrders}
                      onChange={(e) => setRcMaxPendingOrders(e.target.value)}
                      className={[inputCls, '!w-20'].join(' ')}
                    />
                  </div>
                </div>

                {/* Provider type badges */}
                <div className="mb-3">
                  <label className={labelCls}>{t.enabledProviders}</label>
                  <div className="flex flex-wrap gap-2">
                    {ALL_PROVIDER_KEYS.map((key) => {
                      const isActive = rcEnabledProviders
                        .split(',')
                        .map((s) => s.trim())
                        .includes(key);
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => toggleProvider(key)}
                          className={[
                            'rounded-lg border px-4 py-2 text-sm font-medium transition-all',
                            isActive
                              ? 'border-emerald-500 bg-emerald-500 text-white shadow-sm'
                              : isDark
                                ? 'border-slate-500 bg-slate-700 text-slate-300 hover:border-slate-400'
                                : 'border-slate-300 bg-white text-slate-600 hover:border-slate-400 hover:bg-slate-50',
                          ].join(' ')}
                        >
                          {PROVIDER_LABELS[key]?.[locale] || key}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Amount / timeout fields */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
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

                {/* ── 服务商管理 ── */}
                {enabledProviderKeys.length > 0 && (
                  <div className="pt-4 border-t border-dashed" style={{ borderColor: isDark ? '#475569' : '#e2e8f0' }}>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <h3 className={`text-sm font-semibold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                          {t.providerManagement}
                        </h3>
                        <div className="flex items-center gap-2">
                          <label
                            className={`text-xs whitespace-nowrap ${isDark ? 'text-slate-400' : 'text-slate-500'}`}
                          >
                            {t.loadBalanceStrategy}
                          </label>
                          <select
                            value={rcLoadBalanceStrategy}
                            onChange={(e) => setRcLoadBalanceStrategy(e.target.value)}
                            className={[inputCls, '!w-auto !py-1.5 !text-xs'].join(' ')}
                          >
                            <option value="round-robin">{t.strategyRoundRobin}</option>
                            <option value="least-amount">{t.strategyLeastAmount}</option>
                          </select>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={openCreateInstance}
                        className="inline-flex items-center rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-600"
                      >
                        + {t.addInstance}
                      </button>
                    </div>

                    <div className="space-y-3">
                      {enabledProviderKeys.map((pk) => {
                        const providerInstances = instances.filter((i) => i.providerKey === pk);
                        if (providerInstances.length === 0) return null;
                        return (
                          <div
                            key={pk}
                            className={[
                              'rounded-lg border p-3',
                              isDark ? 'border-slate-600 bg-slate-700/30' : 'border-slate-200 bg-slate-50/50',
                            ].join(' ')}
                          >
                            <h4
                              className={`text-xs font-semibold mb-2 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}
                            >
                              {PROVIDER_LABELS[pk]?.[locale] || pk}
                            </h4>
                            <div className="space-y-1.5">
                              {providerInstances.map((inst) => {
                                const instTypes = inst.supportedTypes
                                  ? inst.supportedTypes.split(',').filter(Boolean)
                                  : [];
                                return (
                                  <div
                                    key={inst.id}
                                    className={[
                                      'flex items-center justify-between rounded-lg border px-3 py-2',
                                      isDark ? 'border-slate-500/50 bg-slate-800/60' : 'border-slate-200 bg-white',
                                    ].join(' ')}
                                  >
                                    <div className="flex items-center gap-2.5 min-w-0 flex-wrap">
                                      <Toggle value={inst.enabled} onChange={() => toggleInstanceEnabled(inst)} />
                                      <span
                                        className={`text-sm font-medium ${inst.enabled ? (isDark ? 'text-slate-100' : 'text-slate-900') : isDark ? 'text-slate-500' : 'text-slate-400'}`}
                                      >
                                        {inst.name}
                                      </span>
                                      {instTypes.length > 0 ? (
                                        instTypes.map((type) => (
                                          <span
                                            key={type}
                                            className={`text-[10px] px-1.5 py-0.5 rounded ${isDark ? 'bg-emerald-500/15 text-emerald-300' : 'bg-emerald-50 text-emerald-700'}`}
                                          >
                                            {PAYMENT_TYPE_LABELS[type]?.[locale] || type}
                                          </span>
                                        ))
                                      ) : (
                                        <span
                                          className={`text-[10px] px-1.5 py-0.5 rounded ${isDark ? 'bg-slate-600 text-slate-400' : 'bg-slate-100 text-slate-500'}`}
                                        >
                                          {t.allChannels}
                                        </span>
                                      )}
                                      {inst.todayAmount !== undefined && inst.todayAmount > 0 && (
                                        <span className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                          {t.todayAmount}: ¥{inst.todayAmount}
                                        </span>
                                      )}
                                      <div className="flex items-center gap-1">
                                        <Toggle
                                          value={inst.refundEnabled}
                                          onChange={() => toggleInstanceRefundEnabled(inst)}
                                        />
                                        <span className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                          {t.instanceRefundEnabled}
                                        </span>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                      <button
                                        type="button"
                                        onClick={() => openEditInstance(inst)}
                                        className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${isDark ? 'text-indigo-400 hover:bg-indigo-500/15' : 'text-indigo-600 hover:bg-indigo-50'}`}
                                      >
                                        {locale === 'en' ? 'Edit' : '编辑'}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteInstance(inst.id)}
                                        className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${isDark ? 'text-red-400 hover:bg-red-500/15' : 'text-red-600 hover:bg-red-50'}`}
                                      >
                                        {locale === 'en' ? 'Delete' : '删除'}
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            ))}
        </div>

        {/* Save button */}
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={saveConfig}
            disabled={rcSaving}
            className="inline-flex items-center rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-600 disabled:opacity-50"
          >
            {rcSaving ? t.savingConfig : t.saveConfig}
          </button>
        </div>
      </div>

      {/* ══ Instance Modal ══ */}
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

            {error && (
              <div
                className={`mb-4 rounded-lg border p-3 text-sm ${isDark ? 'border-red-800 bg-red-950/50 text-red-400' : 'border-red-200 bg-red-50 text-red-600'}`}
              >
                {error}
              </div>
            )}

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>
                    {t.instanceProvider}
                    <span className="text-red-500 ml-0.5">*</span>
                  </label>
                  <select
                    value={instanceForm.providerKey}
                    onChange={(e) =>
                      setInstanceForm({
                        ...instanceForm,
                        providerKey: e.target.value,
                        config: {},
                        supportedTypes: PROVIDER_SUPPORTED_TYPES[e.target.value] || [],
                        limits: {},
                      })
                    }
                    className={inputCls}
                    disabled={!!editingInstance}
                  >
                    {enabledProviderKeys.map((key) => (
                      <option key={key} value={key}>
                        {PROVIDER_LABELS[key]?.[locale] || key}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>
                    {t.instanceName}
                    <span className="text-red-500 ml-0.5">*</span>
                  </label>
                  <input
                    type="text"
                    value={instanceForm.name}
                    onChange={(e) => setInstanceForm({ ...instanceForm, name: e.target.value })}
                    className={inputCls}
                    placeholder={PROVIDER_LABELS[instanceForm.providerKey]?.[locale] + ' A'}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>{t.instanceSortOrder}</label>
                  <input
                    type="number"
                    min="0"
                    value={instanceForm.sortOrder}
                    onChange={(e) => setInstanceForm({ ...instanceForm, sortOrder: parseInt(e.target.value, 10) || 0 })}
                    className={inputCls}
                    placeholder="0"
                  />
                </div>
                <div className="flex items-end pb-1">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <Toggle
                        value={instanceForm.enabled}
                        onChange={() => setInstanceForm({ ...instanceForm, enabled: !instanceForm.enabled })}
                      />
                      <span className={`text-sm ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                        {t.instanceEnabled}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Toggle
                        value={instanceForm.refundEnabled}
                        onChange={() =>
                          setInstanceForm({ ...instanceForm, refundEnabled: !instanceForm.refundEnabled })
                        }
                      />
                      <span className={`text-sm ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                        {t.instanceRefundEnabled}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {(PROVIDER_SUPPORTED_TYPES[instanceForm.providerKey] || []).length > 1 && (
                <div>
                  <label className={labelCls}>{t.supportedChannels}</label>
                  <p className={`text-xs mb-2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    {t.supportedChannelsHint}
                  </p>
                  <div className="space-y-2">
                    {(PROVIDER_SUPPORTED_TYPES[instanceForm.providerKey] || []).map((type) => {
                      const isActive = instanceForm.supportedTypes.includes(type);
                      const cidKey = type === 'alipay' ? 'cidAlipay' : type === 'wxpay' ? 'cidWxpay' : '';
                      const cidLabel =
                        type === 'alipay'
                          ? locale === 'en'
                            ? 'Alipay Channel ID'
                            : '支付宝渠道 ID'
                          : locale === 'en'
                            ? 'WeChat Channel ID'
                            : '微信渠道 ID';
                      return (
                        <div key={type} className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() =>
                              setInstanceForm((p) => ({
                                ...p,
                                supportedTypes: isActive
                                  ? p.supportedTypes.filter((t) => t !== type)
                                  : [...p.supportedTypes, type],
                              }))
                            }
                            className={[
                              'rounded-md border px-3 py-1.5 text-xs font-medium transition-colors shrink-0',
                              isActive
                                ? 'border-emerald-500 bg-emerald-500/15 text-emerald-600'
                                : isDark
                                  ? 'border-slate-500 text-slate-400 hover:border-slate-400'
                                  : 'border-slate-300 text-slate-500 hover:border-slate-400',
                            ].join(' ')}
                          >
                            {isActive ? '✓ ' : ''}
                            {PAYMENT_TYPE_LABELS[type]?.[locale] || type}
                          </button>
                          {isActive && cidKey && instanceForm.providerKey === 'easypay' && (
                            <input
                              type="text"
                              value={instanceForm.config[cidKey] ?? ''}
                              onChange={(e) =>
                                setInstanceForm({
                                  ...instanceForm,
                                  config: { ...instanceForm.config, [cidKey]: e.target.value },
                                })
                              }
                              className={[inputCls, 'flex-1'].join(' ')}
                              placeholder={cidLabel}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div>
                <label className={[labelCls, 'mb-2'].join(' ')}>
                  {t.instanceConfig}
                  <span className="text-red-500 ml-0.5">*</span>
                </label>
                <div className="space-y-2.5">
                  {(PROVIDER_CONFIG_FIELDS[instanceForm.providerKey] ?? []).map((field) => (
                    <div key={field.key}>
                      <label
                        className={`block text-xs font-medium mb-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}
                      >
                        {field.label[locale]}
                        {field.optional ? (
                          <span className="ml-1 opacity-50">({locale === 'en' ? 'optional' : '可选'})</span>
                        ) : (
                          <span className="text-red-500 ml-0.5">*</span>
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

              {/* ── 限额配置 (collapsible) ── */}
              <div>
                <button
                  type="button"
                  onClick={() => setLimitsOpen(!limitsOpen)}
                  className={`flex items-center gap-1.5 text-sm font-medium transition-colors ${isDark ? 'text-slate-300 hover:text-slate-100' : 'text-slate-700 hover:text-slate-900'}`}
                >
                  <span
                    className="inline-block transition-transform text-[10px]"
                    style={{ transform: limitsOpen ? 'rotate(90deg)' : 'none' }}
                  >
                    ▶
                  </span>
                  {locale === 'en' ? 'Limits' : '限额配置'}
                  {Object.values(instanceForm.limits).some((l) => l.dailyLimit || l.singleMin || l.singleMax) && (
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded ${isDark ? 'bg-amber-500/15 text-amber-300' : 'bg-amber-50 text-amber-700'}`}
                    >
                      {locale === 'en' ? 'configured' : '已配置'}
                    </span>
                  )}
                </button>
                {limitsOpen && (
                  <div className="mt-2 space-y-3">
                    <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                      {locale === 'en'
                        ? 'Set per-channel transaction limits. Leave empty for unlimited.'
                        : '设置每个渠道的单笔和日限额，留空为不限。'}
                    </p>
                    {(PROVIDER_SUPPORTED_TYPES[instanceForm.providerKey] || []).map((type) => (
                      <div
                        key={type}
                        className={`rounded-lg border p-3 ${isDark ? 'border-slate-600 bg-slate-700/30' : 'border-slate-200 bg-slate-50/50'}`}
                      >
                        <div className={`text-xs font-medium mb-2 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                          {PAYMENT_TYPE_LABELS[type]?.[locale] || type}
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                          <div>
                            <label className={`block text-xs mb-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                              {locale === 'en' ? 'Single Min' : '单笔最小'}
                            </label>
                            <input
                              type="number"
                              min="0"
                              value={instanceForm.limits[type]?.singleMin ?? ''}
                              onChange={(e) => {
                                const val = e.target.value ? Number(e.target.value) : undefined;
                                setInstanceForm((p) => ({
                                  ...p,
                                  limits: {
                                    ...p.limits,
                                    [type]: { ...p.limits[type], singleMin: val },
                                  },
                                }));
                              }}
                              className={inputCls}
                              placeholder={locale === 'en' ? 'Unlimited' : '不限'}
                            />
                          </div>
                          <div>
                            <label className={`block text-xs mb-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                              {locale === 'en' ? 'Single Max' : '单笔最大'}
                            </label>
                            <input
                              type="number"
                              min="0"
                              value={instanceForm.limits[type]?.singleMax ?? ''}
                              onChange={(e) => {
                                const val = e.target.value ? Number(e.target.value) : undefined;
                                setInstanceForm((p) => ({
                                  ...p,
                                  limits: {
                                    ...p.limits,
                                    [type]: { ...p.limits[type], singleMax: val },
                                  },
                                }));
                              }}
                              className={inputCls}
                              placeholder={locale === 'en' ? 'Unlimited' : '不限'}
                            />
                          </div>
                          <div>
                            <label className={`block text-xs mb-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                              {locale === 'en' ? 'Daily Limit' : '每日总限额'}
                            </label>
                            <input
                              type="number"
                              min="0"
                              value={instanceForm.limits[type]?.dailyLimit ?? ''}
                              onChange={(e) => {
                                const val = e.target.value ? Number(e.target.value) : undefined;
                                setInstanceForm((p) => ({
                                  ...p,
                                  limits: {
                                    ...p.limits,
                                    [type]: { ...p.limits[type], dailyLimit: val },
                                  },
                                }));
                              }}
                              className={inputCls}
                              placeholder={locale === 'en' ? 'Unlimited' : '不限'}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setInstanceModalOpen(false);
                  setEditingInstance(null);
                  setError('');
                }}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${isDark ? 'text-slate-400 hover:bg-slate-700' : 'text-slate-600 hover:bg-slate-100'}`}
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
