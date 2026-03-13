import React from 'react';

export interface PlatformStyleEntry {
  badge: string;
  border: string;
  label: string;
  /** SVG path data (viewBox 0 0 24 24) */
  icon: string;
  /** Model tag classes: { light: border+bg+text, dark: border+bg+text, dot: bg for the dot } */
  modelTag: { light: string; dark: string; dot: string };
}

const PLATFORM_STYLES: Record<string, PlatformStyleEntry> = {
  claude: {
    badge: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/30',
    border: 'border-orange-500/20',
    label: 'Claude',
    icon: 'M17.3041 3.541h-3.6718l6.696 16.918H24Zm-10.6082 0L0 20.459h3.7442l1.3693-3.5527h7.0052l1.3693 3.5528h3.7442L10.5363 3.5409Zm-.3712 10.2232 2.2914-5.9456 2.2914 5.9456Z',
    modelTag: { light: 'border-orange-500/20 bg-gradient-to-r from-orange-500/10 to-amber-500/10 text-orange-600', dark: 'border-orange-500/20 bg-gradient-to-r from-orange-500/10 to-amber-500/10 text-orange-400', dot: 'bg-orange-500' },
  },
  anthropic: {
    badge: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/30',
    border: 'border-orange-500/20',
    label: 'Anthropic',
    icon: 'M17.3041 3.541h-3.6718l6.696 16.918H24Zm-10.6082 0L0 20.459h3.7442l1.3693-3.5527h7.0052l1.3693 3.5528h3.7442L10.5363 3.5409Zm-.3712 10.2232 2.2914-5.9456 2.2914 5.9456Z',
    modelTag: { light: 'border-orange-500/20 bg-gradient-to-r from-orange-500/10 to-amber-500/10 text-orange-600', dark: 'border-orange-500/20 bg-gradient-to-r from-orange-500/10 to-amber-500/10 text-orange-400', dot: 'bg-orange-500' },
  },
  openai: {
    badge: 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/30',
    border: 'border-green-500/20',
    label: 'OpenAI',
    modelTag: { light: 'border-green-500/20 bg-gradient-to-r from-green-500/10 to-emerald-500/10 text-green-600', dark: 'border-green-500/20 bg-gradient-to-r from-green-500/10 to-emerald-500/10 text-green-400', dot: 'bg-green-500' },
    icon: 'M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z',
  },
  codex: {
    badge: 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/30',
    border: 'border-green-500/20',
    label: 'Codex',
    modelTag: { light: 'border-green-500/20 bg-gradient-to-r from-green-500/10 to-emerald-500/10 text-green-600', dark: 'border-green-500/20 bg-gradient-to-r from-green-500/10 to-emerald-500/10 text-green-400', dot: 'bg-green-500' },
    icon: 'M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z',
  },
  gemini: {
    badge: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30',
    border: 'border-blue-500/20',
    label: 'Gemini',
    modelTag: { light: 'border-blue-500/20 bg-gradient-to-r from-blue-500/10 to-indigo-500/10 text-blue-600', dark: 'border-blue-500/20 bg-gradient-to-r from-blue-500/10 to-indigo-500/10 text-blue-400', dot: 'bg-blue-500' },
    icon: 'M11.04 19.32Q12 21.51 12 24q0-2.49.93-4.68.96-2.19 2.58-3.81t3.81-2.55Q21.51 12 24 12q-2.49 0-4.68-.93a12.3 12.3 0 0 1-3.81-2.58 12.3 12.3 0 0 1-2.58-3.81Q12 2.49 12 0q0 2.49-.96 4.68-.93 2.19-2.55 3.81a12.3 12.3 0 0 1-3.81 2.58Q2.49 12 0 12q2.49 0 4.68.96 2.19.93 3.81 2.55t2.55 3.81',
  },
  google: {
    badge: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30',
    border: 'border-blue-500/20',
    label: 'Google',
    modelTag: { light: 'border-blue-500/20 bg-gradient-to-r from-blue-500/10 to-indigo-500/10 text-blue-600', dark: 'border-blue-500/20 bg-gradient-to-r from-blue-500/10 to-indigo-500/10 text-blue-400', dot: 'bg-blue-500' },
    icon: 'M11.04 19.32Q12 21.51 12 24q0-2.49.93-4.68.96-2.19 2.58-3.81t3.81-2.55Q21.51 12 24 12q-2.49 0-4.68-.93a12.3 12.3 0 0 1-3.81-2.58 12.3 12.3 0 0 1-2.58-3.81Q12 2.49 12 0q0 2.49-.96 4.68-.93 2.19-2.55 3.81a12.3 12.3 0 0 1-3.81 2.58Q2.49 12 0 12q2.49 0 4.68.96 2.19.93 3.81 2.55t2.55 3.81',
  },
  sora: {
    badge: 'bg-pink-500/10 text-pink-600 dark:text-pink-400 border-pink-500/30',
    border: 'border-pink-500/20',
    label: 'Sora',
    modelTag: { light: 'border-pink-500/20 bg-gradient-to-r from-pink-500/10 to-rose-500/10 text-pink-600', dark: 'border-pink-500/20 bg-gradient-to-r from-pink-500/10 to-rose-500/10 text-pink-400', dot: 'bg-pink-500' },
    // four-pointed sparkle star
    icon: 'M12 2l2.09 6.26L20.18 10l-6.09 1.74L12 18l-2.09-6.26L3.82 10l6.09-1.74L12 2z',
  },
  antigravity: {
    badge: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30',
    border: 'border-purple-500/20',
    label: 'Antigravity',
    modelTag: { light: 'border-purple-500/20 bg-gradient-to-r from-purple-500/10 to-violet-500/10 text-purple-600', dark: 'border-purple-500/20 bg-gradient-to-r from-purple-500/10 to-violet-500/10 text-purple-400', dot: 'bg-purple-500' },
    // stylised angular "A" cursor shape
    icon: 'M12 2L4 22h4l2-5h4l2 5h4L12 2zm0 7l2.5 6h-5L12 9z',
  },
};

const FALLBACK_STYLE: PlatformStyleEntry = {
  badge: 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/30',
  border: 'border-slate-500/20',
  label: '',
  icon: '',
  modelTag: { light: 'border-slate-500/20 bg-gradient-to-r from-slate-500/10 to-slate-400/10 text-slate-600', dark: 'border-slate-500/20 bg-gradient-to-r from-slate-500/10 to-slate-400/10 text-slate-400', dot: 'bg-slate-500' },
};

export function getPlatformStyle(platform: string): PlatformStyleEntry {
  const key = platform.toLowerCase();
  const entry = PLATFORM_STYLES[key];
  if (entry) return entry;
  return { ...FALLBACK_STYLE, label: platform };
}

/**
 * Inline SVG icon for a platform (16×16 by default).
 * Returns null when the platform has no known icon.
 */
export function PlatformIcon({
  platform,
  className = 'h-4 w-4',
}: {
  platform: string;
  className?: string;
}): React.ReactElement | null {
  const style = getPlatformStyle(platform);
  if (!style.icon) return null;
  return React.createElement(
    'svg',
    {
      className,
      viewBox: '0 0 24 24',
      fill: 'currentColor',
      'aria-hidden': true,
    },
    React.createElement('path', { d: style.icon }),
  );
}

/**
 * Renders a coloured badge with icon + label for a platform.
 */
export function PlatformBadge({
  platform,
  className = '',
}: {
  platform: string;
  className?: string;
}): React.ReactElement {
  const style = getPlatformStyle(platform);
  return React.createElement(
    'span',
    {
      className: [
        'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium',
        style.badge,
        className,
      ].join(' '),
    },
    PlatformIcon({ platform, className: 'h-3.5 w-3.5' }),
    style.label,
  );
}
