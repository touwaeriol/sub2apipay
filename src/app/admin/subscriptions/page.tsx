'use client';

import { useSearchParams } from 'next/navigation';
import { useState, useEffect, useCallback, Suspense } from 'react';
import PayPageLayout from '@/components/PayPageLayout';
import { resolveLocale, type Locale } from '@/lib/locale';

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
  groupId: string;
  groupName: string | null;
  sortOrder: number;
  enabled: boolean;
  groupExists: boolean;
}

interface Sub2ApiGroup {
  id: string;
  name: string;
  subscription_type: string;
  daily_limit_usd: number | null;
  weekly_limit_usd: number | null;
  monthly_limit_usd: number | null;
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
        orders: 'Order Management',
        dashboard: 'Dashboard',
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
        colGroupStatus: 'Group Status',
        colActions: 'Actions',
        edit: 'Edit',
        delete: 'Delete',
        enabled: 'Yes',
        disabled: 'No',
        groupExists: 'Exists',
        groupMissing: 'Missing',
        noPlans: 'No plans configured',
        searchUserId: 'Search by user ID',
        search: 'Search',
        noSubs: 'No subscription records found',
        enterUserId: 'Enter a user ID to search',
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
      }
    : {
        missingToken: '缺少管理员凭证',
        missingTokenHint: '请从 Sub2API 平台正确访问管理页面',
        invalidToken: '管理员凭证无效',
        requestFailed: '请求失败',
        title: '订阅管理',
        subtitle: '管理订阅套餐与用户订阅',
        orders: '订单管理',
        dashboard: '数据概览',
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
        colEnabled: '售卖',
        colGroupStatus: '分组状态',
        colActions: '操作',
        edit: '编辑',
        delete: '删除',
        enabled: '是',
        disabled: '否',
        groupExists: '存在',
        groupMissing: '缺失',
        noPlans: '暂无套餐配置',
        searchUserId: '按用户 ID 搜索',
        search: '搜索',
        noSubs: '未找到订阅记录',
        enterUserId: '请输入用户 ID 进行搜索',
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
  const [saving, setSaving] = useState(false);

  /* --- subs state --- */
  const [subsUserId, setSubsUserId] = useState('');
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
      setPlans(Array.isArray(data) ? data : data.plans ?? []);
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
        setGroups(Array.isArray(data) ? data : data.groups ?? []);
      }
    } catch {
      /* ignore */
    }
  }, [token]);

  useEffect(() => {
    fetchPlans();
    fetchGroups();
  }, [fetchPlans, fetchGroups]);

  /* --- modal helpers --- */
  const openCreate = () => {
    setEditingPlan(null);
    setFormGroupId('');
    setFormName('');
    setFormDescription('');
    setFormPrice('');
    setFormOriginalPrice('');
    setFormValidDays('30');
    setFormValidUnit('day');
    setFormFeatures('');
    setFormSortOrder('0');
    setFormEnabled(true);
    setModalOpen(true);
  };

  const openEdit = (plan: SubscriptionPlan) => {
    setEditingPlan(plan);
    setFormGroupId(plan.groupId);
    setFormName(plan.name);
    setFormDescription(plan.description ?? '');
    setFormPrice(String(plan.price));
    setFormOriginalPrice(plan.originalPrice != null ? String(plan.originalPrice) : '');
    setFormValidDays(String(plan.validDays));
    setFormValidUnit(plan.validityUnit ?? 'day');
    setFormFeatures((plan.features ?? []).join('\n'));
    setFormSortOrder(String(plan.sortOrder));
    setFormEnabled(plan.enabled);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingPlan(null);
  };

  /* --- save plan (snake_case for backend) --- */
  const handleSave = async () => {
    if (!formName.trim() || !formPrice) return;
    setSaving(true);
    setError('');
    const body = {
      group_id: formGroupId ? Number(formGroupId) : undefined,
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
    };
    try {
      const url = editingPlan
        ? `/api/admin/subscription-plans/${editingPlan.id}`
        : '/api/admin/subscription-plans';
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
      setError(e instanceof Error ? e.message : t.saveFailed);
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

  /* --- fetch user subs --- */
  const fetchSubs = async () => {
    if (!token || !subsUserId.trim()) return;
    setSubsLoading(true);
    setSubsSearched(true);
    setSubsUser(null);
    try {
      const res = await fetch(
        `/api/admin/subscriptions?token=${encodeURIComponent(token)}&user_id=${encodeURIComponent(subsUserId.trim())}`,
      );
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
          <p className="mt-2 text-sm text-gray-500">{t.missingTokenHint}</p>
        </div>
      </div>
    );
  }

  /* --- nav params --- */
  const navParams = new URLSearchParams();
  navParams.set('token', token);
  if (locale === 'en') navParams.set('lang', 'en');
  if (isDark) navParams.set('theme', 'dark');
  if (isEmbedded) navParams.set('ui_mode', 'embedded');

  const btnBase = [
    'inline-flex items-center rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
    isDark
      ? 'border-slate-600 text-slate-200 hover:bg-slate-800'
      : 'border-slate-300 text-slate-700 hover:bg-slate-100',
  ].join(' ');

  /* available groups for the form: only subscription type, exclude already used */
  const subscriptionGroups = groups.filter((g) => g.subscription_type === 'subscription');
  const usedGroupIds = new Set(plans.filter((p) => p.id !== editingPlan?.id).map((p) => p.groupId));
  const availableGroups = subscriptionGroups.filter((g) => !usedGroupIds.has(String(g.id)));

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
          <a href={`/admin?${navParams}`} className={btnBase}>
            {t.orders}
          </a>
          <a href={`/admin/dashboard?${navParams}`} className={btnBase}>
            {t.dashboard}
          </a>
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
      <div
        className={[
          'mb-5 flex gap-1 rounded-xl p-1',
          isDark ? 'bg-slate-800' : 'bg-slate-100',
        ].join(' ')}
      >
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

          {/* Plans table */}
          <div className={tableWrapCls}>
            {plansLoading ? (
              <div className={`py-12 text-center ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>{t.loading}</div>
            ) : plans.length === 0 ? (
              <div className={`py-12 text-center ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>{t.noPlans}</div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className={`border-b ${rowBorderCls}`}>
                    <th className={thCls}>{t.colName}</th>
                    <th className={thCls}>{t.colGroup}</th>
                    <th className={thCls}>{t.colPrice}</th>
                    <th className={thCls}>{t.colOriginalPrice}</th>
                    <th className={thCls}>{t.colValidDays}</th>
                    <th className={thCls}>{t.colEnabled}</th>
                    <th className={thCls}>{t.colGroupStatus}</th>
                    <th className={thCls}>{t.colActions}</th>
                  </tr>
                </thead>
                <tbody>
                  {plans.map((plan) => (
                    <tr key={plan.id} className={`border-b ${rowBorderCls} last:border-b-0`}>
                      <td className={tdCls}>{plan.name}</td>
                      <td className={tdCls}>
                        <span className="font-mono text-xs">{plan.groupId}</span>
                        {plan.groupName && (
                          <span className={`ml-1 text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                            ({plan.groupName})
                          </span>
                        )}
                      </td>
                      <td className={tdCls}>{plan.price.toFixed(2)}</td>
                      <td className={tdCls}>
                        {plan.originalPrice != null ? plan.originalPrice.toFixed(2) : '-'}
                      </td>
                      <td className={tdCls}>
                        {plan.validDays}{' '}
                        {plan.validityUnit === 'month'
                          ? t.unitMonth
                          : plan.validityUnit === 'week'
                            ? t.unitWeek
                            : t.unitDay}
                      </td>
                      <td className={tdCls}>
                        <span
                          className={[
                            'inline-block rounded-full px-2 py-0.5 text-xs font-medium',
                            plan.enabled
                              ? isDark
                                ? 'bg-green-500/20 text-green-300'
                                : 'bg-green-50 text-green-700'
                              : isDark
                                ? 'bg-slate-700 text-slate-400'
                                : 'bg-gray-100 text-gray-500',
                          ].join(' ')}
                        >
                          {plan.enabled ? t.enabled : t.disabled}
                        </span>
                      </td>
                      <td className={tdCls}>
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
                      </td>
                      <td className={tdCls}>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => openEdit(plan)}
                            className={[
                              'rounded px-2 py-1 text-xs font-medium transition-colors',
                              isDark
                                ? 'text-indigo-300 hover:bg-indigo-500/20'
                                : 'text-blue-600 hover:bg-blue-50',
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
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {/* ====== Tab: User Subscriptions ====== */}
      {activeTab === 'subs' && (
        <>
          {/* Search bar */}
          <div className="mb-4 flex gap-2">
            <input
              type="text"
              value={subsUserId}
              onChange={(e) => setSubsUserId(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && fetchSubs()}
              placeholder={t.searchUserId}
              className={[inputCls, 'max-w-xs'].join(' ')}
            />
            <button
              type="button"
              onClick={fetchSubs}
              disabled={subsLoading || !subsUserId.trim()}
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
              <div className={`ml-auto text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                ID: {subsUser.id}
              </div>
            </div>
          )}

          {/* Subs list */}
          <div className={tableWrapCls}>
            {subsLoading ? (
              <div className={`py-12 text-center ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>{t.loading}</div>
            ) : !subsSearched ? (
              <div className={`py-12 text-center ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
                {t.enterUserId}
              </div>
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
                              {remaining > 0
                                ? `${remaining} ${t.days} ${t.remaining}`
                                : t.expired}
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
            <h2
              className={[
                'mb-5 text-lg font-semibold',
                isDark ? 'text-slate-100' : 'text-slate-900',
              ].join(' ')}
            >
              {editingPlan ? t.editPlan : t.newPlan}
            </h2>

            <div className="max-h-[65vh] space-y-4 overflow-y-auto pr-1">
              {/* Group */}
              <div>
                <label className={labelCls}>{t.fieldGroup}</label>
                <select
                  value={formGroupId}
                  onChange={(e) => setFormGroupId(e.target.value)}
                  className={inputCls}
                >
                  <option value="">{t.fieldGroupPlaceholder}</option>
                  {availableGroups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name} ({g.id})
                    </option>
                  ))}
                  {/* If editing, ensure the current group is always visible */}
                  {editingPlan && !availableGroups.some((g) => String(g.id) === editingPlan.groupId) && (
                    <option value={editingPlan.groupId}>
                      {editingPlan.groupName ?? editingPlan.groupId} ({editingPlan.groupId})
                    </option>
                  )}
                </select>
              </div>

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
                    min="0"
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
                    min="0"
                    value={formOriginalPrice}
                    onChange={(e) => setFormOriginalPrice(e.target.value)}
                    className={inputCls}
                  />
                </div>
              </div>

              {/* Valid days + Unit + Sort */}
              <div className="grid grid-cols-3 gap-3">
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
                <div>
                  <label className={labelCls}>{t.fieldSortOrder}</label>
                  <input
                    type="number"
                    value={formSortOrder}
                    onChange={(e) => setFormSortOrder(e.target.value)}
                    className={inputCls}
                  />
                </div>
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

              {/* Enabled */}
              <div className="flex items-center gap-2">
                <input
                  id="form-enabled"
                  type="checkbox"
                  checked={formEnabled}
                  onChange={(e) => setFormEnabled(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300"
                />
                <label
                  htmlFor="form-enabled"
                  className={['text-sm', isDark ? 'text-slate-300' : 'text-slate-700'].join(' ')}
                >
                  {t.fieldEnabled}
                </label>
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
                disabled={saving || !formName.trim() || !formPrice}
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
      <div className="text-gray-500">{locale === 'en' ? 'Loading...' : '加载中...'}</div>
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
