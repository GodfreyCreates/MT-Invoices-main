import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowUpRight,
  Database,
  HardDrive,
  Loader2,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
  Waypoints,
} from 'lucide-react';
import { HeaderBrand } from '../components/layout/Header';
import { useBranding } from '../lib/branding';
import { toClientApiUrl } from '../lib/client-env';
import { cn } from '../lib/utils';

type HealthCheckStatus = 'pass' | 'fail';
type ApiServiceRuntime = 'node' | 'supabase-edge';
type ApiServiceAccess = 'public' | 'protected' | 'mixed';

type ApiServiceHealth = {
  id: string;
  name: string;
  runtime: ApiServiceRuntime;
  access: ApiServiceAccess;
  endpoint: string;
  status: HealthCheckStatus;
  ok: boolean;
  latencyMs: number | null;
  uptimeSeconds: number | null;
  statusCode: number | null;
  summary: string;
  message?: string;
};

type ApiRouteHealth = {
  method: string;
  path: string;
  serviceId: string;
  serviceName: string;
  runtime: ApiServiceRuntime;
  access: ApiServiceAccess;
  status: HealthCheckStatus;
  ok: boolean;
  monitoring: 'direct' | 'derived';
  summary: string;
};

type ApiMonitoringSnapshot = {
  status: HealthCheckStatus;
  ok: boolean;
  summary: string;
  services: ApiServiceHealth[];
  routes: ApiRouteHealth[];
  totals: {
    services: number;
    routes: number;
    healthyServices: number;
    healthyRoutes: number;
    publicRoutes: number;
    protectedRoutes: number;
    mixedRoutes: number;
  };
};

type HealthDiagnostic = {
  status: 'ok' | 'degraded';
  timestamp: string;
  summary: string;
  service: {
    name: string;
    environment: string;
    runtime: string;
    region: string | null;
    deploymentUrl: string | null;
    uptimeSeconds: number;
    requestId: string;
  };
  checks: {
    configuration: {
      status: HealthCheckStatus;
      ok: boolean;
      missing: string[];
      checked: string[];
    };
    application: {
      status: HealthCheckStatus;
      ok: boolean;
      publicOrigin: string | null;
      message?: string;
    };
    database: {
      status: HealthCheckStatus;
      ok: boolean;
      latencyMs: number | null;
      message?: string;
    };
    storage: {
      status: HealthCheckStatus;
      ok: boolean;
      bucket: string;
      exists: boolean;
      public: boolean | null;
      fileSizeLimit: number | null;
      message?: string;
    };
  };
  api?: ApiMonitoringSnapshot;
};

const TIMESTAMP_FORMATTER = new Intl.DateTimeFormat('en-ZA', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

function isHealthDiagnostic(value: unknown): value is HealthDiagnostic {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    (record.status === 'ok' || record.status === 'degraded') &&
    typeof record.timestamp === 'string' &&
    typeof record.summary === 'string' &&
    typeof record.service === 'object' && record.service !== null &&
    typeof record.checks === 'object' && record.checks !== null
  );
}

function formatTimestamp(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : TIMESTAMP_FORMATTER.format(date);
}

function formatLatency(value: number | null) {
  return typeof value === 'number' ? `${value} ms` : '—';
}

function formatFileSizeLimit(value: number | null) {
  if (typeof value !== 'number' || value <= 0) return '—';
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${value} B`;
}

function formatUptime(totalSeconds: number) {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '—';
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${Math.max(minutes, 0)}m`;
}

function formatAccessLabel(access: ApiServiceAccess) {
  return access === 'mixed' ? 'Mixed' : access === 'public' ? 'Public' : 'Protected';
}

function formatRuntimeLabel(runtime: ApiServiceRuntime) {
  return runtime === 'node' ? 'Node' : 'Edge';
}

const StatusBadge: React.FC<{ status: HealthDiagnostic['status'] | null }> = ({ status }) => {
  if (!status) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/30 backdrop-blur-sm px-3 py-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />Checking
      </span>
    );
  }
  const isHealthy = status === 'ok';
  const Icon = isHealthy ? ShieldCheck : TriangleAlert;
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-widest transition-all duration-300',
      isHealthy 
        ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.1)]' 
        : 'border-rose-500/20 bg-rose-500/10 text-rose-500 animate-pulse'
    )}>
      <Icon className={cn("h-3 w-3", isHealthy && "animate-pulse")} />
      {isHealthy ? 'Operational' : 'Degraded'}
    </span>
  );
};

const StatCell: React.FC<{ label: string; value: React.ReactNode; color?: string }> = ({ label, value, color = 'primary' }) => {
  const colorMap: Record<string, string> = {
    primary: 'border-blue-500/50 text-blue-500',
    emerald: 'border-emerald-500/50 text-emerald-500',
    amber: 'border-amber-500/50 text-amber-500',
    indigo: 'border-indigo-500/50 text-indigo-500',
    violet: 'border-violet-500/50 text-violet-500',
  };
  
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-border bg-card/60 backdrop-blur-md px-4 py-3 transition-all hover:bg-card/80">
      <div className={cn("absolute left-0 top-0 h-full w-1 transition-all group-hover:w-1.5", colorMap[color]?.split(' ')[0] || 'bg-primary')} />
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className={cn("mt-1.5 text-lg font-bold tracking-tight", colorMap[color]?.split(' ')[1] || 'text-foreground')}>{value ?? '—'}</p>
    </div>
  );
};

const CheckCard: React.FC<{
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  status: HealthCheckStatus;
  summary: string;
  meta: string;
  details?: string;
}> = ({ title, icon: Icon, status, summary, meta, details }) => {
  const isPassing = status === 'pass';
  return (
    <article className="group relative overflow-hidden rounded-2xl border border-border bg-card/40 backdrop-blur-md p-4 transition-all duration-500 hover:bg-card/60 hover:shadow-lg hover:shadow-primary/5">
      <div className={cn(
        'absolute inset-x-0 top-0 h-[2px] transition-all duration-500 group-hover:h-[3px]', 
        isPassing ? 'bg-emerald-500/40 group-hover:bg-emerald-500/60' : 'bg-rose-500/40 group-hover:bg-rose-500/60'
      )} aria-hidden="true" />
      
      <div className="flex items-start justify-between gap-3">
        <div className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-all duration-500 group-hover:scale-110',
          isPassing 
            ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-500 group-hover:bg-emerald-500/20' 
            : 'border-rose-500/20 bg-rose-500/10 text-rose-500 group-hover:bg-rose-500/20'
        )}>
          <Icon className="h-5 w-5" />
        </div>
        <span className={cn(
          'rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest transition-colors',
          isPassing 
            ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-500' 
            : 'border-rose-500/20 bg-rose-500/10 text-rose-500 animate-pulse'
        )}>
          {isPassing ? 'Pass' : 'Fail'}
        </span>
      </div>
      <div className="mt-4">
        <p className="text-sm font-bold text-foreground transition-colors group-hover:text-primary">{title}</p>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{summary}</p>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full border border-border bg-muted/50 px-3 py-1 font-semibold text-foreground backdrop-blur-sm">
          {meta}
        </span>
        {details ? <span className="text-[11px] font-medium text-muted-foreground/80">{details}</span> : null}
      </div>
    </article>
  );
};

const ApiServiceCard: React.FC<{ service: ApiServiceHealth }> = ({ service }) => {
  const isPassing = service.status === 'pass';
  const latency = service.latencyMs;
  
  const latencyColor = !latency ? 'text-muted-foreground' 
    : latency < 100 ? 'text-emerald-500'
    : latency < 350 ? 'text-amber-500'
    : 'text-rose-500';

  return (
    <article className="group relative overflow-hidden rounded-2xl border border-border bg-card/40 backdrop-blur-md p-5 transition-all duration-300 hover:bg-card/60 hover:shadow-xl hover:shadow-primary/5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">{service.name}</p>
            {service.runtime === 'supabase-edge' && (
              <span className="rounded bg-indigo-500/10 px-1 py-0.5 text-[9px] font-bold uppercase tracking-tighter text-indigo-500">Edge</span>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground/80">{service.summary}</p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <span className={cn(
            'shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest transition-all',
            isPassing 
              ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-500' 
              : 'border-rose-500/20 bg-rose-500/10 text-rose-500 animate-pulse'
          )}>
            {isPassing ? 'Healthy' : 'Issue'}
          </span>
          <p className={cn("text-[10px] font-bold tabular-nums", latencyColor)}>
            {formatLatency(service.latencyMs)}
          </p>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: 'Runtime', value: formatRuntimeLabel(service.runtime), icon: HardDrive },
          { label: 'Access', value: formatAccessLabel(service.access), icon: ShieldCheck },
          { label: 'Uptime', value: typeof service.uptimeSeconds === 'number' ? formatUptime(service.uptimeSeconds) : 'On demand', icon: Activity },
          { label: 'Status', value: service.statusCode ? `HTTP ${service.statusCode}` : '—', icon: Waypoints },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="group/stat rounded-xl border border-border/50 bg-background/40 px-3 py-2 transition-all hover:bg-background/60">
            <div className="flex items-center gap-1.5 opacity-60 group-hover/stat:opacity-100 transition-opacity">
              <Icon className="h-3 w-3 text-primary" />
              <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">{label}</p>
            </div>
            <p className="mt-1 text-[11px] font-bold text-foreground">{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-xl border border-border/50 bg-background/40 px-3 py-2 transition-all hover:bg-background/60">
        <div className="flex items-center justify-between">
          <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground opacity-60">Public Endpoint</p>
          <ArrowUpRight className="h-3 w-3 text-muted-foreground/40" />
        </div>
        <p className="mt-1 break-all text-[11px] font-medium text-muted-foreground transition-colors group-hover:text-foreground">
          {service.endpoint}
        </p>
      </div>
    </article>
  );
};

function SkeletonCard() {
  return <div className="h-36 rounded-2xl border border-border bg-card/80 shadow-sm animate-pulse" aria-hidden="true" />;
}

export function HealthPage() {
  const { resolvedLogoSrc } = useBranding();
  const [health, setHealth] = useState<HealthDiagnostic | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadHealth = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    mode === 'refresh' ? setIsRefreshing(true) : setIsLoading(true);
    try {
      const response = await fetch(toClientApiUrl('/api/health?format=json'), {
        cache: 'no-store', credentials: 'include', headers: { Accept: 'application/json' },
      });
      const payload = (await response.json()) as unknown;
      if (!isHealthDiagnostic(payload)) throw new Error('Health endpoint returned an unexpected response.');
      setHealth(payload);
      setError(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Failed to load health status.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => { void loadHealth(); }, [loadHealth]);

  const checkCards = useMemo(() => {
    if (!health) return [];
    return [
      {
        title: 'Configuration',
        icon: ShieldCheck,
        status: health.checks.configuration.status,
        summary: health.checks.configuration.missing.length === 0
          ? 'All required environment keys present.'
          : `${health.checks.configuration.missing.length} key${health.checks.configuration.missing.length === 1 ? '' : 's'} missing.`,
        meta: `${health.checks.configuration.checked.length} keys checked`,
        details: health.checks.configuration.missing.length > 0
          ? `Missing: ${health.checks.configuration.missing.join(', ')}`
          : undefined,
      },
      {
        title: 'Application',
        icon: Waypoints,
        status: health.checks.application.status,
        summary: health.checks.application.publicOrigin ?? health.checks.application.message ?? 'Origin unavailable.',
        meta: health.checks.application.ok ? 'Origin resolved' : 'Origin failed',
        details: health.checks.application.message,
      },
      {
        title: 'Database',
        icon: Database,
        status: health.checks.database.status,
        summary: health.checks.database.ok
          ? 'Responding within expected latency.'
          : health.checks.database.message ?? 'Connectivity degraded.',
        meta: formatLatency(health.checks.database.latencyMs),
        details: health.checks.database.message,
      },
      {
        title: 'Storage',
        icon: HardDrive,
        status: health.checks.storage.status,
        summary: health.checks.storage.ok
          ? `${health.checks.storage.bucket} reachable.`
          : health.checks.storage.message ?? 'Storage degraded.',
        meta: health.checks.storage.exists ? 'Bucket reachable' : 'Bucket unavailable',
        details: `Limit: ${formatFileSizeLimit(health.checks.storage.fileSizeLimit)}`,
      },
    ] as const;
  }, [health]);

  const apiServices = useMemo(() => health?.api?.services ?? [], [health]);
  const apiRouteGroups = useMemo(() => {
    const routes = health?.api?.routes ?? [];
    const grouped = new Map<string, { service: ApiServiceHealth | null; routes: ApiRouteHealth[] }>();
    for (const route of routes) {
      const existing = grouped.get(route.serviceId);
      if (existing) { existing.routes.push(route); continue; }
      grouped.set(route.serviceId, { service: apiServices.find((s) => s.id === route.serviceId) ?? null, routes: [route] });
    }
    return Array.from(grouped.values());
  }, [apiServices, health]);

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      {/* Background Mesh */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -left-[10%] -top-[10%] h-[40%] w-[40%] animate-pulse rounded-full bg-primary/5 blur-[120px]" />
        <div className="absolute -right-[5%] top-[20%] h-[30%] w-[30%] rounded-full bg-emerald-500/5 blur-[100px]" />
        <div className="absolute bottom-[10%] left-[20%] h-[35%] w-[35%] rounded-full bg-indigo-500/5 blur-[110px]" />
      </div>

      <main className="relative mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">

        {/* Header */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <HeaderBrand title="MT Legacy" subtitle="Health" logoSrc={resolvedLogoSrc} logoAlt="MT Legacy logo" />
            <StatusBadge status={health?.status ?? null} />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void loadHealth('refresh')}
              disabled={isRefreshing}
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-60"
            >
              {isRefreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Refresh
            </button>
            <a
              href="/api/health?format=json"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              Raw JSON <ArrowUpRight className="h-4 w-4" />
            </a>
          </div>
        </div>

        {/* Summary + stats */}
        <div className="mb-6 rounded-2xl border border-border bg-card/90 px-5 py-4 shadow-sm">
          <p className="text-sm font-medium text-foreground">
            {health?.summary ?? 'Loading health snapshot…'}
          </p>
          {health ? (
            <p className="mt-1 text-xs text-muted-foreground">Checked {formatTimestamp(health.timestamp)}</p>
          ) : null}
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
          <div className="space-y-6">

            {/* Error */}
            {error && !health ? (
              <div className="rounded-2xl border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
                <div className="flex items-start gap-2">
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <p className="font-semibold">Snapshot unavailable</p>
                    <p className="mt-0.5">{error}</p>
                  </div>
                </div>
              </div>
            ) : null}

            {/* Stat cells */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <StatCell label="Environment" value={health?.service.environment} color="indigo" />
              <StatCell label="Runtime" value={health?.service.runtime} color="violet" />
              <StatCell label="Uptime" value={health ? formatUptime(health.service.uptimeSeconds) : null} color="amber" />
              <StatCell label="API services" value={health?.api ? `${health.api.totals.healthyServices}/${health.api.totals.services}` : null} color="emerald" />
              <StatCell label="API routes" value={health?.api ? `${health.api.totals.healthyRoutes}/${health.api.totals.routes}` : null} color="primary" />
            </div>

            {/* Check cards */}
            <div className="grid gap-3 md:grid-cols-2">
              {isLoading && !health
                ? Array.from({ length: 4 }, (_, i) => <SkeletonCard key={i} />)
                : checkCards.map((card) => <CheckCard key={card.title} {...card} />)}
            </div>

            {/* API services */}
            {health?.api ? (
              <section className="rounded-2xl border border-border bg-card/90 p-5 shadow-sm">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-foreground">API services</h2>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground">
                    <Waypoints className="h-3 w-3" />{health.api.totals.routes} routes
                  </span>
                </div>
                <div className="grid gap-3 xl:grid-cols-2">
                  {apiServices.map((service) => <ApiServiceCard key={service.id} service={service} />)}
                </div>
              </section>
            ) : null}

            {/* Route inventory */}
            {health?.api ? (
              <section className="rounded-2xl border border-border bg-card/90 p-5 shadow-sm">
                <h2 className="mb-4 text-sm font-semibold text-foreground">Route inventory</h2>
                <div className="space-y-3">
                  {apiRouteGroups.map((group) => (
                    <section key={group.service?.id ?? group.routes[0]?.serviceId} className="rounded-xl border border-border bg-background/90">
                      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
                        <div>
                          <p className="text-sm font-semibold text-foreground">
                            {group.service?.name ?? group.routes[0]?.serviceName ?? 'API service'}
                          </p>
                          {group.service ? (
                            <p className="text-xs text-muted-foreground">
                              {formatRuntimeLabel(group.service.runtime)} · {formatAccessLabel(group.service.access)}
                            </p>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            'rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest',
                            group.service?.status === 'pass'
                              ? 'border-primary/20 bg-primary/10 text-primary'
                              : 'border-destructive/20 bg-destructive/10 text-destructive'
                          )}>
                            {group.service?.status === 'pass' ? 'Healthy' : 'Issue'}
                          </span>
                          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-foreground">
                            {group.routes.length}
                          </span>
                        </div>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                          <thead>
                            <tr className="border-b border-border text-left text-[10px] uppercase tracking-widest text-muted-foreground">
                              <th className="px-4 py-2.5 font-medium">Method</th>
                              <th className="px-4 py-2.5 font-medium">Path</th>
                              <th className="px-4 py-2.5 font-medium">Access</th>
                              <th className="px-4 py-2.5 font-medium">Monitor</th>
                              <th className="px-4 py-2.5 font-medium">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {group.routes.map((route) => (
                              <tr key={`${route.method}-${route.path}`} className="border-b border-border/60 last:border-b-0">
                                <td className="px-4 py-2.5">
                                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-foreground">
                                    {route.method}
                                  </span>
                                </td>
                                <td className="px-4 py-2.5">
                                  <p className="text-xs font-medium text-foreground">{route.path}</p>
                                  <p className="text-[11px] text-muted-foreground">{route.summary}</p>
                                </td>
                                <td className="px-4 py-2.5 text-xs text-muted-foreground">{formatAccessLabel(route.access)}</td>
                                <td className="px-4 py-2.5 text-xs text-muted-foreground">
                                  {route.monitoring === 'direct' ? 'Direct' : 'Inherited'}
                                </td>
                                <td className="px-4 py-2.5">
                                  <span className={cn(
                                    'rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest',
                                    route.status === 'pass'
                                      ? 'border-primary/20 bg-primary/10 text-primary'
                                      : 'border-destructive/20 bg-destructive/10 text-destructive'
                                  )}>
                                    {route.status === 'pass' ? 'OK' : 'Fail'}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </section>
                  ))}
                </div>
              </section>
            ) : null}
          </div>

          {/* Sidebar */}
          <aside className="space-y-4">
            <section className="rounded-2xl border border-border bg-card/90 p-4 shadow-sm">
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Runtime</p>
              <dl className="space-y-2">
                {[
                  { label: 'Service', value: health?.service.name },
                  { label: 'Region', value: health?.service.region ?? 'Global edge' },
                ].map(({ label, value }) => (
                  <div key={label} className="rounded-xl bg-muted/60 px-3 py-2.5">
                    <dt className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</dt>
                    <dd className="mt-1 text-sm font-semibold text-foreground">{value ?? '—'}</dd>
                  </div>
                ))}
                <div className="rounded-xl bg-muted/60 px-3 py-2.5">
                  <dt className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Deployment</dt>
                  <dd className="mt-1 break-all text-xs text-foreground">
                    {health?.service.deploymentUrl ? (
                      <a href={health.service.deploymentUrl} target="_blank" rel="noreferrer"
                        className="inline-flex items-center gap-1 font-medium hover:text-primary">
                        {health.service.deploymentUrl}<ArrowUpRight className="h-3 w-3" />
                      </a>
                    ) : '—'}
                  </dd>
                </div>
              </dl>
            </section>

            <section className="rounded-2xl border border-border bg-card/90 p-4 shadow-sm">
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Coverage</p>
              <div className="space-y-2">
                <div className="rounded-xl border border-border bg-background px-3 py-2.5">
                  <p className="text-xs font-semibold text-foreground">Storage</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    `{health?.checks.storage.bucket ?? 'app-images'}` · {health?.checks.storage.public ? 'Public' : 'Private'} · {formatFileSizeLimit(health?.checks.storage.fileSizeLimit ?? null)}
                  </p>
                </div>
                <div className="rounded-xl border border-border bg-background px-3 py-2.5">
                  <p className="text-xs font-semibold text-foreground">Routes</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {health?.api
                      ? `${health.api.totals.publicRoutes} public · ${health.api.totals.protectedRoutes} protected · ${health.api.totals.mixedRoutes} mixed`
                      : '—'}
                  </p>
                </div>
                <div className="rounded-xl border border-border bg-background px-3 py-2.5">
                  <p className="text-xs font-semibold text-foreground">Config keys</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {health ? `${health.checks.configuration.checked.length} validated` : '—'}
                  </p>
                </div>
                <div className="rounded-xl border border-border bg-background px-3 py-2.5">
                  <p className="text-xs font-semibold text-foreground">Request ID</p>
                  <p className="mt-1 break-all text-xs text-muted-foreground">
                    {health?.service.requestId ?? '—'}
                  </p>
                </div>
              </div>
            </section>
          </aside>
        </div>
      </main>
    </div>
  );
}