import React, { useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  ImageUp,
  KeyRound,
  Loader2,
  Monitor,
  MonitorSmartphone,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Trash2,
  UserRound,
  X,
} from 'lucide-react';
import { AppHeader } from '../components/layout/AppHeader';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Label } from '../components/ui/Label';
import { ApiError, apiRequest } from '../lib/api';
import { authClient } from '../lib/auth-client';
import { useBranding } from '../lib/branding';
import { useUploadThing } from '../lib/uploadthing';
import { cn } from '../lib/utils';
import { useWorkspace } from '../lib/workspace';
import { toast } from 'sonner';

const MIN_PASSWORD_LENGTH = 8;

type SettingsSummary = {
  profile: {
    id: string;
    name: string;
    email: string;
    image: string | null;
    emailVerified: boolean;
    role: string;
    createdAt: string;
    updatedAt: string;
  };
  branding: {
    siteLogoUrl: string | null;
  };
  security: {
    activeSessions: number;
    lastSeenAt: string | null;
  };
  permissions: {
    canManageSiteBranding: boolean;
  };
};

type SessionItem = {
  id: string;
  createdAt: string;
  updatedAt: string;
  userId: string;
  expiresAt: string;
  token: string;
  ipAddress?: string | null;
  userAgent?: string | null;
};

const shortDateFormatter = new Intl.DateTimeFormat('en-ZA', {
  dateStyle: 'medium',
});

const dateTimeFormatter = new Intl.DateTimeFormat('en-ZA', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

const relativeTimeFormatter = new Intl.RelativeTimeFormat('en', {
  numeric: 'auto',
});

function formatDate(value: string | null, fallback = 'Not available') {
  if (!value) {
    return fallback;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : shortDateFormatter.format(parsed);
}

function formatDateTime(value: string | null, fallback = 'Not available') {
  if (!value) {
    return fallback;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : dateTimeFormatter.format(parsed);
}

function formatRelativeTime(value: string | null, fallback = 'No recent activity') {
  if (!value) {
    return fallback;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return fallback;
  }

  const diffMs = parsed.getTime() - Date.now();
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (Math.abs(diffMs) < hour) {
    return relativeTimeFormatter.format(Math.round(diffMs / minute), 'minute');
  }

  if (Math.abs(diffMs) < day) {
    return relativeTimeFormatter.format(Math.round(diffMs / hour), 'hour');
  }

  return relativeTimeFormatter.format(Math.round(diffMs / day), 'day');
}

function getInitials(name?: string | null, email?: string | null) {
  const source = name?.trim() || email?.trim() || 'MT';
  const words = source.split(/\s+/).filter(Boolean);

  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }

  return words
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase();
}

function extractVersionFromUserAgent(userAgent: string, token: string) {
  const escapedToken = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = userAgent.match(new RegExp(`${escapedToken}([\\d.]+)`));
  return match?.[1] ?? null;
}

function describeSession(userAgent?: string | null) {
  if (!userAgent) {
    return {
      browserLabel: 'Browser details unavailable',
      detail: 'Device details unavailable',
      deviceType: 'desktop' as const,
      platform: 'Unknown device',
    };
  }

  const ua = userAgent.toLowerCase();
  const browserProfile = ua.includes('edg/')
    ? { name: 'Microsoft Edge', token: 'edg/' }
    : ua.includes('opr/')
      ? { name: 'Opera', token: 'opr/' }
      : ua.includes('chrome') && !ua.includes('edg/') && !ua.includes('opr/')
        ? { name: 'Google Chrome', token: 'chrome/' }
        : ua.includes('firefox')
          ? { name: 'Mozilla Firefox', token: 'firefox/' }
          : ua.includes('safari') && !ua.includes('chrome')
            ? { name: 'Safari', token: 'version/' }
            : { name: 'Web browser', token: null };
  const platform = ua.includes('windows')
    ? 'Windows'
    : ua.includes('android')
      ? 'Android'
      : ua.includes('iphone') || ua.includes('ipad')
        ? 'iOS'
        : ua.includes('mac os x')
          ? 'macOS'
          : ua.includes('linux')
            ? 'Linux'
            : 'Unknown platform';
  const detail =
    ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')
      ? 'Mobile device'
      : 'Desktop device';
  const browserVersion = browserProfile.token
    ? extractVersionFromUserAgent(ua, browserProfile.token)
    : null;

  return {
    browserLabel: browserVersion
      ? `${browserProfile.name} ${browserVersion}`
      : browserProfile.name,
    detail,
    deviceType: detail === 'Mobile device' ? ('mobile' as const) : ('desktop' as const),
    platform,
  };
}

function SectionCard({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-[0_18px_40px_-30px_rgba(15,23,42,0.28)] sm:rounded-[28px]">
      <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-6 sm:py-5">
        <div className="min-w-0">
          <h2 className="text-base font-semibold tracking-tight text-slate-950 sm:text-xl">{title}</h2>
          {description ? <p className="mt-1 text-sm leading-snug text-slate-500">{description}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="px-4 py-4 sm:px-6 sm:py-6">{children}</div>
    </section>
  );
}

function MetaItem({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: React.ReactNode;
  tone?: 'default' | 'success';
}) {
  return (
    <div
      className={cn(
        'rounded-2xl border px-4 py-3',
        tone === 'success'
          ? 'border-emerald-200 bg-emerald-50'
          : 'border-slate-200 bg-slate-50',
      )}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <div className="mt-2 text-sm font-medium text-slate-900">{value}</div>
    </div>
  );
}

function LogoCard({
  title,
  description,
  logoUrl,
  emptyLabel,
  uploadLabel,
  replaceLabel,
  progressLabel,
  inputRef,
  isUploading,
  uploadProgress,
  isRemoving,
  canManage,
  disabledReason,
  onSelect,
  onRemove,
}: {
  title: string;
  description: string;
  logoUrl: string | null;
  emptyLabel: string;
  uploadLabel: string;
  replaceLabel: string;
  progressLabel: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  isUploading: boolean;
  uploadProgress: number;
  isRemoving: boolean;
  canManage: boolean;
  disabledReason?: string;
  onSelect: (event: React.ChangeEvent<HTMLInputElement>) => void | Promise<void>;
  onRemove: () => void | Promise<void>;
}) {
  return (
    <SectionCard title={title} description={description}>
      <div className="space-y-5">
        <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:items-center sm:text-left">
          <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:h-28 sm:w-28 sm:rounded-[28px]">
            {logoUrl ? (
              <img src={logoUrl} alt={title} className="max-h-full max-w-full object-contain" />
            ) : (
              <div className="flex h-full w-full items-center justify-center rounded-[20px] bg-slate-100 px-3 text-center text-sm font-semibold uppercase tracking-[0.22em] text-slate-400">
                {emptyLabel}
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold tracking-tight text-slate-950">{title}</p>
            <p className="mt-1 text-sm text-slate-500">{description}</p>
            <p className="mt-3 text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
              PNG, JPG, SVG, or WEBP up to 4 MB
            </p>
            {!canManage && disabledReason ? (
              <p className="mt-3 text-sm text-slate-500">{disabledReason}</p>
            ) : null}
          </div>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          className="hidden"
          onChange={onSelect}
          disabled={!canManage}
        />

        {isUploading ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm text-slate-500">
              <span>{progressLabel}</span>
              <span>{uploadProgress}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-blue-900 transition-all"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        ) : null}

        {canManage ? (
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={isUploading || isRemoving}
              className="h-11 w-full justify-center rounded-2xl px-5 sm:w-auto"
            >
              {isUploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Uploading
                </>
              ) : (
                <>
                  <ImageUp className="mr-2 h-4 w-4" />
                  {logoUrl ? replaceLabel : uploadLabel}
                </>
              )}
            </Button>
            {logoUrl ? (
              <Button
                type="button"
                variant="outline"
                onClick={onRemove}
                disabled={isUploading || isRemoving}
                className="h-11 w-full justify-center rounded-2xl sm:w-auto"
              >
                {isRemoving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Removing
                  </>
                ) : (
                  <>
                    <Trash2 className="mr-2 h-4 w-4" />
                    Remove
                  </>
                )}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </SectionCard>
  );
}

function LoadingState() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <div className="h-[34rem] rounded-[28px] bg-slate-200/80" />
        <div className="h-[28rem] rounded-[28px] bg-slate-200/80" />
      </div>
      <div className="h-72 rounded-[28px] bg-slate-200/80" />
    </div>
  );
}

function SessionDetailDialog({
  session: sessionItem,
  isCurrentSession,
  onClose,
  onRevoke,
  isRevoking,
}: {
  session: SessionItem;
  isCurrentSession: boolean;
  onClose: () => void;
  onRevoke: () => void;
  isRevoking: boolean;
}) {
  const device = describeSession(sessionItem.userAgent);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const rows = [
    { label: 'Platform', value: device.platform },
    { label: 'Browser', value: device.browserLabel },
    { label: 'Device type', value: device.detail },
    { label: 'IP address', value: sessionItem.ipAddress || 'Not captured' },
    { label: 'Signed in', value: formatDateTime(sessionItem.createdAt) },
    { label: 'Last active', value: formatDateTime(sessionItem.updatedAt) },
    { label: 'Expires', value: formatDateTime(sessionItem.expiresAt) },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
      style={{ backgroundColor: 'rgba(2,6,23,0.72)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[88vh] w-full max-w-sm flex-col overflow-hidden rounded-t-[28px] border border-slate-800 bg-slate-950 text-white shadow-2xl sm:max-h-[85vh] sm:rounded-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-400 transition hover:bg-white/10 hover:text-white"
          aria-label="Close"
        >
          <X className="h-3.5 w-3.5" />
        </button>

        <div className="flex items-center gap-3 border-b border-white/8 px-4 py-4 sm:px-5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-400">
            {device.deviceType === 'mobile' ? (
              <Smartphone className="h-4 w-4" />
            ) : (
              <Monitor className="h-4 w-4" />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-sm font-semibold text-white">{device.platform}</span>
              {isCurrentSession ? (
                <span className="inline-flex items-center gap-0.5 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-emerald-400">
                  <ShieldCheck className="h-2.5 w-2.5" />
                  Current device
                </span>
              ) : null}
            </div>
            <p className="mt-0.5 text-xs text-slate-400">{device.browserLabel}</p>
          </div>
        </div>

        <div className="max-h-[calc(88vh-8.5rem)] overflow-y-auto divide-y divide-white/5 px-4 sm:max-h-[calc(85vh-8.5rem)] sm:px-5">
          {rows.map(({ label, value }) => (
            <div key={label} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</span>
              <span className="text-left text-xs font-medium text-slate-200 sm:text-right">{value}</span>
            </div>
          ))}
        </div>

        <div className="border-t border-white/8 px-4 py-4 sm:px-5">
          {isCurrentSession ? (
            <p className="text-center text-xs leading-5 text-slate-500">
              This is your active session. Use <strong className="text-slate-300">Sign out others</strong> to revoke all other sessions.
            </p>
          ) : (
            <Button
              type="button"
              variant="destructive"
              onClick={onRevoke}
              disabled={isRevoking}
              className="h-9 w-full rounded-xl text-sm"
            >
              {isRevoking ? (
                <>
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  Revoking...
                </>
              ) : (
                'Revoke session'
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export function SettingsPage() {
  const {
    data: session,
    isPending: isSessionPending,
    refetch: refetchSession,
  } = authClient.useSession();
  const { refreshBranding } = useBranding();
  const workspace = useWorkspace();
  const [summary, setSummary] = useState<SettingsSummary | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [isSummaryLoading, setIsSummaryLoading] = useState(true);
  const [isSessionsLoading, setIsSessionsLoading] = useState(true);
  const [isPasswordSaving, setIsPasswordSaving] = useState(false);
  const [isRemovingSiteLogo, setIsRemovingSiteLogo] = useState(false);
  const [isRevokingOthers, setIsRevokingOthers] = useState(false);
  const [sessionActionToken, setSessionActionToken] = useState<string | null>(null);
  const [selectedSession, setSelectedSession] = useState<SessionItem | null>(null);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
    revokeOtherSessions: true,
  });
  const [siteLogoUploadProgress, setSiteLogoUploadProgress] = useState(0);

  const currentSessionId = session?.session?.id ?? null;
  const siteLogoInputRef = useRef<HTMLInputElement | null>(null);

  const {
    startUpload: startSiteLogoUpload,
    isUploading: isUploadingSiteLogo,
  } = useUploadThing('siteLogo', {
    onClientUploadComplete: async () => {
      setSiteLogoUploadProgress(100);
      await Promise.all([loadSummary(), refreshBranding(), workspace.refreshWorkspace()]);
      toast.success('Site logo updated successfully');
      window.setTimeout(() => {
        setSiteLogoUploadProgress(0);
      }, 600);
    },
    onUploadError: (error) => {
      setSiteLogoUploadProgress(0);
      toast.error(error.message || 'Site logo upload failed');
    },
    onUploadProgress: (progress) => {
      setSiteLogoUploadProgress(progress);
    },
  });
  async function loadSummary(showToastOnError = true) {
    setIsSummaryLoading(true);
    setSummaryError(null);

    try {
      const nextSummary = await apiRequest<SettingsSummary>('/api/settings/summary');
      setSummary(nextSummary);
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : 'Failed to load your settings';
      setSummaryError(message);
      if (showToastOnError) {
        toast.error(message);
      }
    } finally {
      setIsSummaryLoading(false);
    }
  }

  async function loadSessions(showToastOnError = true) {
    setIsSessionsLoading(true);
    setSessionsError(null);

    try {
      const nextSessions = await apiRequest<SessionItem[]>('/api/auth/list-sessions');
      setSessions(nextSessions);
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : 'Failed to load your active sessions';
      setSessionsError(message);
      if (showToastOnError) {
        toast.error(message);
      }
    } finally {
      setIsSessionsLoading(false);
    }
  }

  useEffect(() => {
    if (!session?.user?.id) {
      return;
    }

    void loadSummary(false);
    void loadSessions(false);
  }, [session?.user?.id]);

  const handleRefresh = async () => {
    await Promise.all([
      loadSummary(),
      loadSessions(),
      refetchSession(),
      workspace.refreshWorkspace(),
    ]);
    toast.success('Settings refreshed');
  };

  const handlePasswordSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!passwordForm.currentPassword) {
      toast.error('Current password is required');
      return;
    }

    if (passwordForm.newPassword.length < MIN_PASSWORD_LENGTH) {
      toast.error(`New password must be at least ${MIN_PASSWORD_LENGTH} characters long`);
      return;
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast.error('New password and confirmation do not match');
      return;
    }

    setIsPasswordSaving(true);

    try {
      await apiRequest('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword,
          revokeOtherSessions: passwordForm.revokeOtherSessions,
        }),
      });

      setPasswordForm({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
        revokeOtherSessions: true,
      });
      await Promise.all([loadSummary(), loadSessions(), refetchSession()]);
      toast.success('Password updated successfully');
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : 'Unable to update your password';
      toast.error(message);
    } finally {
      setIsPasswordSaving(false);
    }
  };

  const handleRevokeSession = async (sessionToRevoke: SessionItem) => {
    setSessionActionToken(sessionToRevoke.token);

    try {
      await apiRequest('/api/auth/revoke-session', {
        method: 'POST',
        body: JSON.stringify({ token: sessionToRevoke.token }),
      });
      await Promise.all([loadSummary(), loadSessions()]);
      toast.success('Session revoked');
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : 'Unable to revoke this session';
      toast.error(message);
    } finally {
      setSessionActionToken(null);
    }
  };

  const handleRevokeOtherSessions = async () => {
    setIsRevokingOthers(true);

    try {
      await apiRequest('/api/auth/revoke-other-sessions', {
        method: 'POST',
      });
      await Promise.all([loadSummary(), loadSessions(), refetchSession()]);
      toast.success('Other sessions were signed out');
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : 'Unable to revoke other sessions';
      toast.error(message);
    } finally {
      setIsRevokingOthers(false);
    }
  };

  const handleSiteLogoSelection = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const files = input.files ? (Array.from(input.files) as File[]) : [];
    input.value = '';

    if (files.length === 0) {
      return;
    }

    const [file] = files;
    if (!file.type.startsWith('image/')) {
      toast.error('Please choose an image file');
      return;
    }

    try {
      await startSiteLogoUpload(files);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Upload failed');
      setSiteLogoUploadProgress(0);
    }
  };

  const handleRemoveSiteLogo = async () => {
    setIsRemovingSiteLogo(true);

    try {
      await apiRequest('/api/settings/logos/site', {
        method: 'DELETE',
      });
      await Promise.all([loadSummary(), refreshBranding(), workspace.refreshWorkspace()]);
      setSiteLogoUploadProgress(0);
      toast.success('Site logo removed');
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Unable to remove the site logo';
      toast.error(message);
    } finally {
      setIsRemovingSiteLogo(false);
    }
  };

  if (isSessionPending || (isSummaryLoading && !summary)) {
    return (
      <div className="min-h-screen bg-slate-100 pb-24 sm:pb-10">
        <AppHeader />
        <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
          <LoadingState />
        </main>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="min-h-screen bg-slate-100 pb-24 sm:pb-10">
        <AppHeader />
        <main className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-3xl flex-col items-center justify-center px-4 text-center sm:px-6 lg:px-8">
          <div className="rounded-full border border-amber-200 bg-amber-50 p-4 text-amber-700">
            <ShieldAlert className="h-8 w-8" />
          </div>
          <h1 className="mt-6 text-3xl font-semibold tracking-tight text-slate-950">
            Settings are unavailable right now
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-slate-500 sm:text-base">
            {summaryError || 'We could not load your account details.'}
          </p>
          <Button onClick={handleRefresh} className="mt-6 gap-2">
            <RefreshCw className="h-4 w-4" />
            Retry
          </Button>
        </main>
      </div>
    );
  }

  const displayName = summary.profile.name || session?.user.name || 'User';
  const displayEmail = summary.profile.email || session?.user.email || '';
  const initials = getInitials(displayName, displayEmail);
  const canManageSiteBranding = summary.permissions.canManageSiteBranding;
  const contentGridClassName = canManageSiteBranding
    ? 'grid gap-4 sm:gap-6 xl:grid-cols-[1.02fr_0.98fr]'
    : 'grid gap-4 sm:gap-6';

  return (
    <div className="min-h-screen bg-slate-100 pb-32 sm:pb-10">
      <AppHeader className="top-0 z-[70]" />

      <main className="mx-auto max-w-6xl overflow-x-clip px-3 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
        <div className={contentGridClassName}>
          <div className="space-y-4 sm:space-y-6">
            <SectionCard
              title="Account"
              description="Your profile, security state, and signed-in devices."
              action={
                <Button variant="outline" onClick={handleRefresh} className="h-10 rounded-2xl px-4 gap-2">
                  <RefreshCw className="h-4 w-4" />
                  Refresh
                </Button>
              }
            >
              <div className="flex flex-col gap-4">
                <div className="flex items-start gap-3 sm:items-center">
                  {summary.profile.image ? (
                    <img
                      src={summary.profile.image}
                      alt={displayName}
                      className="h-12 w-12 flex-shrink-0 rounded-xl border border-slate-200 object-cover sm:h-16 sm:w-16 sm:rounded-2xl"
                    />
                  ) : (
                    <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-slate-900 text-base font-semibold tracking-wide text-white sm:h-16 sm:w-16 sm:rounded-2xl">
                      {initials}
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <h1 className="truncate text-lg font-semibold tracking-tight text-slate-950 sm:text-2xl">
                      {displayName}
                    </h1>
                    <p className="mt-0.5 break-all text-xs leading-5 text-slate-500 sm:text-sm">
                      {displayEmail}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-700 sm:px-3 sm:py-1 sm:text-[11px]">
                        <UserRound className="h-3 w-3" />
                        {summary.profile.role}
                      </span>
                      <span
                        className={cn(
                          'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] sm:px-3 sm:py-1 sm:text-[11px]',
                          summary.profile.emailVerified
                            ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                            : 'border border-amber-200 bg-amber-50 text-amber-700',
                        )}
                      >
                        {summary.profile.emailVerified ? (
                          <CheckCircle2 className="h-3 w-3" />
                        ) : (
                          <ShieldAlert className="h-3 w-3" />
                        )}
                        {summary.profile.emailVerified ? 'Verified' : 'Not verified'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <MetaItem label="Member since" value={formatDate(summary.profile.createdAt)} />
                  <MetaItem label="Last updated" value={formatDateTime(summary.profile.updatedAt)} />
                  <MetaItem label="Last active" value={formatRelativeTime(summary.security.lastSeenAt)} />
                  <MetaItem
                    label="Active sessions"
                    tone="success"
                    value={`${summary.security.activeSessions} device${summary.security.activeSessions === 1 ? '' : 's'}`}
                  />
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3.5 sm:rounded-[26px] sm:p-5">
                  <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                    <div className="min-w-0">
                      <h3 className="text-base font-semibold tracking-tight text-slate-950">Active devices</h3>
                      <p className="mt-0.5 text-sm leading-snug text-slate-500">
                        Review signed-in devices and revoke anything that should no longer have access.
                      </p>
                    </div>

                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void loadSessions()}
                        disabled={isSessionsLoading}
                        className="h-9 rounded-xl bg-white px-3 text-xs whitespace-nowrap"
                      >
                        {isSessionsLoading ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <RefreshCw className="h-3.5 w-3.5" />
                        )}
                        <span className="ml-1 hidden sm:inline">
                          {isSessionsLoading ? 'Refreshing' : 'Refresh'}
                        </span>
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={handleRevokeOtherSessions}
                        disabled={isRevokingOthers || sessions.length <= 1}
                        className="h-9 min-w-0 rounded-xl px-3 text-xs whitespace-nowrap"
                      >
                        {isRevokingOthers ? (
                          <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin shrink-0" />
                        ) : null}
                        <span>{isRevokingOthers ? 'Signing out...' : 'Sign out others'}</span>
                      </Button>
                    </div>
                  </div>

                  <div className="mt-4 space-y-3">
                    {isSessionsLoading && sessions.length === 0 ? (
                      <div className="flex min-h-36 items-center justify-center rounded-[22px] border border-dashed border-slate-300 bg-white/70">
                        <div className="flex items-center gap-2.5 text-sm text-slate-500">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Loading active devices...
                        </div>
                      </div>
                    ) : sessionsError && sessions.length === 0 ? (
                      <div className="rounded-[22px] border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700">
                        {sessionsError}
                      </div>
                    ) : sessions.length === 0 ? (
                      <div className="flex min-h-36 flex-col items-center justify-center rounded-[22px] border border-dashed border-slate-300 bg-white/70 px-6 text-center">
                        <MonitorSmartphone className="h-8 w-8 text-slate-400" />
                        <p className="mt-3 text-base font-semibold text-slate-900">No active devices</p>
                        <p className="mt-1 max-w-xs text-sm text-slate-500">
                          Session details will appear here once your account has a signed-in device.
                        </p>
                      </div>
                    ) : (
                      sessions.map((sessionItem) => {
                        const device = describeSession(sessionItem.userAgent);
                        const isCurrentSession = currentSessionId === sessionItem.id;

                        return (
                          <article
                            key={sessionItem.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => setSelectedSession(sessionItem)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                setSelectedSession(sessionItem);
                              }
                            }}
                            className="flex cursor-pointer flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-950 px-3 py-3 text-white transition hover:border-slate-600 hover:bg-slate-900 sm:px-4 lg:flex-row lg:items-center lg:gap-3.5"
                          >
                            <div className="flex w-full items-start gap-3">
                              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-400 sm:h-10 sm:w-10">
                                {device.deviceType === 'mobile' ? (
                                  <Smartphone className="h-4 w-4" />
                                ) : (
                                  <Monitor className="h-4 w-4" />
                                )}
                              </div>

                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="text-sm font-semibold leading-none text-white">{device.platform}</span>
                                  {isCurrentSession ? (
                                    <span className="inline-flex items-center gap-0.5 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-emerald-400">
                                      <ShieldCheck className="h-2.5 w-2.5" />
                                      Current
                                    </span>
                                  ) : null}
                                </div>
                                <p className="mt-1 break-words text-xs font-medium leading-5 text-slate-200 sm:text-sm">
                                  {device.browserLabel}
                                </p>
                                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] leading-5 text-slate-400">
                                  <span>{device.detail}</span>
                                  <span>Last active {formatDateTime(sessionItem.updatedAt)}</span>
                                </div>
                              </div>
                            </div>

                            <div className="flex w-full items-center justify-between gap-3 border-t border-white/8 pt-3 lg:w-auto lg:justify-end lg:border-t-0 lg:pt-0">
                              <span className="min-w-0 text-[11px] font-medium text-slate-500">
                                {sessionItem.ipAddress ? `IP ${sessionItem.ipAddress}` : 'IP not captured'}
                              </span>
                              {isCurrentSession ? (
                                <span className="shrink-0 text-[11px] font-medium text-slate-500">This device</span>
                              ) : (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    void handleRevokeSession(sessionItem);
                                  }}
                                  className="h-8 shrink-0 rounded-lg border-white/10 bg-white/5 px-2.5 text-[11px] text-slate-400 hover:bg-white/10 hover:text-white"
                                >
                                  {sessionActionToken === sessionItem.token ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    'Revoke'
                                  )}
                                </Button>
                              )}
                            </div>
                          </article>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            </SectionCard>

            <SectionCard
              title="Change password"
              description="Use a new password and optionally sign out your other devices."
            >
              <form className="space-y-4" onSubmit={handlePasswordSubmit}>
                <div className="grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="current-password">Current password</Label>
                    <Input
                      id="current-password"
                      type="password"
                      value={passwordForm.currentPassword}
                      onChange={(event) =>
                        setPasswordForm((current) => ({
                          ...current,
                          currentPassword: event.target.value,
                        }))
                      }
                      autoComplete="current-password"
                      className="h-11 rounded-2xl border-slate-200 bg-white"
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="new-password">New password</Label>
                    <Input
                      id="new-password"
                      type="password"
                      value={passwordForm.newPassword}
                      onChange={(event) =>
                        setPasswordForm((current) => ({
                          ...current,
                          newPassword: event.target.value,
                        }))
                      }
                      autoComplete="new-password"
                      className="h-11 rounded-2xl border-slate-200 bg-white"
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="confirm-password">Confirm new password</Label>
                    <Input
                      id="confirm-password"
                      type="password"
                      value={passwordForm.confirmPassword}
                      onChange={(event) =>
                        setPasswordForm((current) => ({
                          ...current,
                          confirmPassword: event.target.value,
                        }))
                      }
                      autoComplete="new-password"
                      className="h-11 rounded-2xl border-slate-200 bg-white"
                    />
                    <p className="text-sm text-slate-500">
                      Minimum length: {MIN_PASSWORD_LENGTH} characters.
                    </p>
                  </div>
                </div>

                <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={passwordForm.revokeOtherSessions}
                    onChange={(event) =>
                      setPasswordForm((current) => ({
                        ...current,
                        revokeOtherSessions: event.target.checked,
                      }))
                    }
                    className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-900 focus:ring-blue-900"
                  />
                  <div>
                    <p className="font-medium text-slate-900">Sign out other devices after update</p>
                    <p className="mt-1 text-sm text-slate-500">
                      Recommended after using a shared device or responding to unusual activity.
                    </p>
                  </div>
                </label>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-2 text-sm leading-6 text-slate-500">
                    <KeyRound className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>Password changes use your current authenticated session.</span>
                  </div>
                  <Button type="submit" disabled={isPasswordSaving} className="h-11 w-full rounded-2xl px-5 sm:w-auto">
                    {isPasswordSaving ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Updating password
                      </>
                    ) : (
                      'Update password'
                    )}
                  </Button>
                </div>
              </form>
            </SectionCard>
          </div>

          {canManageSiteBranding ? (
            <div className="space-y-4 sm:space-y-6">
              <LogoCard
                title="Site logo"
                description="Used in the header, auth screens, and browser tab icon across the app."
                logoUrl={summary.branding.siteLogoUrl}
                emptyLabel="No site logo"
                uploadLabel="Upload site logo"
                replaceLabel="Replace site logo"
                progressLabel="Uploading site logo"
                inputRef={siteLogoInputRef}
                isUploading={isUploadingSiteLogo}
                uploadProgress={siteLogoUploadProgress}
                isRemoving={isRemovingSiteLogo}
                canManage
                onSelect={(event) => void handleSiteLogoSelection(event)}
                onRemove={() => void handleRemoveSiteLogo()}
              />
            </div>
          ) : null}
        </div>
      </main>

      {selectedSession ? (
        <SessionDetailDialog
          session={selectedSession}
          isCurrentSession={currentSessionId === selectedSession.id}
          onClose={() => setSelectedSession(null)}
          isRevoking={sessionActionToken === selectedSession.token}
          onRevoke={async () => {
            await handleRevokeSession(selectedSession);
            setSelectedSession(null);
          }}
        />
      ) : null}
    </div>
  );
}
