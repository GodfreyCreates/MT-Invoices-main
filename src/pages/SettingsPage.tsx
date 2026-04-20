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
import {
  createSupabaseFunctionHeaders,
  getSupabaseFunctionUrl,
  invokeSupabaseFunctionWithSession,
} from '../lib/supabase-functions';
import { getSupabaseAccessToken, supabase } from '../lib/supabase';
import { uploadFileToApi } from '../lib/uploads';
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

type SessionsResponse = {
  currentSessionId: string | null;
  sessions: SessionItem[];
};

type SiteLogoMutationResponse = {
  target: 'site-logo';
  publicUrl: string | null;
  objectPath: string | null;
};

const shortDateFormatter = new Intl.DateTimeFormat('en-ZA', { dateStyle: 'medium' });
const dateTimeFormatter = new Intl.DateTimeFormat('en-ZA', { dateStyle: 'medium', timeStyle: 'short' });
const relativeTimeFormatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

function formatDate(value: string | null, fallback = '—') {
  if (!value) return fallback;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : shortDateFormatter.format(parsed);
}

function formatDateTime(value: string | null, fallback = '—') {
  if (!value) return fallback;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : dateTimeFormatter.format(parsed);
}

function formatRelativeTime(value: string | null, fallback = '—') {
  if (!value) return fallback;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return fallback;
  const diffMs = parsed.getTime() - Date.now();
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (Math.abs(diffMs) < hour) return relativeTimeFormatter.format(Math.round(diffMs / minute), 'minute');
  if (Math.abs(diffMs) < day) return relativeTimeFormatter.format(Math.round(diffMs / hour), 'hour');
  return relativeTimeFormatter.format(Math.round(diffMs / day), 'day');
}

function getInitials(name?: string | null, email?: string | null) {
  const source = name?.trim() || email?.trim() || 'MT';
  const words = source.split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return words.slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

function extractVersionFromUserAgent(userAgent: string, token: string) {
  const escapedToken = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = userAgent.match(new RegExp(`${escapedToken}([\\d.]+)`));
  return match?.[1] ?? null;
}

function describeSession(userAgent?: string | null) {
  if (!userAgent) {
    return { browserLabel: 'Unknown browser', detail: 'Unknown device', deviceType: 'desktop' as const, platform: 'Unknown' };
  }
  const ua = userAgent.toLowerCase();
  const browserProfile = ua.includes('edg/')
    ? { name: 'Edge', token: 'edg/' }
    : ua.includes('opr/')
      ? { name: 'Opera', token: 'opr/' }
      : ua.includes('chrome') && !ua.includes('edg/') && !ua.includes('opr/')
        ? { name: 'Chrome', token: 'chrome/' }
        : ua.includes('firefox')
          ? { name: 'Firefox', token: 'firefox/' }
          : ua.includes('safari') && !ua.includes('chrome')
            ? { name: 'Safari', token: 'version/' }
            : { name: 'Browser', token: null };
  const platform = ua.includes('windows') ? 'Windows'
    : ua.includes('android') ? 'Android'
    : ua.includes('iphone') || ua.includes('ipad') ? 'iOS'
    : ua.includes('mac os x') ? 'macOS'
    : ua.includes('linux') ? 'Linux'
    : 'Unknown';
  const isMobile = ua.includes('mobile') || ua.includes('android') || ua.includes('iphone');
  const browserVersion = browserProfile.token ? extractVersionFromUserAgent(ua, browserProfile.token) : null;
  return {
    browserLabel: browserVersion ? `${browserProfile.name} ${browserVersion}` : browserProfile.name,
    detail: isMobile ? 'Mobile' : 'Desktop',
    deviceType: isMobile ? ('mobile' as const) : ('desktop' as const),
    platform,
  };
}

function SectionCard({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="px-5 py-5">{children}</div>
    </section>
  );
}

function MetaItem({ label, value, tone = 'default' }: { label: string; value: React.ReactNode; tone?: 'default' | 'success' }) {
  return (
    <div className={cn('rounded-xl border px-3 py-2.5', tone === 'success' ? 'border-emerald-100 bg-emerald-50' : 'border-slate-100 bg-slate-50')}>
      <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">{label}</p>
      <div className="mt-1 text-sm font-medium text-slate-800">{value}</div>
    </div>
  );
}

function LogoCard({
  title,
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
  onSelect,
  onRemove,
}: {
  title: string;
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
  onSelect: (event: React.ChangeEvent<HTMLInputElement>) => void | Promise<void>;
  onRemove: () => void | Promise<void>;
}) {
  return (
    <SectionCard title={title}>
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-2">
            {logoUrl ? (
              <img src={logoUrl} alt={title} className="max-h-full max-w-full object-contain" />
            ) : (
              <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">{emptyLabel}</span>
            )}
          </div>
          <p className="text-xs text-slate-400">PNG, JPG, SVG, WEBP · max 4 MB</p>
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
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>{progressLabel}</span>
              <span>{uploadProgress}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-slate-900 transition-all" style={{ width: `${uploadProgress}%` }} />
            </div>
          </div>
        ) : null}

        {canManage ? (
          <div className="flex gap-2">
            <Button type="button" onClick={() => inputRef.current?.click()} disabled={isUploading || isRemoving} className="h-9 rounded-xl px-4 text-sm">
              {isUploading ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Uploading</> : <><ImageUp className="mr-1.5 h-3.5 w-3.5" />{logoUrl ? replaceLabel : uploadLabel}</>}
            </Button>
            {logoUrl ? (
              <Button type="button" variant="outline" onClick={onRemove} disabled={isUploading || isRemoving} className="h-9 rounded-xl px-4 text-sm">
                {isRemoving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </SectionCard>
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
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const rows = [
    { label: 'Platform', value: device.platform },
    { label: 'Browser', value: device.browserLabel },
    { label: 'Device', value: device.detail },
    { label: 'IP address', value: sessionItem.ipAddress || '—' },
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
        className="relative flex max-h-[88vh] w-full max-w-sm flex-col overflow-hidden rounded-t-2xl border border-slate-800 bg-slate-950 text-white shadow-2xl sm:max-h-none sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white"
          aria-label="Close"
        >
          <X className="h-3.5 w-3.5" />
        </button>

        <div className="flex items-center gap-3 border-b border-white/8 px-4 py-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-400">
            {device.deviceType === 'mobile' ? <Smartphone className="h-4 w-4" /> : <Monitor className="h-4 w-4" />}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold text-white">{device.platform}</span>
              {isCurrentSession ? (
                <span className="inline-flex items-center gap-0.5 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-400">
                  <ShieldCheck className="h-2.5 w-2.5" />Current
                </span>
              ) : null}
            </div>
            <p className="text-xs text-slate-400">{device.browserLabel}</p>
          </div>
        </div>

        <div className="divide-y divide-white/5 overflow-y-auto px-4">
          {rows.map(({ label, value }) => (
            <div key={label} className="flex items-center justify-between gap-4 py-3">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</span>
              <span className="text-xs font-medium text-slate-200">{value}</span>
            </div>
          ))}
        </div>

        <div className="border-t border-white/8 px-4 py-4">
          {isCurrentSession ? (
            <p className="text-center text-xs text-slate-500">
              This is your current session.
            </p>
          ) : (
            <Button type="button" variant="destructive" onClick={onRevoke} disabled={isRevoking} className="h-9 w-full rounded-xl text-sm">
              {isRevoking ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Revoking…</> : 'Revoke session'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export function SettingsPage() {
  const { data: session, isPending: isSessionPending, refetch: refetchSession } = authClient.useSession();
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
  const [isUploadingSiteLogo, setIsUploadingSiteLogo] = useState(false);
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
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(session?.session?.id ?? null);
  const siteLogoInputRef = useRef<HTMLInputElement | null>(null);
  const hasLoadedSummaryRef = useRef(false);
  const hasLoadedSessionsRef = useRef(false);

  async function loadSummary(showToastOnError = true) {
    setIsSummaryLoading((c) => c || !hasLoadedSummaryRef.current);
    setSummaryError(null);
    try {
      const next = await apiRequest<SettingsSummary>('/api/settings/summary');
      setSummary(next);
      hasLoadedSummaryRef.current = true;
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Failed to load settings';
      setSummaryError(message);
      if (showToastOnError) toast.error(message);
    } finally {
      setIsSummaryLoading(false);
    }
  }

  async function loadSessions(showToastOnError = true) {
    setIsSessionsLoading((c) => c || !hasLoadedSessionsRef.current);
    setSessionsError(null);
    try {
      if (!session?.user?.id || !session.session?.accessToken) {
        setSessions([]);
        setCurrentSessionId(null);
        hasLoadedSessionsRef.current = true;
        return;
      }
      const data = await apiRequest<SessionsResponse>('/api/settings/sessions');
      setCurrentSessionId(data.currentSessionId ?? session.session.id ?? null);
      setSessions(data.sessions);
      hasLoadedSessionsRef.current = true;
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Failed to load sessions';
      setSessionsError(message);
      if (showToastOnError) toast.error(message);
    } finally {
      setIsSessionsLoading(false);
    }
  }

  useEffect(() => {
    if (!session?.user?.id) return;
    void loadSummary(false);
    void loadSessions(false);
  }, [session?.session?.accessToken, session?.user?.id]);

  const handleRefresh = async () => {
    await Promise.all([loadSummary(), loadSessions(), refetchSession(), workspace.refreshWorkspace()]);
    toast.success('Refreshed');
  };

  const handlePasswordSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!passwordForm.currentPassword) { toast.error('Current password is required'); return; }
    if (passwordForm.newPassword.length < MIN_PASSWORD_LENGTH) { toast.error(`Minimum ${MIN_PASSWORD_LENGTH} characters`); return; }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) { toast.error('Passwords do not match'); return; }
    setIsPasswordSaving(true);
    try {
      if (!session?.user?.email) throw new Error('No authenticated account');
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: session.user.email, password: passwordForm.currentPassword });
      if (signInError) throw signInError;
      const { error: updateError } = await supabase.auth.updateUser({ password: passwordForm.newPassword });
      if (updateError) throw updateError;
      if (passwordForm.revokeOtherSessions) {
        const { error: revokeError } = await supabase.auth.signOut({ scope: 'others' });
        if (revokeError) throw revokeError;
      }
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '', revokeOtherSessions: true });
      await Promise.all([loadSummary(), loadSessions(), refetchSession()]);
      toast.success('Password updated');
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Unable to update password');
    } finally {
      setIsPasswordSaving(false);
    }
  };

  const handleRevokeSession = async (sessionToRevoke: SessionItem) => {
    setSessionActionToken(sessionToRevoke.token);
    try {
      if (sessionToRevoke.id === currentSessionId) {
        await authClient.signOut();
        toast.success('Signed out');
        window.location.assign('/auth');
        return;
      }
      await apiRequest(`/api/settings/sessions/${sessionToRevoke.id}`, { method: 'DELETE' });
      await Promise.all([loadSessions(false), loadSummary(false)]);
      toast.success('Session revoked');
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Unable to revoke session');
    } finally {
      setSessionActionToken(null);
    }
  };

  const handleRevokeOtherSessions = async () => {
    setIsRevokingOthers(true);
    try {
      await apiRequest('/api/settings/sessions/others', { method: 'DELETE' });
      await Promise.all([loadSummary(false), loadSessions(false), refetchSession()]);
      toast.success('Other sessions signed out');
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Unable to revoke sessions');
    } finally {
      setIsRevokingOthers(false);
    }
  };

  const handleSiteLogoSelection = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const files = input.files ? Array.from(input.files) as File[] : [];
    input.value = '';
    if (files.length === 0) return;
    const [file] = files;
    if (!file.type.startsWith('image/')) { toast.error('Please choose an image file'); return; }
    try {
      const accessToken = await getSupabaseAccessToken();
      if (!accessToken) throw new Error('You must be signed in to upload');
      setIsUploadingSiteLogo(true);
      await uploadFileToApi<SiteLogoMutationResponse>({
        url: getSupabaseFunctionUrl('auth-storage-images'),
        file,
        accessToken,
        fields: { target: 'site-logo' },
        headers: createSupabaseFunctionHeaders(),
        onProgress: setSiteLogoUploadProgress,
      });
      setSiteLogoUploadProgress(100);
      await Promise.all([loadSummary(), refreshBranding(), workspace.refreshWorkspace()]);
      toast.success('Site logo updated');
      window.setTimeout(() => setSiteLogoUploadProgress(0), 600);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Upload failed');
      setSiteLogoUploadProgress(0);
    } finally {
      setIsUploadingSiteLogo(false);
    }
  };

  const handleRemoveSiteLogo = async () => {
    setIsRemovingSiteLogo(true);
    try {
      await invokeSupabaseFunctionWithSession<SiteLogoMutationResponse>('auth-storage-images', { action: 'delete', target: 'site-logo' }, 'DELETE');
      await Promise.all([loadSummary(), refreshBranding(), workspace.refreshWorkspace()]);
      setSiteLogoUploadProgress(0);
      toast.success('Site logo removed');
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Unable to remove site logo');
    } finally {
      setIsRemovingSiteLogo(false);
    }
  };

  const fallbackProfile = {
    id: session?.user?.id ?? '',
    name: session?.user?.name ?? 'User',
    email: session?.user?.email ?? '',
    image: session?.user?.image ?? null,
    emailVerified: session?.user?.emailVerified ?? false,
    role: session?.user?.role ?? 'user',
    createdAt: '',
    updatedAt: '',
  };
  const profile = summary?.profile ?? fallbackProfile;
  const branding = summary?.branding ?? { siteLogoUrl: null };
  const security = summary?.security ?? { activeSessions: sessions.length, lastSeenAt: null };
  const permissions = summary?.permissions ?? { canManageSiteBranding: (session?.user?.role ?? '').toLowerCase() === 'admin' };

  const displayName = profile.name || session?.user?.name || 'User';
  const displayEmail = profile.email || session?.user?.email || '';
  const initials = getInitials(displayName, displayEmail);
  const canManageSiteBranding = permissions.canManageSiteBranding;

  return (
    <div className="min-h-screen bg-slate-50 pb-16">
      <AppHeader className="top-0 z-[70]" />

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        {summaryError && !summary ? (
          <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            {summaryError}
          </div>
        ) : null}

        <div className={cn('grid gap-5', canManageSiteBranding ? 'xl:grid-cols-[1fr_320px]' : '')}>
          <div className="space-y-5">
            {/* Account */}
            <SectionCard
              title="Account"
              action={
                <Button variant="outline" onClick={handleRefresh} className="h-8 rounded-xl px-3 text-xs gap-1.5">
                  <RefreshCw className="h-3.5 w-3.5" />
                  Refresh
                </Button>
              }
            >
              <div className="flex flex-col gap-5">
                {/* Profile row */}
                <div className="flex items-center gap-3">
                  {profile.image ? (
                    <img src={profile.image} alt={displayName} className="h-12 w-12 shrink-0 rounded-xl border border-slate-200 object-cover" />
                  ) : (
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-sm font-semibold text-white">
                      {initials}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-base font-semibold text-slate-900">{displayName}</p>
                    <p className="truncate text-sm text-slate-500">{displayEmail}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
                        <UserRound className="h-2.5 w-2.5" />{profile.role}
                      </span>
                      <span className={cn(
                        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
                        profile.emailVerified ? 'border border-emerald-200 bg-emerald-50 text-emerald-700' : 'border border-amber-200 bg-amber-50 text-amber-700'
                      )}>
                        {profile.emailVerified ? <CheckCircle2 className="h-2.5 w-2.5" /> : <ShieldAlert className="h-2.5 w-2.5" />}
                        {profile.emailVerified ? 'Verified' : 'Unverified'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Meta grid */}
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <MetaItem label="Member since" value={formatDate(profile.createdAt)} />
                  <MetaItem label="Last updated" value={formatDateTime(profile.updatedAt)} />
                  <MetaItem label="Last active" value={formatRelativeTime(security.lastSeenAt)} />
                  <MetaItem label="Sessions" tone="success" value={`${security.activeSessions} device${security.activeSessions === 1 ? '' : 's'}`} />
                </div>

                {/* Sessions */}
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-900">Active devices</h3>
                    <div className="flex gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => void loadSessions()} disabled={isSessionsLoading} className="h-8 rounded-xl bg-white px-3 text-xs">
                        {isSessionsLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                      </Button>
                      <Button type="button" variant="destructive" size="sm" onClick={handleRevokeOtherSessions} disabled={isRevokingOthers || sessions.length <= 1} className="h-8 rounded-xl px-3 text-xs">
                        {isRevokingOthers ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                        Sign out others
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {isSessionsLoading && sessions.length === 0 ? (
                      <div className="flex h-24 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white">
                        <div className="flex items-center gap-2 text-sm text-slate-400">
                          <Loader2 className="h-4 w-4 animate-spin" />Loading…
                        </div>
                      </div>
                    ) : sessionsError && sessions.length === 0 ? (
                      <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">{sessionsError}</div>
                    ) : sessions.length === 0 ? (
                      <div className="flex h-24 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white">
                        <MonitorSmartphone className="h-6 w-6 text-slate-300" />
                        <p className="mt-2 text-sm text-slate-400">No active devices</p>
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
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setSelectedSession(sessionItem); }}
                            className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-800 bg-slate-950 px-3 py-3 transition hover:border-slate-600"
                          >
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-400">
                              {device.deviceType === 'mobile' ? <Smartphone className="h-3.5 w-3.5" /> : <Monitor className="h-3.5 w-3.5" />}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <span className="text-sm font-semibold text-white">{device.platform}</span>
                                {isCurrentSession ? (
                                  <span className="inline-flex items-center gap-0.5 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-400">
                                    <ShieldCheck className="h-2 w-2" />Current
                                  </span>
                                ) : null}
                              </div>
                              <p className="text-xs text-slate-400">{device.browserLabel} · {sessionItem.ipAddress ?? 'No IP'}</p>
                            </div>
                            {!isCurrentSession ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={(e) => { e.stopPropagation(); void handleRevokeSession(sessionItem); }}
                                className="h-7 shrink-0 rounded-lg border-white/10 bg-white/5 px-2.5 text-[11px] text-slate-400 hover:bg-white/10 hover:text-white"
                              >
                                {sessionActionToken === sessionItem.token ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Revoke'}
                              </Button>
                            ) : (
                              <span className="shrink-0 text-[11px] text-slate-500">This device</span>
                            )}
                          </article>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            </SectionCard>

            {/* Password */}
            <SectionCard title="Change password">
              <form className="space-y-4" onSubmit={handlePasswordSubmit}>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="grid gap-1.5">
                    <Label htmlFor="current-password" className="text-xs">Current password</Label>
                    <Input id="current-password" type="password" value={passwordForm.currentPassword}
                      onChange={(e) => setPasswordForm((c) => ({ ...c, currentPassword: e.target.value }))}
                      autoComplete="current-password" className="h-10 rounded-xl" />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="new-password" className="text-xs">New password</Label>
                    <Input id="new-password" type="password" value={passwordForm.newPassword}
                      onChange={(e) => setPasswordForm((c) => ({ ...c, newPassword: e.target.value }))}
                      autoComplete="new-password" className="h-10 rounded-xl" />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="confirm-password" className="text-xs">Confirm password</Label>
                    <Input id="confirm-password" type="password" value={passwordForm.confirmPassword}
                      onChange={(e) => setPasswordForm((c) => ({ ...c, confirmPassword: e.target.value }))}
                      autoComplete="new-password" className="h-10 rounded-xl" />
                  </div>
                </div>

                <label className="flex items-center gap-2.5 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={passwordForm.revokeOtherSessions}
                    onChange={(e) => setPasswordForm((c) => ({ ...c, revokeOtherSessions: e.target.checked }))}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  <span className="text-sm text-slate-700">Sign out other devices after update</span>
                </label>

                <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-3">
                  <Button type="submit" disabled={isPasswordSaving} className="h-9 rounded-xl px-5 text-sm">
                    {isPasswordSaving ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Updating…</> : 'Update password'}
                  </Button>
                </div>
              </form>
            </SectionCard>
          </div>

          {/* Branding column */}
          {canManageSiteBranding ? (
            <div className="space-y-5">
              <LogoCard
                title="Site logo"
                logoUrl={branding.siteLogoUrl}
                emptyLabel="None"
                uploadLabel="Upload"
                replaceLabel="Replace"
                progressLabel="Uploading…"
                inputRef={siteLogoInputRef}
                isUploading={isUploadingSiteLogo}
                uploadProgress={siteLogoUploadProgress}
                isRemoving={isRemovingSiteLogo}
                canManage
                onSelect={(e) => void handleSiteLogoSelection(e)}
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
          onRevoke={async () => { await handleRevokeSession(selectedSession); setSelectedSession(null); }}
        />
      ) : null}
    </div>
  );
}