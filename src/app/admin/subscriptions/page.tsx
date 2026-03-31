'use client';

import { useSearchParams } from 'next/navigation';
import { useState, useEffect, useCallback, Suspense } from 'react';
import PayPageLayout from '@/components/PayPageLayout';
import { resolveLocale, type Locale } from '@/lib/locale';
import { PlatformBadge } from '@/lib/platform-style';

/* ---------- types ---------- */

interface SubscriptionPlan {
  id: string;
  name: string;
  description: string | null;
  price: number;
  originalPrice: number | null;
  validDays: number;
  validityUnit: 'day' | 'week' | 'month';
  features: string[];
  groupId: string | null;
  groupName: string | null;
  sortOrder: number;
  enabled: boolean;
  groupExists: boolean;
  groupPlatform: string | null;
  groupRateMultiplier: number | null;
  groupDailyLimit: number | null;
  groupWeeklyLimit: number | null;
  groupMonthlyLimit: number | null;
  groupModelScopes: string[] | null;
  productName: string | null;
  groupAllowMessagesDispatch: boolean;
  groupDefaultMappedModel: string | null;
}

interface Sub2ApiGroup {
  id: string;
  name: string;
  subscription_type: string;
  daily_limit_usd: number | null;
  weekly_limit_usd: number | null;
  monthly_limit_usd: number | null;
  platform: string | null;
  rate_multiplier: number | null;
  allow_messages_dispatch: boolean;
  default_mapped_model: string | null;
}

interface Sub2ApiSubscription {
  id: number;
  user_id: number;
  group_id: number;
  starts_at: string;
  expires_at: string;
  status: string;
  daily_usage_usd: number;
  weekly_usage_usd: number;
  monthly_usage_usd: number;
  daily_window_start: string | null;
  weekly_window_start: string | null;
  monthly_window_start: string | null;
  notes: string | null;
}

interface SubsUserInfo {
  id: number;
  username: string;
  email: string;
}

/* ---------- i18n ---------- */

function buildText(locale: Locale) {
  return locale === 'en'
    ? {
        missingToken: 'Missing admin token',
        missingTokenHint: 'Please access the admin page from the Sub2API platform.',
        invalidToken: 'Invalid admin token',
        requestFailed: 'Request failed',
        title: 'Subscription Management',
        subtitle: 'Manage subscription plans and user subscriptions',
        refresh: 'Refresh',
        loading: 'Loading...',
        tabPlans: 'Plan Configuration',
        tabSubs: 'User Subscriptions',
        newPlan: 'New Plan',
        editPlan: 'Edit Plan',
        deletePlan: 'Delete Plan',
        deleteConfirm: 'Delete this plan?',
        save: 'Save',
        cancel: 'Cancel',
        fieldGroup: 'Sub2API Group',
        fieldGroupPlaceholder: 'Select a group',
        fieldName: 'Plan Name',
        fieldDescription: 'Description',
        fieldPrice: 'Price (CNY)',
        fieldOriginalPrice: 'Original Price (CNY)',
        fieldValidDays: 'Validity',
        fieldValidUnit: 'Unit',
        unitDay: 'Day(s)',
        unitWeek: 'Week(s)',
        unitMonth: 'Month(s)',
        fieldFeatures: 'Features (one per line)',
        fieldSortOrder: 'Sort Order',
        fieldEnabled: 'For Sale',
        colName: 'Name',
        colGroup: 'Group ID',
        colPrice: 'Price',
        colOriginalPrice: 'Original Price',
        colValidDays: 'Validity',
        colEnabled: 'For Sale',
        colGroupStatus: 'Sub2API Status',
        colActions: 'Actions',
        edit: 'Edit',
        delete: 'Delete',
        enabled: 'Yes',
        disabled: 'No',
        groupExists: 'Exists',
        groupMissing: 'Missing',
        noPlans: 'No plans configured',
        searchUserId: 'Email / Username / Notes / API Key',
        search: 'Search',
        noSubs: 'No subscription records found',
        enterUserId: 'Enter a keyword to search users',
        fieldProductName: 'Payment Product Name',
        fieldProductNamePlaceholder: 'Leave empty for default',
        saveFailed: 'Failed to save plan',
        deleteFailed: 'Failed to delete plan',
        loadFailed: 'Failed to load data',
        days: 'days',
        user: 'User',
        group: 'Group',
        usage: 'Usage',
        expiresAt: 'Expires At',
        status: 'Status',
        active: 'Active',
        expired: 'Expired',
        suspended: 'Suspended',
        daily: 'Daily',
        weekly: 'Weekly',
        monthly: 'Monthly',
        remaining: 'remaining',
        unlimited: 'Unlimited',
        resetIn: 'Reset in',
        noGroup: 'Unknown Group',
        groupInfo: 'Sub2API Group Info',
        groupInfoReadonly: '(read-only, from Sub2API)',
        platform: 'Platform',
        rateMultiplier: 'Rate',
        dailyLimit: 'Daily Limit',
        weeklyLimit: 'Weekly Limit',
        monthlyLimit: 'Monthly Limit',
        modelScopes: 'Models',
      }
    : {
        missingToken: '缺少管理员凭证',
        missingTokenHint: '请从 Sub2API 平台正确访问管理页面',
        invalidToken: '管理员凭证无效',
        requestFailed: '请求失败',
        title: '订阅管理',
        subtitle: '管理订阅套餐与用户订阅',
        refresh: '刷新',
        loading: '加载中...',
        tabPlans: '套餐配置',
        tabSubs: '用户订阅',
        newPlan: '新建套餐',
        editPlan: '编辑套餐',
        deletePlan: '删除套餐',
        deleteConfirm: '确认删除该套餐？',
        save: '保存',
        cancel: '取消',
        fieldGroup: 'Sub2API 分组',
        fieldGroupPlaceholder: '请选择分组',
        fieldName: '套餐名称',
        fieldDescription: '描述',
        fieldPrice: '价格（元）',
        fieldOriginalPrice: '原价（元）',
        fieldValidDays: '有效期',
        fieldValidUnit: '单位',
        unitDay: '天',
        unitWeek: '周',
        unitMonth: '月',
        fieldFeatures: '特性描述（每行一个）',
        fieldSortOrder: '排序',
        fieldEnabled: '启用售卖',
        colName: '名称',
        colGroup: '分组 ID',
        colPrice: '价格',
        colOriginalPrice: '原价',
        colValidDays: '有效期',
        colEnabled: '启用售卖',
        colGroupStatus: 'Sub2API 状态',
        colActions: '操作',
        edit: '编辑',
        delete: '删除',
        enabled: '是',
        disabled: '否',
        groupExists: '存在',
        groupMissing: '缺失',
        noPlans: '暂无套餐配置',
        searchUserId: '邮箱/用户名/备注/API Key',
        search: '搜索',
        noSubs: '未找到订阅记录',
        enterUserId: '输入关键词搜索用户',
        fieldProductName: '支付商品名称',
        fieldProductNamePlaceholder: '留空使用默认名称',
        saveFailed: '保存套餐失败',
        deleteFailed: '删除套餐失败',
        loadFailed: '加载数据失败',
        days: '天',
        user: '用户',
        group: '分组',
        usage: '用量',
        expiresAt: '到期时间',
        status: '状态',
        active: '生效中',
        expired: '已过期',
        suspended: '已暂停',
        daily: '日用量',
        weekly: '周用量',
        monthly: '月用量',
        remaining: '剩余',
        unlimited: '无限制',
        resetIn: '重置于',
        noGroup: '未知分组',
        groupInfo: 'Sub2API 分组信息',
        groupInfoReadonly: '（只读，来自 Sub2API）',
        platform: '平台',
        rateMultiplier: '倍率',
        dailyLimit: '日限额',
        weeklyLimit: '周限额',
        monthlyLimit: '月限额',
        modelScopes: '模型',
      };
}

/* ---------- helpers ---------- */

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function daysRemaining(expiresAt: string | null): number | null {
  if (!expiresAt) return null;
  const now = new Date();
  const exp = new Date(expiresAt);
  const diff = exp.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function resetCountdown(windowStart: string | null, periodDays: number): string | null {
  if (!windowStart) return null;
  const start = new Date(windowStart);
  const resetAt = new Date(start.getTime() + periodDays * 24 * 60 * 60 * 1000);
  const now = new Date();
  const diffMs = resetAt.getTime() - now.getTime();
  if (diffMs <= 0) return null;
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  if (hours >= 24) {
    const d = Math.floor(hours / 24);
    const h = hours % 24;
    return `${d}d ${h}h`;
  }
  return `${hours}h ${minutes}m`;
}

/* ---------- UsageBar component ---------- */

function UsageBar({
  label,
  usage,
  limit,
  resetText,
  isDark,
}: {
  label: string;
  usage: number;
  limit: number | null;
  resetText: string | null;
  isDark: boolean;
}) {
  const pct = limit && limit > 0 ? Math.min((usage / limit) * 100, 100) : 0;
  const barColor = pct > 80 ? 'bg-red-500' : pct > 50 ? 'bg-yellow-500' : 'bg-green-500';

  return (
    <div className="mb-1.5 last:mb-0">
      <div className="flex items-center justify-between text-xs">
        <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>{label}</span>
        <span className={isDark ? 'text-slate-300' : 'text-slate-600'}>
          ${usage.toFixed(2)} {limit != null ? `/ $${limit.toFixed(2)}` : ''}
        </span>
      </div>
      {limit != null && limit > 0 ? (
        <div className={`mt-0.5 h-1.5 w-full rounded-full ${isDark ? 'bg-slate-700' : 'bg-slate-200'}`}>
          <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
        </div>
      ) : null}
      {resetText && (
        <div className={`mt-0.5 text-[10px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{resetText}</div>
      )}
    </div>
  );
}

/* ---------- main content ---------- */

function SubscriptionsContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';
  const theme = searchParams.get('theme') === 'dark' ? 'dark' : 'light';
  const locale = resolveLocale(searchParams.get('lang'));
  const isDark = theme === 'dark';
  const uiMode = searchParams.get('ui_mode') || 'standalone';
  const isEmbedded = uiMode === 'embedded';

  const t = buildText(locale);

  /* --- shared state --- */
  const [activeTab, setActiveTab] = useState<'plans' | 'subs'>('plans');
  const [error, setError] = useState('');

  /* --- plans state --- */
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [groups, setGroups] = useState<Sub2ApiGroup[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<SubscriptionPlan | null>(null);

  /* form state */
  const [formGroupId, setFormGroupId] = useState('');
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formPrice, setFormPrice] = useState('');
  const [formOriginalPrice, setFormOriginalPrice] = useState('');
  const [formValidDays, setFormValidDays] = useState('30');
  const [formValidUnit, setFormValidUnit] = useState<'day' | 'week' | 'month'>('day');
  const [formFeatures, setFormFeatures] = useState('');
  const [formSortOrder, setFormSortOrder] = useState('0');
  const [formEnabled, setFormEnabled] = useState(true);
  const [formProductName, setFormProductName] = useState('');
  const [saving, setSaving] = useState(false);

  /* --- subs state --- */
  const [subsUserId, setSubsUserId] = useState('');
  const [subsKeyword, setSubsKeyword] = useState('');
  const [searchResults, setSearchResults] = useState<{ id: number; email: string; username: string; notes?: string }[]>(
    [],
  );
  const [searchDropdownOpen, setSearchDropdownOpen] = useState(false);
  const [searchTimer, setSearchTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const [subs, setSubs] = useState<Sub2ApiSubscription[]>([]);
  const [subsUser, setSubsUser] = useState<SubsUserInfo | null>(null);
  const [subsLoading, setSubsLoading] = useState(false);
  const [subsSearched, setSubsSearched] = useState(false);

  /* --- fetch plans --- */
  const fetchPlans = useCallback(async () => {
    if (!token) return;
    setPlansLoading(true);
    try {
      const res = await fetch(`/api/admin/subscription-plans?token=${encodeURIComponent(token)}`);
      if (!res.ok) {
        if (res.status === 401) {
          setError(t.invalidToken);
          return;
        }
        throw new Error(t.requestFailed);
      }
      const data = await res.json();
      setPlans(Array.isArray(data) ? data : (data.plans ?? []));
    } catch {
      setError(t.loadFailed);
    } finally {
      setPlansLoading(false);
    }
  }, [token]);

  /* --- fetch groups --- */
  const fetchGroups = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`/api/admin/sub2api/groups?token=${encodeURIComponent(token)}`);
      if (res.ok) {
        const data = await res.json();
        setGroups(Array.isArray(data) ? data : (data.groups ?? []));
      }
    } catch {
      /* ignore */
    }
  }, [token]);

  useEffect(() => {
    fetchPlans();
    fetchGroups();
  }, [fetchPlans, fetchGroups]);

  /* auto-fetch subs when switching to subs tab */
  useEffect(() => {
    if (activeTab === 'subs' && !subsSearched) {
      fetchSubs();
    }
  }, [activeTab]);

  /* --- modal helpers --- */
  const openCreate = () => {
    setEditingPlan(null);
    setFormGroupId('');
    setFormName('');
    setFormDescription('');
    setFormPrice('');
    setFormOriginalPrice('');
    setFormValidDays('1');
    setFormValidUnit('month');
    setFormFeatures('');
    setFormSortOrder('0');
    setFormEnabled(true);
    setFormProductName('');
    setModalOpen(true);
  };

  const openEdit = (plan: SubscriptionPlan) => {
    setEditingPlan(plan);
    setFormGroupId(plan.groupId ?? '');
    setFormName(plan.name);
    setFormDescription(plan.description ?? '');
    setFormPrice(String(plan.price));
    setFormOriginalPrice(plan.originalPrice != null ? String(plan.originalPrice) : '');
    setFormValidDays(String(plan.validDays));
    setFormValidUnit(plan.validityUnit ?? 'day');
    setFormFeatures((plan.features ?? []).join('\n'));
    setFormSortOrder(String(plan.sortOrder));
    setFormEnabled(plan.enabled);
    setFormProductName(plan.productName ?? '');
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingPlan(null);
  };

  /* --- save plan (snake_case for backend) --- */
  const handleSave = async () => {
    if (!formName.trim() || !formPrice || !formGroupId) return;
    setSaving(true);
    setError('');
    const body = {
      group_id: Number(formGroupId),
      name: formName.trim(),
      description: formDescription.trim() || null,
      price: parseFloat(formPrice),
      original_price: formOriginalPrice ? parseFloat(formOriginalPrice) : null,
      validity_days: parseInt(formValidDays, 10) || 30,
      validity_unit: formValidUnit,
      features: formFeatures
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean),
      sort_order: parseInt(formSortOrder, 10) || 0,
      for_sale: formEnabled,
      product_name: formProductName.trim() || null,
    };
    try {
      const url = editingPlan ? `/api/admin/subscription-plans/${editingPlan.id}` : '/api/admin/subscription-plans';
      const method = editingPlan ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || t.saveFailed);
      }
      closeModal();
      fetchPlans();
    } catch (e) {
      // 分组被删除等错误：刷新列表使前端状态同步
      setError(e instanceof Error ? e.message : t.saveFailed);
      fetchPlans();
    } finally {
      setSaving(false);
    }
  };

  /* --- delete plan --- */
  const handleDelete = async (plan: SubscriptionPlan) => {
    if (!confirm(t.deleteConfirm)) return;
    try {
      const res = await fetch(`/api/admin/subscription-plans/${plan.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || t.deleteFailed);
      }
      fetchPlans();
    } catch (e) {
      setError(e instanceof Error ? e.message : t.deleteFailed);
    }
  };

  /* --- toggle plan enabled --- */
  const handleToggleEnabled = async (plan: SubscriptionPlan) => {
    try {
      const res = await fetch(`/api/admin/subscription-plans/${plan.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ for_sale: !plan.enabled }),
      });
      if (res.ok) {
        setPlans((prev) => prev.map((p) => (p.id === plan.id ? { ...p, enabled: !p.enabled } : p)));
      }
    } catch {
      /* ignore */
    }
  };

  /* --- search users (R1) --- */
  const handleKeywordChange = (value: string) => {
    setSubsKeyword(value);
    if (searchTimer) clearTimeout(searchTimer);
    if (!value.trim()) {
      setSubsUserId('');
      setSearchResults([]);
      setSearchDropdownOpen(false);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/admin/sub2api/search-users?token=${encodeURIComponent(token)}&keyword=${encodeURIComponent(value.trim())}`,
        );
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data.users ?? []);
          setSearchDropdownOpen(true);
        }
      } catch {
        /* ignore */
      }
    }, 300);
    setSearchTimer(timer);
  };

  const selectUser = (user: { id: number; email: string; username: string }) => {
    setSubsUserId(String(user.id));
    setSubsKeyword(`${user.email} #${user.id}`);
    setSearchDropdownOpen(false);
    setSearchResults([]);
  };

  /* --- fetch user subs --- */
  const fetchSubs = async () => {
    if (!token) return;
    setSubsLoading(true);
    setSubsSearched(true);
    setSubsUser(null);
    try {
      const qs = new URLSearchParams({ token });
      if (subsUserId.trim()) qs.set('user_id', subsUserId.trim());
      const res = await fetch(`/api/admin/subscriptions?${qs}`);
      if (!res.ok) {
        if (res.status === 401) {
          setError(t.invalidToken);
          return;
        }
        throw new Error(t.requestFailed);
      }
      const data = await res.json();
      setSubs(data.subscriptions ?? []);
      setSubsUser(data.user ?? null);
    } catch {
      setError(t.loadFailed);
    } finally {
      setSubsLoading(false);
    }
  };

  /* --- no token guard --- */
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

  /* --- nav params --- */
  const btnBase = [
    'inline-flex items-center rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
    isDark
      ? 'border-slate-600 text-slate-200 hover:bg-slate-800'
      : 'border-slate-300 text-slate-700 hover:bg-slate-100',
  ].join(' ');

  /* available groups for the form: only subscription type */
  const availableGroups = groups.filter((g) => g.subscription_type === 'subscription');

  /* group id → name map (all groups, for subscription display) */
  const groupNameMap = new Map(groups.map((g) => [String(g.id), g.name]));

  /* --- tab classes --- */
  const tabCls = (active: boolean) =>
    [
      'flex-1 rounded-lg py-2 text-center text-sm font-medium transition-colors cursor-pointer',
      active
        ? isDark
          ? 'bg-indigo-500/30 text-indigo-200 ring-1 ring-indigo-400/40'
          : 'bg-blue-600 text-white'
        : isDark
          ? 'text-slate-400 hover:text-slate-200'
          : 'text-slate-600 hover:text-slate-800',
    ].join(' ');

  /* --- table cell style --- */
  const thCls = [
    'px-4 py-3 text-left text-xs font-medium uppercase tracking-wider',
    isDark ? 'text-slate-400' : 'text-slate-500',
  ].join(' ');

  const tdCls = ['px-4 py-3 text-sm', isDark ? 'text-slate-300' : 'text-slate-700'].join(' ');

  const tableWrapCls = [
    'overflow-x-auto rounded-xl border',
    isDark ? 'border-slate-700 bg-slate-800/70' : 'border-slate-200 bg-white shadow-sm',
  ].join(' ');

  const rowBorderCls = isDark ? 'border-slate-700/50' : 'border-slate-100';

  /* --- input classes --- */
  const inputCls = [
    'w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors',
    isDark
      ? 'border-slate-600 bg-slate-700 text-slate-200 focus:border-indigo-400'
      : 'border-slate-300 bg-white text-slate-800 focus:border-blue-500',
  ].join(' ');

  const labelCls = ['block text-sm font-medium mb-1', isDark ? 'text-slate-300' : 'text-slate-700'].join(' ');

  /* --- status badge --- */
  const statusBadge = (status: string) => {
    const map: Record<string, { label: string; cls: string }> = {
      active: {
        label: t.active,
        cls: isDark ? 'bg-green-500/20 text-green-300' : 'bg-green-50 text-green-700',
      },
      expired: {
        label: t.expired,
        cls: isDark ? 'bg-red-500/20 text-red-300' : 'bg-red-50 text-red-600',
      },
      suspended: {
        label: t.suspended,
        cls: isDark ? 'bg-yellow-500/20 text-yellow-300' : 'bg-yellow-50 text-yellow-700',
      },
    };
    const info = map[status] ?? {
      label: status,
      cls: isDark ? 'bg-slate-700 text-slate-400' : 'bg-gray-100 text-gray-500',
    };
    return (
      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${info.cls}`}>{info.label}</span>
    );
  };

  return (
    <PayPageLayout
      isDark={isDark}
      isEmbedded={isEmbedded}
      maxWidth="full"
      title={t.title}
      subtitle={t.subtitle}
      locale={locale}
      actions={
        <>
          <button
            type="button"
            onClick={() => {
              if (activeTab === 'plans') fetchPlans();
              if (activeTab === 'subs' && subsSearched) fetchSubs();
            }}
            className={btnBase}
          >
            {t.refresh}
          </button>
        </>
      }
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

      {/* Tab switcher */}
      <div className={['mb-5 flex gap-1 rounded-xl p-1', isDark ? 'bg-slate-800' : 'bg-slate-100'].join(' ')}>
        <button type="button" className={tabCls(activeTab === 'plans')} onClick={() => setActiveTab('plans')}>
          {t.tabPlans}
        </button>
        <button type="button" className={tabCls(activeTab === 'subs')} onClick={() => setActiveTab('subs')}>
          {t.tabSubs}
        </button>
      </div>

      {/* ====== Tab: Plan Configuration ====== */}
      {activeTab === 'plans' && (
        <>
          {/* New plan button */}
          <div className="mb-4 flex justify-end">
            <button
              type="button"
              onClick={openCreate}
              className={[
                'inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors',
                isDark
                  ? 'bg-indigo-500/30 text-indigo-200 hover:bg-indigo-500/40'
                  : 'bg-blue-600 text-white hover:bg-blue-700',
              ].join(' ')}
            >
              + {t.newPlan}
            </button>
          </div>

          {/* Plans cards */}
          {plansLoading ? (
            <div className={`py-12 text-center ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>{t.loading}</div>
          ) : plans.length === 0 ? (
            <div className={`py-12 text-center ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>{t.noPlans}</div>
          ) : (
            <div className="space-y-4">
              {plans.map((plan) => (
                <div
                  key={plan.id}
                  className={[
                    'rounded-xl border overflow-hidden',
                    isDark ? 'border-slate-700 bg-slate-800/70' : 'border-slate-200 bg-white shadow-sm',
                  ].join(' ')}
                >
                  {/* ── 套餐配置（上半部分） ── */}
                  <div className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <h3
                          className={['text-base font-semibold', isDark ? 'text-slate-100' : 'text-slate-900'].join(
                            ' ',
                          )}
                        >
                          {plan.name}
                        </h3>
                        <span
                          className={[
                            'inline-block rounded-full px-2 py-0.5 text-xs font-medium',
                            plan.groupExists
                              ? isDark
                                ? 'bg-green-500/20 text-green-300'
                                : 'bg-green-50 text-green-700'
                              : isDark
                                ? 'bg-red-500/20 text-red-300'
                                : 'bg-red-50 text-red-600',
                          ].join(' ')}
                        >
                          {plan.groupExists ? t.groupExists : t.groupMissing}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        {/* Toggle */}
                        <div className="flex items-center gap-1.5">
                          <span className={['text-xs', isDark ? 'text-slate-400' : 'text-slate-500'].join(' ')}>
                            {t.colEnabled}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleToggleEnabled(plan)}
                            className={[
                              'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
                              plan.enabled ? 'bg-emerald-500' : isDark ? 'bg-slate-600' : 'bg-slate-300',
                            ].join(' ')}
                          >
                            <span
                              className={[
                                'inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform',
                                plan.enabled ? 'translate-x-4.5' : 'translate-x-0.5',
                              ].join(' ')}
                            />
                          </button>
                        </div>
                        {/* Actions */}
                        <button
                          type="button"
                          onClick={() => openEdit(plan)}
                          className={[
                            'rounded px-2 py-1 text-xs font-medium transition-colors',
                            isDark ? 'text-indigo-300 hover:bg-indigo-500/20' : 'text-blue-600 hover:bg-blue-50',
                          ].join(' ')}
                        >
                          {t.edit}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(plan)}
                          className={[
                            'rounded px-2 py-1 text-xs font-medium transition-colors',
                            isDark ? 'text-red-400 hover:bg-red-500/20' : 'text-red-600 hover:bg-red-50',
                          ].join(' ')}
                        >
                          {t.delete}
                        </button>
                      </div>
                    </div>

                    {/* Plan fields grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 text-sm">
                      <div>
                        <span className={['text-xs', isDark ? 'text-slate-500' : 'text-slate-400'].join(' ')}>
                          {t.colGroup}
                        </span>
                        <div className={isDark ? 'text-slate-200' : 'text-slate-800'}>
                          {plan.groupId ? (
                            <>
                              <span className="font-mono text-xs">{plan.groupId}</span>
                              {plan.groupName && (
                                <span className={`ml-1 text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                  ({plan.groupName})
                                </span>
                              )}
                            </>
                          ) : (
                            <span className={`text-xs ${isDark ? 'text-yellow-400' : 'text-yellow-600'}`}>
                              {locale === 'en' ? 'Unbound' : '未绑定'}
                            </span>
                          )}
                        </div>
                      </div>
                      <div>
                        <span className={['text-xs', isDark ? 'text-slate-500' : 'text-slate-400'].join(' ')}>
                          {t.colPrice}
                        </span>
                        <div className={isDark ? 'text-slate-200' : 'text-slate-800'}>
                          ¥{plan.price.toFixed(2)}
                          {plan.originalPrice != null && (
                            <span
                              className={`ml-1 line-through text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}
                            >
                              ¥{plan.originalPrice.toFixed(2)}
                            </span>
                          )}
                        </div>
                      </div>
                      <div>
                        <span className={['text-xs', isDark ? 'text-slate-500' : 'text-slate-400'].join(' ')}>
                          {t.colValidDays}
                        </span>
                        <div className={isDark ? 'text-slate-200' : 'text-slate-800'}>
                          {plan.validDays}{' '}
                          {plan.validityUnit === 'month'
                            ? t.unitMonth
                            : plan.validityUnit === 'week'
                              ? t.unitWeek
                              : t.unitDay}
                        </div>
                      </div>
                      <div>
                        <span className={['text-xs', isDark ? 'text-slate-500' : 'text-slate-400'].join(' ')}>
                          {t.fieldSortOrder}
                        </span>
                        <div className={isDark ? 'text-slate-200' : 'text-slate-800'}>{plan.sortOrder}</div>
                      </div>
                    </div>
                  </div>

                  {/* ── Sub2API 分组信息（嵌套只读区域） ── */}
                  {plan.groupExists && (
                    <div
                      className={[
                        'border-t px-4 py-3',
                        isDark ? 'border-slate-700 bg-slate-900/40' : 'border-slate-100 bg-slate-50/80',
                      ].join(' ')}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <span
                          className={['text-xs font-medium', isDark ? 'text-slate-400' : 'text-slate-500'].join(' ')}
                        >
                          {t.groupInfo}
                        </span>
                        <span className={['text-[10px]', isDark ? 'text-slate-600' : 'text-slate-400'].join(' ')}>
                          {t.groupInfoReadonly}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 text-xs">
                        {plan.groupPlatform && (
                          <div>
                            <span className={isDark ? 'text-slate-500' : 'text-slate-400'}>{t.platform}</span>
                            <div className="mt-0.5">
                              <PlatformBadge platform={plan.groupPlatform} />
                            </div>
                          </div>
                        )}
                        {plan.groupRateMultiplier != null && (
                          <div>
                            <span className={isDark ? 'text-slate-500' : 'text-slate-400'}>{t.rateMultiplier}</span>
                            <div className={isDark ? 'text-slate-300' : 'text-slate-600'}>
                              {plan.groupRateMultiplier}x
                            </div>
                          </div>
                        )}
                        <div>
                          <span className={isDark ? 'text-slate-500' : 'text-slate-400'}>{t.dailyLimit}</span>
                          <div className={isDark ? 'text-slate-300' : 'text-slate-600'}>
                            {plan.groupDailyLimit != null ? `$${plan.groupDailyLimit}` : t.unlimited}
                          </div>
                        </div>
                        <div>
                          <span className={isDark ? 'text-slate-500' : 'text-slate-400'}>{t.weeklyLimit}</span>
                          <div className={isDark ? 'text-slate-300' : 'text-slate-600'}>
                            {plan.groupWeeklyLimit != null ? `$${plan.groupWeeklyLimit}` : t.unlimited}
                          </div>
                        </div>
                        <div>
                          <span className={isDark ? 'text-slate-500' : 'text-slate-400'}>{t.monthlyLimit}</span>
                          <div className={isDark ? 'text-slate-300' : 'text-slate-600'}>
                            {plan.groupMonthlyLimit != null ? `$${plan.groupMonthlyLimit}` : t.unlimited}
                          </div>
                        </div>
                        {plan.groupPlatform?.toLowerCase() === 'openai' && (
                          <>
                            <div>
                              <span className={isDark ? 'text-slate-500' : 'text-slate-400'}>/v1/messages 调度</span>
                              <div
                                className={[
                                  'mt-0.5 text-xs font-medium',
                                  plan.groupAllowMessagesDispatch
                                    ? isDark
                                      ? 'text-green-400'
                                      : 'text-green-600'
                                    : isDark
                                      ? 'text-slate-400'
                                      : 'text-slate-500',
                                ].join(' ')}
                              >
                                {plan.groupAllowMessagesDispatch ? '已启用' : '未启用'}
                              </div>
                            </div>
                            {plan.groupDefaultMappedModel && (
                              <div className="sm:col-span-2">
                                <span className={isDark ? 'text-slate-500' : 'text-slate-400'}>默认模型</span>
                                <div
                                  className={[
                                    'mt-0.5 font-mono text-xs',
                                    isDark ? 'text-slate-300' : 'text-slate-600',
                                  ].join(' ')}
                                >
                                  {plan.groupDefaultMappedModel}
                                </div>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ====== Tab: User Subscriptions ====== */}
      {activeTab === 'subs' && (
        <>
          {/* Search bar (R1: fuzzy search) */}
          <div className="mb-4 flex gap-2">
            <div className="relative max-w-sm flex-1">
              <input
                type="text"
                value={subsKeyword}
                onChange={(e) => handleKeywordChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setSearchDropdownOpen(false);
                    fetchSubs();
                  }
                }}
                onFocus={() => {
                  if (searchResults.length > 0) setSearchDropdownOpen(true);
                }}
                placeholder={t.searchUserId}
                className={inputCls}
              />
              {/* Dropdown */}
              {searchDropdownOpen && searchResults.length > 0 && (
                <div
                  className={[
                    'absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-y-auto rounded-lg border shadow-lg',
                    isDark ? 'border-slate-600 bg-slate-800' : 'border-slate-200 bg-white',
                  ].join(' ')}
                >
                  {searchResults.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => selectUser(u)}
                      className={[
                        'w-full px-3 py-2 text-left text-sm transition-colors',
                        isDark ? 'hover:bg-slate-700 text-slate-200' : 'hover:bg-slate-50 text-slate-800',
                      ].join(' ')}
                    >
                      <div className="font-medium">{u.email}</div>
                      <div className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                        {u.username} #{u.id}
                        {u.notes && <span className="ml-2 opacity-70">({u.notes})</span>}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                setSearchDropdownOpen(false);
                fetchSubs();
              }}
              disabled={subsLoading}
              className={[
                'inline-flex items-center rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50',
                isDark
                  ? 'bg-indigo-500/30 text-indigo-200 hover:bg-indigo-500/40'
                  : 'bg-blue-600 text-white hover:bg-blue-700',
              ].join(' ')}
            >
              {t.search}
            </button>
          </div>

          {/* User info card */}
          {subsUser && (
            <div
              className={[
                'mb-4 flex items-center gap-3 rounded-xl border p-3',
                isDark ? 'border-slate-700 bg-slate-800/70' : 'border-slate-200 bg-white shadow-sm',
              ].join(' ')}
            >
              <div
                className={[
                  'flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold',
                  isDark ? 'bg-indigo-500/30 text-indigo-200' : 'bg-blue-100 text-blue-700',
                ].join(' ')}
              >
                {(subsUser.email?.[0] ?? subsUser.username?.[0] ?? '?').toUpperCase()}
              </div>
              <div>
                <div className={`text-sm font-medium ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                  {subsUser.username}
                </div>
                <div className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{subsUser.email}</div>
              </div>
              <div className={`ml-auto text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>ID: {subsUser.id}</div>
            </div>
          )}

          {/* Subs list */}
          <div className={tableWrapCls}>
            {subsLoading ? (
              <div className={`py-12 text-center ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>{t.loading}</div>
            ) : !subsSearched ? (
              <div className={`py-12 text-center ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>{t.loading}</div>
            ) : subs.length === 0 ? (
              <div className={`py-12 text-center ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>{t.noSubs}</div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className={`border-b ${rowBorderCls}`}>
                    <th className={thCls}>{t.group}</th>
                    <th className={thCls}>{t.status}</th>
                    <th className={thCls}>{t.usage}</th>
                    <th className={thCls}>{t.expiresAt}</th>
                  </tr>
                </thead>
                <tbody>
                  {subs.map((sub) => {
                    const gName = groupNameMap.get(String(sub.group_id)) ?? t.noGroup;
                    const remaining = daysRemaining(sub.expires_at);
                    const group = groups.find((g) => String(g.id) === String(sub.group_id));
                    const dailyLimit = group?.daily_limit_usd ?? null;
                    const weeklyLimit = group?.weekly_limit_usd ?? null;
                    const monthlyLimit = group?.monthly_limit_usd ?? null;

                    return (
                      <tr key={sub.id} className={`border-b ${rowBorderCls} last:border-b-0`}>
                        {/* Group */}
                        <td className={tdCls}>
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`inline-block h-2 w-2 rounded-full ${sub.status === 'active' ? 'bg-green-500' : 'bg-slate-400'}`}
                            />
                            <span className="font-medium">{gName}</span>
                          </div>
                          <div className={`mt-0.5 text-xs font-mono ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                            ID: {sub.group_id}
                          </div>
                        </td>

                        {/* Status */}
                        <td className={tdCls}>{statusBadge(sub.status)}</td>

                        {/* Usage */}
                        <td className={`${tdCls} min-w-[200px]`}>
                          <UsageBar
                            label={t.daily}
                            usage={sub.daily_usage_usd}
                            limit={dailyLimit}
                            resetText={
                              sub.daily_window_start
                                ? `${t.resetIn} ${resetCountdown(sub.daily_window_start, 1) ?? '-'}`
                                : null
                            }
                            isDark={isDark}
                          />
                          <UsageBar
                            label={t.weekly}
                            usage={sub.weekly_usage_usd}
                            limit={weeklyLimit}
                            resetText={
                              sub.weekly_window_start
                                ? `${t.resetIn} ${resetCountdown(sub.weekly_window_start, 7) ?? '-'}`
                                : null
                            }
                            isDark={isDark}
                          />
                          <UsageBar
                            label={t.monthly}
                            usage={sub.monthly_usage_usd}
                            limit={monthlyLimit}
                            resetText={
                              sub.monthly_window_start
                                ? `${t.resetIn} ${resetCountdown(sub.monthly_window_start, 30) ?? '-'}`
                                : null
                            }
                            isDark={isDark}
                          />
                        </td>

                        {/* Expires */}
                        <td className={tdCls}>
                          <div>{formatDate(sub.expires_at)}</div>
                          {remaining != null && (
                            <div
                              className={`mt-0.5 text-xs ${
                                remaining <= 0
                                  ? 'text-red-500'
                                  : remaining <= 7
                                    ? 'text-yellow-500'
                                    : isDark
                                      ? 'text-slate-400'
                                      : 'text-slate-500'
                              }`}
                            >
                              {remaining > 0 ? `${remaining} ${t.days} ${t.remaining}` : t.expired}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {/* ====== Edit / Create Modal ====== */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div
            className={[
              'w-full max-w-lg rounded-2xl border p-6 shadow-xl',
              isDark ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-white',
            ].join(' ')}
          >
            <h2 className={['mb-5 text-lg font-semibold', isDark ? 'text-slate-100' : 'text-slate-900'].join(' ')}>
              {editingPlan ? t.editPlan : t.newPlan}
            </h2>

            <div className="max-h-[65vh] space-y-4 overflow-y-auto pr-1">
              {/* Group */}
              <div>
                <label className={labelCls}>{t.fieldGroup}</label>
                <select value={formGroupId} onChange={(e) => setFormGroupId(e.target.value)} className={inputCls}>
                  <option value="">{t.fieldGroupPlaceholder}</option>
                  {availableGroups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name} ({g.id})
                    </option>
                  ))}
                  {/* If editing, ensure the current group is always visible (only if still bound) */}
                  {editingPlan &&
                    editingPlan.groupId &&
                    !availableGroups.some((g) => String(g.id) === editingPlan.groupId) && (
                      <option value={editingPlan.groupId}>
                        {editingPlan.groupName ?? editingPlan.groupId} ({editingPlan.groupId})
                      </option>
                    )}
                </select>
              </div>

              {/* Selected group info card (read-only) */}
              {(() => {
                const selectedGroup = groups.find((g) => String(g.id) === formGroupId);
                if (!selectedGroup) return null;
                return (
                  <div
                    className={[
                      'rounded-lg border p-3 text-xs',
                      isDark ? 'border-slate-700 bg-slate-800/60' : 'border-slate-200 bg-slate-50',
                    ].join(' ')}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className={['font-medium', isDark ? 'text-slate-300' : 'text-slate-600'].join(' ')}>
                        {t.groupInfo}
                      </span>
                      <span className={['text-[10px]', isDark ? 'text-slate-500' : 'text-slate-400'].join(' ')}>
                        {t.groupInfoReadonly}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                      {selectedGroup.platform && (
                        <div>
                          <span className={isDark ? 'text-slate-500' : 'text-slate-400'}>{t.platform}</span>
                          <div className="mt-0.5">
                            <PlatformBadge platform={selectedGroup.platform} />
                          </div>
                        </div>
                      )}
                      {selectedGroup.rate_multiplier != null && (
                        <div>
                          <span className={isDark ? 'text-slate-500' : 'text-slate-400'}>{t.rateMultiplier}</span>
                          <div className={isDark ? 'text-slate-300' : 'text-slate-600'}>
                            {selectedGroup.rate_multiplier}x
                          </div>
                        </div>
                      )}
                      <div>
                        <span className={isDark ? 'text-slate-500' : 'text-slate-400'}>{t.dailyLimit}</span>
                        <div className={isDark ? 'text-slate-300' : 'text-slate-600'}>
                          {selectedGroup.daily_limit_usd != null ? `$${selectedGroup.daily_limit_usd}` : t.unlimited}
                        </div>
                      </div>
                      <div>
                        <span className={isDark ? 'text-slate-500' : 'text-slate-400'}>{t.weeklyLimit}</span>
                        <div className={isDark ? 'text-slate-300' : 'text-slate-600'}>
                          {selectedGroup.weekly_limit_usd != null ? `$${selectedGroup.weekly_limit_usd}` : t.unlimited}
                        </div>
                      </div>
                      <div>
                        <span className={isDark ? 'text-slate-500' : 'text-slate-400'}>{t.monthlyLimit}</span>
                        <div className={isDark ? 'text-slate-300' : 'text-slate-600'}>
                          {selectedGroup.monthly_limit_usd != null
                            ? `$${selectedGroup.monthly_limit_usd}`
                            : t.unlimited}
                        </div>
                      </div>
                      {selectedGroup.platform?.toLowerCase() === 'openai' && (
                        <div>
                          <span className={isDark ? 'text-slate-500' : 'text-slate-400'}>/v1/messages 调度</span>
                          <div
                            className={[
                              'mt-0.5 font-medium',
                              selectedGroup.allow_messages_dispatch
                                ? isDark
                                  ? 'text-green-400'
                                  : 'text-green-600'
                                : isDark
                                  ? 'text-slate-400'
                                  : 'text-slate-500',
                            ].join(' ')}
                          >
                            {selectedGroup.allow_messages_dispatch ? '已启用' : '未启用'}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* Name */}
              <div>
                <label className={labelCls}>{t.fieldName} *</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className={inputCls}
                  required
                />
              </div>

              {/* Description */}
              <div>
                <label className={labelCls}>{t.fieldDescription}</label>
                <textarea
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  rows={2}
                  className={inputCls}
                />
              </div>

              {/* Price */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>{t.fieldPrice} *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max="99999999.99"
                    value={formPrice}
                    onChange={(e) => setFormPrice(e.target.value)}
                    className={inputCls}
                    required
                  />
                </div>
                <div>
                  <label className={labelCls}>{t.fieldOriginalPrice}</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max="99999999.99"
                    value={formOriginalPrice}
                    onChange={(e) => setFormOriginalPrice(e.target.value)}
                    className={inputCls}
                  />
                </div>
              </div>

              {/* Valid days + Unit */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>{t.fieldValidDays}</label>
                  <input
                    type="number"
                    min="1"
                    value={formValidDays}
                    onChange={(e) => setFormValidDays(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>{t.fieldValidUnit}</label>
                  <select
                    value={formValidUnit}
                    onChange={(e) => setFormValidUnit(e.target.value as 'day' | 'week' | 'month')}
                    className={inputCls}
                  >
                    <option value="day">{t.unitDay}</option>
                    <option value="week">{t.unitWeek}</option>
                    <option value="month">{t.unitMonth}</option>
                  </select>
                </div>
              </div>

              {/* Sort Order */}
              <div>
                <label className={labelCls}>{t.fieldSortOrder}</label>
                <input
                  type="number"
                  value={formSortOrder}
                  onChange={(e) => setFormSortOrder(e.target.value)}
                  className={inputCls}
                />
              </div>

              {/* Features */}
              <div>
                <label className={labelCls}>{t.fieldFeatures}</label>
                <textarea
                  value={formFeatures}
                  onChange={(e) => setFormFeatures(e.target.value)}
                  rows={4}
                  className={inputCls}
                />
              </div>

              {/* Product Name (R3) */}
              <div>
                <label className={labelCls}>{t.fieldProductName}</label>
                <input
                  type="text"
                  value={formProductName}
                  onChange={(e) => setFormProductName(e.target.value)}
                  placeholder={t.fieldProductNamePlaceholder}
                  className={inputCls}
                />
              </div>

              {/* Enabled */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setFormEnabled(!formEnabled)}
                  className={[
                    'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                    formEnabled ? 'bg-emerald-500' : isDark ? 'bg-slate-600' : 'bg-slate-300',
                  ].join(' ')}
                >
                  <span
                    className={[
                      'inline-block h-4 w-4 rounded-full bg-white transition-transform',
                      formEnabled ? 'translate-x-6' : 'translate-x-1',
                    ].join(' ')}
                  />
                </button>
                <span className={['text-sm', isDark ? 'text-slate-300' : 'text-slate-700'].join(' ')}>
                  {t.fieldEnabled}
                </span>
              </div>
            </div>

            {/* Modal actions */}
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeModal}
                className={[
                  'rounded-lg border px-4 py-2 text-sm font-medium transition-colors',
                  isDark
                    ? 'border-slate-600 text-slate-300 hover:bg-slate-800'
                    : 'border-slate-300 text-slate-700 hover:bg-slate-50',
                ].join(' ')}
              >
                {t.cancel}
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || !formName.trim() || !formPrice || !formGroupId}
                className={[
                  'rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50',
                  isDark
                    ? 'bg-indigo-500/30 text-indigo-200 hover:bg-indigo-500/40'
                    : 'bg-blue-600 text-white hover:bg-blue-700',
                ].join(' ')}
              >
                {saving ? t.loading : t.save}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ====== Extend Confirmation Modal ====== */}
    </PayPageLayout>
  );
}

/* ---------- fallback + export ---------- */

function SubscriptionsPageFallback() {
  const searchParams = useSearchParams();
  const locale = resolveLocale(searchParams.get('lang'));

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-slate-500">{locale === 'en' ? 'Loading...' : '加载中...'}</div>
    </div>
  );
}

export default function SubscriptionsPage() {
  return (
    <Suspense fallback={<SubscriptionsPageFallback />}>
      <SubscriptionsContent />
    </Suspense>
  );
}
