'use client';

import { useSearchParams } from 'next/navigation';
import { useState, useEffect, useCallback, Suspense } from 'react';
import PayPageLayout from '@/components/PayPageLayout';
import { resolveLocale, type Locale } from '@/lib/locale';

// ── Types ──

interface Channel {
  id: string;
  groupId: number;
  name: string;
  platform: string;
  rateMultiplier: number;
  description: string | null;
  models: string | null;
  features: string | null;
  sortOrder: number;
  enabled: boolean;
  groupExists: boolean;
  createdAt: string;
  updatedAt: string;
}

interface Sub2ApiGroup {
  id: number;
  name: string;
  description: string;
  platform: string;
  status: string;
  rate_multiplier: number;
}

interface ChannelFormData {
  group_id: number | '';
  name: string;
  platform: string;
  rate_multiplier: string;
  description: string;
  models: string;
  features: string;
  sort_order: string;
  enabled: boolean;
}

const PLATFORMS = ['claude', 'openai', 'gemini', 'codex', 'sora'] as const;

const PLATFORM_COLORS: Record<string, { bg: string; text: string }> = {
  claude: { bg: 'bg-orange-100 dark:bg-orange-900/40', text: 'text-orange-700 dark:text-orange-300' },
  openai: { bg: 'bg-green-100 dark:bg-green-900/40', text: 'text-green-700 dark:text-green-300' },
  gemini: { bg: 'bg-blue-100 dark:bg-blue-900/40', text: 'text-blue-700 dark:text-blue-300' },
  codex: { bg: 'bg-purple-100 dark:bg-purple-900/40', text: 'text-purple-700 dark:text-purple-300' },
  sora: { bg: 'bg-pink-100 dark:bg-pink-900/40', text: 'text-pink-700 dark:text-pink-300' },
};

// ── i18n ──

function getTexts(locale: Locale) {
  return locale === 'en'
    ? {
        missingToken: 'Missing admin token',
        missingTokenHint: 'Please access the admin page from the Sub2API platform.',
        invalidToken: 'Invalid admin token',
        title: 'Channel Management',
        subtitle: 'Configure and manage subscription channels',
        orders: 'Orders',
        refresh: 'Refresh',
        loading: 'Loading...',
        noChannels: 'No channels found',
        noChannelsHint: 'Click "Sync from Sub2API" or "New Channel" to get started.',
        syncFromSub2Api: 'Sync from Sub2API',
        newChannel: 'New Channel',
        editChannel: 'Edit Channel',
        colName: 'Name',
        colPlatform: 'Platform',
        colRate: 'Rate',
        colSub2ApiStatus: 'Sub2API Status',
        colSortOrder: 'Sort',
        colEnabled: 'Enabled',
        colActions: 'Actions',
        edit: 'Edit',
        delete: 'Delete',
        deleteConfirm: 'Are you sure you want to delete this channel?',
        fieldName: 'Channel Name',
        fieldPlatform: 'Category',
        fieldRate: 'Rate Multiplier',
        fieldRateHint: 'e.g. 0.15 means 0.15x',
        fieldDescription: 'Description',
        fieldModels: 'Supported Models (one per line)',
        fieldFeatures: 'Features (one per line)',
        fieldSortOrder: 'Sort Order',
        fieldEnabled: 'Enable Channel',
        fieldGroupId: 'Sub2API Group ID',
        cancel: 'Cancel',
        save: 'Save',
        saving: 'Saving...',
        syncTitle: 'Sync from Sub2API',
        syncHint: 'Select groups to import as channels',
        syncLoading: 'Loading groups...',
        syncNoGroups: 'No groups found in Sub2API',
        syncAlreadyExists: 'Already imported',
        syncImport: 'Import Selected',
        syncImporting: 'Importing...',
        loadFailed: 'Failed to load channels',
        saveFailed: 'Failed to save channel',
        deleteFailed: 'Failed to delete channel',
        syncFetchFailed: 'Failed to fetch Sub2API groups',
        syncImportFailed: 'Failed to import groups',
        syncImportSuccess: (n: number) => `Successfully imported ${n} channel(s)`,
        yes: 'Yes',
        no: 'No',
      }
    : {
        missingToken: '缺少管理员凭证',
        missingTokenHint: '请从 Sub2API 平台正确访问管理页面',
        invalidToken: '管理员凭证无效',
        title: '渠道管理',
        subtitle: '配置和管理订阅渠道',
        orders: '订单管理',
        refresh: '刷新',
        loading: '加载中...',
        noChannels: '暂无渠道',
        noChannelsHint: '点击「从 Sub2API 同步」或「新建渠道」开始创建。',
        syncFromSub2Api: '从 Sub2API 同步',
        newChannel: '新建渠道',
        editChannel: '编辑渠道',
        colName: '名称',
        colPlatform: '平台',
        colRate: '倍率',
        colSub2ApiStatus: 'Sub2API 状态',
        colSortOrder: '排序',
        colEnabled: '启用',
        colActions: '操作',
        edit: '编辑',
        delete: '删除',
        deleteConfirm: '确定要删除该渠道吗？',
        fieldName: '渠道名称',
        fieldPlatform: '分类',
        fieldRate: '倍率',
        fieldRateHint: '如 0.15 表示 0.15 倍',
        fieldDescription: '描述',
        fieldModels: '支持模型（每行一个）',
        fieldFeatures: '功能特性（每行一个）',
        fieldSortOrder: '排序',
        fieldEnabled: '启用渠道',
        fieldGroupId: 'Sub2API 分组 ID',
        cancel: '取消',
        save: '保存',
        saving: '保存中...',
        syncTitle: '从 Sub2API 同步',
        syncHint: '选择要导入为渠道的分组',
        syncLoading: '加载分组中...',
        syncNoGroups: 'Sub2API 中没有找到分组',
        syncAlreadyExists: '已导入',
        syncImport: '导入所选',
        syncImporting: '导入中...',
        loadFailed: '加载渠道列表失败',
        saveFailed: '保存渠道失败',
        deleteFailed: '删除渠道失败',
        syncFetchFailed: '获取 Sub2API 分组列表失败',
        syncImportFailed: '导入分组失败',
        syncImportSuccess: (n: number) => `成功导入 ${n} 个渠道`,
        yes: '是',
        no: '否',
      };
}

// ── Helpers ──

function parseJsonArray(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function arrayToLines(value: string | null): string {
  return parseJsonArray(value).join('\n');
}

function linesToJsonString(lines: string): string {
  const arr = lines
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  return JSON.stringify(arr);
}

const emptyForm: ChannelFormData = {
  group_id: '',
  name: '',
  platform: 'claude',
  rate_multiplier: '1',
  description: '',
  models: '',
  features: '',
  sort_order: '0',
  enabled: true,
};

// ── Main Content ──

function ChannelsContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';
  const theme = searchParams.get('theme') === 'dark' ? 'dark' : 'light';
  const uiMode = searchParams.get('ui_mode') || 'standalone';
  const locale = resolveLocale(searchParams.get('lang'));
  const isDark = theme === 'dark';
  const isEmbedded = uiMode === 'embedded';
  const t = getTexts(locale);

  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Edit modal state
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingChannel, setEditingChannel] = useState<Channel | null>(null);
  const [form, setForm] = useState<ChannelFormData>(emptyForm);
  const [saving, setSaving] = useState(false);

  // Sync modal state
  const [syncModalOpen, setSyncModalOpen] = useState(false);
  const [syncGroups, setSyncGroups] = useState<Sub2ApiGroup[]>([]);
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncSelected, setSyncSelected] = useState<Set<number>>(new Set());
  const [syncImporting, setSyncImporting] = useState(false);

  // ── Fetch channels ──

  const fetchChannels = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/channels?token=${encodeURIComponent(token)}`);
      if (!res.ok) {
        if (res.status === 401) {
          setError(t.invalidToken);
          return;
        }
        throw new Error();
      }
      const data = await res.json();
      setChannels(data.channels);
    } catch {
      setError(t.loadFailed);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchChannels();
  }, [fetchChannels]);

  // ── Missing token ──

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

  // ── Edit modal handlers ──

  const openCreateModal = () => {
    setEditingChannel(null);
    setForm(emptyForm);
    setEditModalOpen(true);
  };

  const openEditModal = (channel: Channel) => {
    setEditingChannel(channel);
    setForm({
      group_id: channel.groupId,
      name: channel.name,
      platform: channel.platform,
      rate_multiplier: String(channel.rateMultiplier),
      description: channel.description ?? '',
      models: arrayToLines(channel.models),
      features: arrayToLines(channel.features),
      sort_order: String(channel.sortOrder),
      enabled: channel.enabled,
    });
    setEditModalOpen(true);
  };

  const closeEditModal = () => {
    setEditModalOpen(false);
    setEditingChannel(null);
  };

  const handleSave = async () => {
    if (!form.name.trim() || form.group_id === '' || !form.rate_multiplier) return;
    setSaving(true);
    setError('');

    const body = {
      group_id: Number(form.group_id),
      name: form.name.trim(),
      platform: form.platform,
      rate_multiplier: parseFloat(form.rate_multiplier),
      description: form.description.trim() || null,
      models: form.models.trim() ? linesToJsonString(form.models) : null,
      features: form.features.trim() ? linesToJsonString(form.features) : null,
      sort_order: parseInt(form.sort_order, 10) || 0,
      enabled: form.enabled,
    };

    try {
      const url = editingChannel ? `/api/admin/channels/${editingChannel.id}` : '/api/admin/channels';
      const method = editingChannel ? 'PUT' : 'POST';

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
        setError(data.error || t.saveFailed);
        return;
      }

      closeEditModal();
      fetchChannels();
    } catch {
      setError(t.saveFailed);
    } finally {
      setSaving(false);
    }
  };

  // ── Delete handler ──

  const handleDelete = async (channel: Channel) => {
    if (!confirm(t.deleteConfirm)) return;
    try {
      const res = await fetch(`/api/admin/channels/${channel.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || t.deleteFailed);
        return;
      }
      fetchChannels();
    } catch {
      setError(t.deleteFailed);
    }
  };

  // ── Toggle enabled ──

  const handleToggleEnabled = async (channel: Channel) => {
    try {
      const res = await fetch(`/api/admin/channels/${channel.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ enabled: !channel.enabled }),
      });
      if (res.ok) {
        setChannels((prev) => prev.map((c) => (c.id === channel.id ? { ...c, enabled: !c.enabled } : c)));
      }
    } catch {
      /* ignore */
    }
  };

  // ── Sync modal handlers ──

  const openSyncModal = async () => {
    setSyncModalOpen(true);
    setSyncLoading(true);
    setSyncSelected(new Set());
    try {
      const res = await fetch(`/api/admin/sub2api/groups?token=${encodeURIComponent(token)}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setSyncGroups(data.groups ?? []);
    } catch {
      setError(t.syncFetchFailed);
      setSyncModalOpen(false);
    } finally {
      setSyncLoading(false);
    }
  };

  const closeSyncModal = () => {
    setSyncModalOpen(false);
    setSyncGroups([]);
    setSyncSelected(new Set());
  };

  const existingGroupIds = new Set(channels.map((c) => c.groupId));

  const toggleSyncGroup = (id: number) => {
    setSyncSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSyncImport = async () => {
    if (syncSelected.size === 0) return;
    setSyncImporting(true);
    setError('');
    let successCount = 0;

    for (const groupId of syncSelected) {
      const group = syncGroups.find((g) => g.id === groupId);
      if (!group) continue;

      try {
        const res = await fetch('/api/admin/channels', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            group_id: group.id,
            name: group.name,
            platform: group.platform || 'claude',
            rate_multiplier: group.rate_multiplier ?? 1,
            description: group.description || null,
            sort_order: 0,
            enabled: true,
          }),
        });
        if (res.ok) successCount++;
      } catch {
        /* continue with remaining */
      }
    }

    setSyncImporting(false);
    closeSyncModal();

    if (successCount > 0) {
      fetchChannels();
    } else {
      setError(t.syncImportFailed);
    }
  };

  // ── Nav params ──

  const navParams = new URLSearchParams();
  if (token) navParams.set('token', token);
  if (locale === 'en') navParams.set('lang', 'en');
  if (isDark) navParams.set('theme', 'dark');
  if (isEmbedded) navParams.set('ui_mode', 'embedded');

  const btnBase = [
    'inline-flex items-center rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
    isDark
      ? 'border-slate-600 text-slate-200 hover:bg-slate-800'
      : 'border-slate-300 text-slate-700 hover:bg-slate-100',
  ].join(' ');

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
      actions={
        <>
          <a href={`/admin?${navParams}`} className={btnBase}>
            {t.orders}
          </a>
          <button type="button" onClick={fetchChannels} className={btnBase}>
            {t.refresh}
          </button>
          <button
            type="button"
            onClick={openSyncModal}
            className="inline-flex items-center rounded-lg border border-indigo-500 bg-indigo-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-600"
          >
            {t.syncFromSub2Api}
          </button>
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center rounded-lg border border-emerald-500 bg-emerald-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-600"
          >
            {t.newChannel}
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

      {/* Channel table */}
      <div
        className={[
          'overflow-x-auto rounded-xl border',
          isDark ? 'border-slate-700 bg-slate-800/70' : 'border-slate-200 bg-white shadow-sm',
        ].join(' ')}
      >
        {loading ? (
          <div className={`py-12 text-center ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>{t.loading}</div>
        ) : channels.length === 0 ? (
          <div className={`py-12 text-center ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
            <p className="text-base font-medium">{t.noChannels}</p>
            <p className="mt-1 text-sm opacity-70">{t.noChannelsHint}</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className={isDark ? 'border-b border-slate-700 text-slate-400' : 'border-b border-slate-200 text-slate-500'}>
                <th className="px-4 py-3 text-left font-medium">{t.colName}</th>
                <th className="px-4 py-3 text-left font-medium">{t.colPlatform}</th>
                <th className="px-4 py-3 text-left font-medium">{t.colRate}</th>
                <th className="px-4 py-3 text-center font-medium">{t.colSub2ApiStatus}</th>
                <th className="px-4 py-3 text-center font-medium">{t.colSortOrder}</th>
                <th className="px-4 py-3 text-center font-medium">{t.colEnabled}</th>
                <th className="px-4 py-3 text-right font-medium">{t.colActions}</th>
              </tr>
            </thead>
            <tbody>
              {channels.map((channel) => {
                const pc = PLATFORM_COLORS[channel.platform] ?? PLATFORM_COLORS.claude;
                return (
                  <tr
                    key={channel.id}
                    className={[
                      'border-b transition-colors',
                      isDark ? 'border-slate-700/50 hover:bg-slate-700/30' : 'border-slate-100 hover:bg-slate-50',
                    ].join(' ')}
                  >
                    <td className={`px-4 py-3 font-medium ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                      <div>{channel.name}</div>
                      <div className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                        Group #{channel.groupId}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${isDark ? pc.bg.replace('dark:', '') : pc.bg.split(' ')[0]} ${isDark ? pc.text.replace('dark:', '') : pc.text.split(' ')[0]}`}
                      >
                        {channel.platform}
                      </span>
                    </td>
                    <td className={`px-4 py-3 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                      {channel.rateMultiplier}x
                    </td>
                    <td className="px-4 py-3 text-center">
                      {channel.groupExists ? (
                        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400">
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        </span>
                      ) : (
                        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400">
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </span>
                      )}
                    </td>
                    <td className={`px-4 py-3 text-center ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                      {channel.sortOrder}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        type="button"
                        onClick={() => handleToggleEnabled(channel)}
                        className={[
                          'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
                          channel.enabled ? 'bg-emerald-500' : isDark ? 'bg-slate-600' : 'bg-slate-300',
                        ].join(' ')}
                      >
                        <span
                          className={[
                            'inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform',
                            channel.enabled ? 'translate-x-4.5' : 'translate-x-0.5',
                          ].join(' ')}
                        />
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex gap-1">
                        <button
                          type="button"
                          onClick={() => openEditModal(channel)}
                          className={[
                            'rounded-md px-2 py-1 text-xs font-medium transition-colors',
                            isDark ? 'text-indigo-400 hover:bg-indigo-500/20' : 'text-indigo-600 hover:bg-indigo-50',
                          ].join(' ')}
                        >
                          {t.edit}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(channel)}
                          className={[
                            'rounded-md px-2 py-1 text-xs font-medium transition-colors',
                            isDark ? 'text-red-400 hover:bg-red-500/20' : 'text-red-600 hover:bg-red-50',
                          ].join(' ')}
                        >
                          {t.delete}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Edit / Create Modal ── */}
      {editModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div
            className={[
              'relative w-full max-w-lg overflow-y-auto rounded-2xl border p-6 shadow-2xl',
              isDark ? 'border-slate-700 bg-slate-800' : 'border-slate-200 bg-white',
            ].join(' ')}
            style={{ maxHeight: '90vh' }}
          >
            <h2 className={`mb-5 text-lg font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
              {editingChannel ? t.editChannel : t.newChannel}
            </h2>

            <div className="space-y-4">
              {/* Group ID (only for create) */}
              {!editingChannel && (
                <div>
                  <label className={labelCls}>{t.fieldGroupId}</label>
                  <input
                    type="number"
                    value={form.group_id}
                    onChange={(e) => setForm({ ...form, group_id: e.target.value ? Number(e.target.value) : '' })}
                    className={inputCls}
                    required
                  />
                </div>
              )}

              {/* Name */}
              <div>
                <label className={labelCls}>{t.fieldName}</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className={inputCls}
                  required
                />
              </div>

              {/* Platform */}
              <div>
                <label className={labelCls}>{t.fieldPlatform}</label>
                <select
                  value={form.platform}
                  onChange={(e) => setForm({ ...form, platform: e.target.value })}
                  className={inputCls}
                >
                  {PLATFORMS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>

              {/* Rate Multiplier */}
              <div>
                <label className={labelCls}>{t.fieldRate}</label>
                <input
                  type="number"
                  step="0.0001"
                  min="0"
                  value={form.rate_multiplier}
                  onChange={(e) => setForm({ ...form, rate_multiplier: e.target.value })}
                  className={inputCls}
                  required
                />
                <p className={`mt-1 text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{t.fieldRateHint}</p>
              </div>

              {/* Description */}
              <div>
                <label className={labelCls}>{t.fieldDescription}</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={2}
                  className={inputCls}
                />
              </div>

              {/* Models */}
              <div>
                <label className={labelCls}>{t.fieldModels}</label>
                <textarea
                  value={form.models}
                  onChange={(e) => setForm({ ...form, models: e.target.value })}
                  rows={4}
                  className={[inputCls, 'font-mono text-xs'].join(' ')}
                  placeholder="claude-sonnet-4-20250514&#10;claude-opus-4-20250514"
                />
              </div>

              {/* Features */}
              <div>
                <label className={labelCls}>{t.fieldFeatures}</label>
                <textarea
                  value={form.features}
                  onChange={(e) => setForm({ ...form, features: e.target.value })}
                  rows={3}
                  className={[inputCls, 'font-mono text-xs'].join(' ')}
                  placeholder="Extended thinking&#10;Vision&#10;Tool use"
                />
              </div>

              {/* Sort Order */}
              <div>
                <label className={labelCls}>{t.fieldSortOrder}</label>
                <input
                  type="number"
                  value={form.sort_order}
                  onChange={(e) => setForm({ ...form, sort_order: e.target.value })}
                  className={inputCls}
                />
              </div>

              {/* Enabled */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setForm({ ...form, enabled: !form.enabled })}
                  className={[
                    'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                    form.enabled ? 'bg-emerald-500' : isDark ? 'bg-slate-600' : 'bg-slate-300',
                  ].join(' ')}
                >
                  <span
                    className={[
                      'inline-block h-4 w-4 rounded-full bg-white transition-transform',
                      form.enabled ? 'translate-x-6' : 'translate-x-1',
                    ].join(' ')}
                  />
                </button>
                <span className={`text-sm ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{t.fieldEnabled}</span>
              </div>
            </div>

            {/* Actions */}
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeEditModal}
                className={[
                  'rounded-lg px-4 py-2 text-sm font-medium transition-colors',
                  isDark ? 'text-slate-400 hover:bg-slate-700' : 'text-slate-600 hover:bg-slate-100',
                ].join(' ')}
              >
                {t.cancel}
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || !form.name.trim() || form.group_id === '' || !form.rate_multiplier}
                className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? t.saving : t.save}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Sync from Sub2API Modal ── */}
      {syncModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div
            className={[
              'relative w-full max-w-lg overflow-y-auto rounded-2xl border p-6 shadow-2xl',
              isDark ? 'border-slate-700 bg-slate-800' : 'border-slate-200 bg-white',
            ].join(' ')}
            style={{ maxHeight: '80vh' }}
          >
            <h2 className={`mb-1 text-lg font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
              {t.syncTitle}
            </h2>
            <p className={`mb-4 text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{t.syncHint}</p>

            {syncLoading ? (
              <div className={`py-8 text-center ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>{t.syncLoading}</div>
            ) : syncGroups.length === 0 ? (
              <div className={`py-8 text-center ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>{t.syncNoGroups}</div>
            ) : (
              <div className="space-y-2">
                {syncGroups.map((group) => {
                  const alreadyImported = existingGroupIds.has(group.id);
                  return (
                    <label
                      key={group.id}
                      className={[
                        'flex items-start gap-3 rounded-lg border p-3 transition-colors',
                        alreadyImported
                          ? isDark
                            ? 'border-slate-700 bg-slate-700/30 opacity-60'
                            : 'border-slate-200 bg-slate-50 opacity-60'
                          : syncSelected.has(group.id)
                            ? isDark
                              ? 'border-indigo-500/50 bg-indigo-500/10'
                              : 'border-indigo-300 bg-indigo-50'
                            : isDark
                              ? 'border-slate-700 hover:border-slate-600'
                              : 'border-slate-200 hover:border-slate-300',
                        alreadyImported ? 'cursor-not-allowed' : 'cursor-pointer',
                      ].join(' ')}
                    >
                      <input
                        type="checkbox"
                        disabled={alreadyImported}
                        checked={syncSelected.has(group.id)}
                        onChange={() => toggleSyncGroup(group.id)}
                        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-500 focus:ring-indigo-500"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-sm font-medium ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                            {group.name}
                          </span>
                          <span className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                            #{group.id}
                          </span>
                          {(() => {
                            const gpc = PLATFORM_COLORS[group.platform] ?? PLATFORM_COLORS.claude;
                            return (
                              <span
                                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${isDark ? gpc.bg.replace('dark:', '') : gpc.bg.split(' ')[0]} ${isDark ? gpc.text.replace('dark:', '') : gpc.text.split(' ')[0]}`}
                              >
                                {group.platform}
                              </span>
                            );
                          })()}
                          {alreadyImported && (
                            <span className="text-[10px] text-amber-500 font-medium">{t.syncAlreadyExists}</span>
                          )}
                        </div>
                        {group.description && (
                          <p className={`mt-0.5 text-xs truncate ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                            {group.description}
                          </p>
                        )}
                        <p className={`mt-0.5 text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                          {t.colRate}: {group.rate_multiplier}x
                        </p>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}

            {/* Sync actions */}
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeSyncModal}
                className={[
                  'rounded-lg px-4 py-2 text-sm font-medium transition-colors',
                  isDark ? 'text-slate-400 hover:bg-slate-700' : 'text-slate-600 hover:bg-slate-100',
                ].join(' ')}
              >
                {t.cancel}
              </button>
              <button
                type="button"
                onClick={handleSyncImport}
                disabled={syncImporting || syncSelected.size === 0}
                className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {syncImporting ? t.syncImporting : `${t.syncImport} (${syncSelected.size})`}
              </button>
            </div>
          </div>
        </div>
      )}
    </PayPageLayout>
  );
}

function ChannelsPageFallback() {
  const searchParams = useSearchParams();
  const locale = resolveLocale(searchParams.get('lang'));

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-gray-500">{locale === 'en' ? 'Loading...' : '加载中...'}</div>
    </div>
  );
}

export default function ChannelsPage() {
  return (
    <Suspense fallback={<ChannelsPageFallback />}>
      <ChannelsContent />
    </Suspense>
  );
}
