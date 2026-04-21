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

type CheckCardProps = {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  status: HealthCheckStatus;
  summary: string;
  meta: string;
  details?: string;
};

type ApiServiceCardProps = {
  service: ApiServiceHealth;
};

const TIMESTAMP_FORMATTER = new Intl.DateTimeFormat('en-ZA', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

function isHealthDiagnostic(value: unknown): value is HealthDiagnostic {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    (record.status === 'ok' || record.status === 'degraded') &&
    typeof record.timestamp === 'string' &&
    typeof record.summary === 'string' &&
    typeof record.service === 'object' &&
    record.service !== null &&
    typeof record.checks === 'object' &&
    record.checks !== null
  );
}

function formatTimestamp(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : TIMESTAMP_FORMATTER.format(date);
}

function formatLatency(value: number | null) {
  return typeof value === 'number' ? `${value} ms` : 'Unavailable';
}

function formatFileSizeLimit(value: number | null) {
  if (typeof value !== 'number' || value <= 0) {
    return 'Unspecified';
  }

  if (value >= 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }

  if (value >= 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }

  return `${value} B`;
}

function formatUptime(totalSeconds: number) {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) {
    return 'Unavailable';
  }

  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);

  if (days > 0) {
    return `${days}d ${hours}h`;
  }

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return `${Math.max(minutes, 0)}m`;
}

function formatAccessLabel(access: ApiServiceAccess) {
  if (access === 'mixed') {
    return 'Mixed access';
  }

  return access === 'public' ? 'Public' : 'Protected';
}

function formatRuntimeLabel(runtime: ApiServiceRuntime) {
  return runtime === 'node' ? 'Node runtime' : 'Supabase Edge';
}

function StatusBadge({ status }: { status: HealthDiagnostic['status'] | null }) {
  if (!status) {
    return (
      <div className="inline-flex items-center gap-2 rounded-full border border-border bg-muted px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Checking
      </div>
    );
  }

  const isHealthy = status === 'ok';
  const Icon = isHealthy ? ShieldCheck : TriangleAlert;

  return (
    <div
      className={cn(
        'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em]',
        isHealthy
          ? 'border-primary/20 bg-primary/10 text-primary'
          : 'border-destructive/20 bg-destructive/10 text-destructive',
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {isHealthy ? 'Operational' : 'Degraded'}
    </div>
  );
}

function CheckCard({ title, icon: Icon, status, summary, meta, details }: CheckCardProps) {
  const isPassing = status === 'pass';

  return (
    <article className="group relative overflow-hidden rounded-3xl border border-border bg-card/95 p-5 shadow-sm transition-transform duration-300 hover:-translate-y-0.5">
      <div
        className={cn(
          'absolute inset-x-5 top-0 h-px',
          isPassing ? 'bg-primary/50' : 'bg-destructive/50',
        )}
        aria-hidden="true"
      />
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-3">
          <div
            className={cn(
              'inline-flex h-11 w-11 items-center justify-center rounded-2xl border',
              isPassing
                ? 'border-primary/15 bg-primary/10 text-primary'
                : 'border-destructive/15 bg-destructive/10 text-destructive',
            )}
          >
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">{title}</p>
            <p className="mt-1 text-sm text-muted-foreground">{summary}</p>
          </div>
        </div>
        <div
          className={cn(
            'rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.2em]',
            isPassing
              ? 'border-primary/20 bg-primary/10 text-primary'
              : 'border-destructive/20 bg-destructive/10 text-destructive',
          )}
        >
          {isPassing ? 'Pass' : 'Fail'}
        </div>
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span className="rounded-full bg-muted px-3 py-1.5 text-foreground">{meta}</span>
        {details ? <span>{details}</span> : null}
      </div>
    </article>
  );
}

function ApiServiceCard({ service }: ApiServiceCardProps) {
  const isPassing = service.status === 'pass';

  return (
    <article className="rounded-3xl border border-border bg-card/95 p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-3">
          <div
            className={cn(
              'inline-flex h-11 w-11 items-center justify-center rounded-2xl border',
              isPassing
                ? 'border-primary/15 bg-primary/10 text-primary'
                : 'border-destructive/15 bg-destructive/10 text-destructive',
            )}
          >
            <Activity className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">{service.name}</p>
            <p className="mt-1 text-sm text-muted-foreground">{service.summary}</p>
          </div>
        </div>
        <div
          className={cn(
            'rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.2em]',
            isPassing
              ? 'border-primary/20 bg-primary/10 text-primary'
              : 'border-destructive/20 bg-destructive/10 text-destructive',
          )}
        >
          {isPassing ? 'Healthy' : 'Issue'}
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl bg-muted/60 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Runtime</p>
          <p className="mt-2 text-sm font-medium text-foreground">{formatRuntimeLabel(service.runtime)}</p>
        </div>
        <div className="rounded-2xl bg-muted/60 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Access</p>
          <p className="mt-2 text-sm font-medium text-foreground">{formatAccessLabel(service.access)}</p>
        </div>
        <div className="rounded-2xl bg-muted/60 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Latency</p>
          <p className="mt-2 text-sm font-medium text-foreground">{formatLatency(service.latencyMs)}</p>
        </div>
        <div className="rounded-2xl bg-muted/60 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Uptime</p>
          <p className="mt-2 text-sm font-medium text-foreground">
            {typeof service.uptimeSeconds === 'number' ? formatUptime(service.uptimeSeconds) : 'On demand'}
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-2 text-sm">
        <div className="rounded-2xl border border-border bg-background px-3 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Endpoint</p>
          <p className="mt-2 break-all font-medium text-foreground">{service.endpoint}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span className="rounded-full bg-muted px-3 py-1.5 text-foreground">
            HTTP {service.statusCode ?? 'N/A'}
          </span>
          {service.message ? <span>{service.message}</span> : null}
        </div>
      </div>
    </article>
  );
}

function SkeletonCard() {
  return <div className="h-40 rounded-3xl border border-border bg-card/80 shadow-sm" aria-hidden="true" />;
}

export function HealthPage() {
  const { resolvedLogoSrc } = useBranding();
  const [health, setHealth] = useState<HealthDiagnostic | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadHealth = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    if (mode === 'refresh') {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    try {
      const response = await fetch(toClientApiUrl('/api/health?format=json'), {
        cache: 'no-store',
        credentials: 'include',
        headers: {
          Accept: 'application/json',
        },
      });
      const payload = (await response.json()) as unknown;

      if (!isHealthDiagnostic(payload)) {
        throw new Error('Health endpoint returned an unexpected response.');
      }

      setHealth(payload);
      setError(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Failed to load health status.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadHealth();
  }, [loadHealth]);

  const checkCards = useMemo(() => {
    if (!health) {
      return [];
    }

    return [
      {
        title: 'Configuration',
        icon: ShieldCheck,
        status: health.checks.configuration.status,
        summary:
          health.checks.configuration.missing.length === 0
            ? 'Every required environment key is present.'
            : `${health.checks.configuration.missing.length} required value${
                health.checks.configuration.missing.length === 1 ? '' : 's'
              } still need attention.`,
        meta: `${health.checks.configuration.checked.length} keys checked`,
        details:
          health.checks.configuration.missing.length > 0
            ? `Missing: ${health.checks.configuration.missing.join(', ')}`
            : 'Ready for runtime bootstrap.',
      },
      {
        title: 'Application edge',
        icon: Waypoints,
        status: health.checks.application.status,
        summary:
          health.checks.application.publicOrigin ??
          health.checks.application.message ??
          'Origin resolution is unavailable.',
        meta: health.checks.application.ok ? 'Public origin resolved' : 'Origin resolution failed',
        details: health.checks.application.message,
      },
      {
        title: 'Database',
        icon: Database,
        status: health.checks.database.status,
        summary: health.checks.database.ok
          ? 'Primary data access is responding within the expected budget.'
          : health.checks.database.message ?? 'Database connectivity is degraded.',
        meta: formatLatency(health.checks.database.latencyMs),
        details: health.checks.database.message,
      },
      {
        title: 'Storage',
        icon: HardDrive,
        status: health.checks.storage.status,
        summary: health.checks.storage.ok
          ? `${health.checks.storage.bucket} is reachable for asset operations.`
          : health.checks.storage.message ?? 'Storage access is degraded.',
        meta: health.checks.storage.exists ? 'Bucket reachable' : 'Bucket unavailable',
        details: `Limit: ${formatFileSizeLimit(health.checks.storage.fileSizeLimit)}`,
      },
    ] as const;
  }, [health]);

  const apiServices = useMemo(() => health?.api?.services ?? [], [health]);
  const apiRouteGroups = useMemo(() => {
    const routes = health?.api?.routes ?? [];
    const groupedRoutes = new Map<string, { service: ApiServiceHealth | null; routes: ApiRouteHealth[] }>();

    for (const route of routes) {
      const existing = groupedRoutes.get(route.serviceId);
      if (existing) {
        existing.routes.push(route);
        continue;
      }

      groupedRoutes.set(route.serviceId, {
        service: apiServices.find((service) => service.id === route.serviceId) ?? null,
        routes: [route],
      });
    }

    return Array.from(groupedRoutes.values());
  }, [apiServices, health]);

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <div className="absolute inset-x-0 top-0 h-[24rem] bg-gradient-to-b from-muted/80 via-background to-background" aria-hidden="true" />
      <div className="absolute left-0 top-8 h-56 w-56 rounded-full bg-primary/10 blur-3xl" aria-hidden="true" />
      <div className="absolute right-0 top-20 h-72 w-72 rounded-full bg-accent blur-3xl" aria-hidden="true" />

      <main className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-6 sm:px-6 lg:px-8">
        <section className="overflow-hidden rounded-[2rem] border border-border bg-background/88 shadow-xl backdrop-blur-xl">
          <div className="border-b border-border/80 px-5 py-5 sm:px-8 sm:py-6">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-6">
                <div className="flex flex-wrap items-center gap-3">
                  <StatusBadge status={health?.status ?? null} />
                  <div className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/80 px-3 py-1 text-xs font-medium text-muted-foreground">
                    <Activity className="h-3.5 w-3.5" />
                    Public health endpoint
                  </div>
                </div>

                <div className="space-y-4">
                  <HeaderBrand
                    title="MT Legacy"
                    subtitle="Operational diagnostics"
                    logoSrc={resolvedLogoSrc}
                    logoAlt="MT Legacy logo"
                  />

                  <div className="max-w-3xl space-y-3">
                    <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
                      Platform health, without the raw JSON wall.
                    </h1>
                    <p className="max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
                      Live infrastructure status for the MT Invoices platform, tuned for quick human review while the
                      machine-readable endpoint stays intact for monitors and cron.
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:w-[34rem] lg:grid-cols-5">
                <div className="rounded-3xl border border-border bg-card/95 p-4 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Environment</p>
                  <p className="mt-3 text-xl font-semibold text-foreground">{health?.service.environment ?? 'Loading'}</p>
                </div>
                <div className="rounded-3xl border border-border bg-card/95 p-4 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Runtime</p>
                  <p className="mt-3 text-xl font-semibold text-foreground">{health?.service.runtime ?? 'Loading'}</p>
                </div>
                <div className="rounded-3xl border border-border bg-card/95 p-4 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Uptime</p>
                  <p className="mt-3 text-xl font-semibold text-foreground">
                    {health ? formatUptime(health.service.uptimeSeconds) : 'Loading'}
                  </p>
                </div>
                <div className="rounded-3xl border border-border bg-card/95 p-4 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">API services</p>
                  <p className="mt-3 text-xl font-semibold text-foreground">
                    {health?.api ? `${health.api.totals.healthyServices}/${health.api.totals.services}` : 'Loading'}
                  </p>
                </div>
                <div className="rounded-3xl border border-border bg-card/95 p-4 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">API routes</p>
                  <p className="mt-3 text-xl font-semibold text-foreground">
                    {health?.api ? `${health.api.totals.healthyRoutes}/${health.api.totals.routes}` : 'Loading'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-8 px-5 py-6 sm:px-8 lg:grid-cols-[minmax(0,1.65fr)_minmax(18rem,0.95fr)] lg:py-8">
            <div className="space-y-6">
              <div className="flex flex-col gap-4 rounded-[1.75rem] border border-border bg-card/80 p-5 shadow-sm sm:flex-row sm:items-end sm:justify-between sm:p-6">
                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Latest summary</p>
                  <p className="max-w-2xl text-lg font-semibold leading-8 text-foreground">
                    {health?.summary ?? 'Loading the latest platform check results.'}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {health ? `Checked ${formatTimestamp(health.timestamp)}` : 'Preparing the latest health snapshot.'}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => void loadHealth('refresh')}
                    disabled={isRefreshing}
                    className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {isRefreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    Refresh
                  </button>
                  <a
                    href="/api/health?format=json"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    Raw JSON
                    <ArrowUpRight className="h-4 w-4" />
                  </a>
                </div>
              </div>

              {error && !health ? (
                <div className="rounded-[1.75rem] border border-destructive/20 bg-destructive/10 p-6 text-sm text-destructive shadow-sm">
                  <div className="flex items-start gap-3">
                    <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0" />
                    <div>
                      <p className="font-semibold">Health snapshot unavailable</p>
                      <p className="mt-1">{error}</p>
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="grid gap-4 md:grid-cols-2">
                {isLoading && !health
                  ? Array.from({ length: 4 }, (_, index) => <SkeletonCard key={index} />)
                  : checkCards.map((card) => <CheckCard key={card.title} {...card} />)}
              </div>

              {health?.api ? (
                <section className="rounded-[1.75rem] border border-border bg-card/90 p-5 shadow-sm sm:p-6">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                        API service monitor
                      </p>
                      <h2 className="text-2xl font-semibold tracking-tight text-foreground">
                        Live API uptime and health coverage
                      </h2>
                      <p className="max-w-3xl text-sm leading-6 text-muted-foreground">{health.api.summary}</p>
                    </div>
                    <div className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground">
                      <Waypoints className="h-3.5 w-3.5" />
                      {health.api.totals.routes} monitored routes
                    </div>
                  </div>

                  <div className="mt-6 grid gap-4 xl:grid-cols-2">
                    {apiServices.map((service) => (
                      <ApiServiceCard key={service.id} service={service} />
                    ))}
                  </div>
                </section>
              ) : null}

              {health?.api ? (
                <section className="rounded-[1.75rem] border border-border bg-card/90 p-5 shadow-sm sm:p-6">
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                      Route inventory
                    </p>
                    <h2 className="text-2xl font-semibold tracking-tight text-foreground">
                      Every monitored API route in one view
                    </h2>
                    <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                      Route health inherits from the live service probe that owns it in production. Direct probes are
                      marked where the monitor hits the endpoint itself.
                    </p>
                  </div>

                  <div className="mt-6 space-y-4">
                    {apiRouteGroups.map((group) => (
                      <section key={group.service?.id ?? group.routes[0]?.serviceId} className="rounded-3xl border border-border bg-background/90">
                        <div className="flex flex-col gap-3 border-b border-border px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="text-sm font-semibold text-foreground">
                              {group.service?.name ?? group.routes[0]?.serviceName ?? 'API service'}
                            </p>
                            <p className="mt-1 text-sm text-muted-foreground">
                              {group.service
                                ? `${formatRuntimeLabel(group.service.runtime)} · ${formatAccessLabel(group.service.access)}`
                                : 'Monitoring details unavailable'}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={cn(
                                'rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.2em]',
                                group.service?.status === 'pass'
                                  ? 'border-primary/20 bg-primary/10 text-primary'
                                  : 'border-destructive/20 bg-destructive/10 text-destructive',
                              )}
                            >
                              {group.service?.status === 'pass' ? 'Healthy' : 'Issue'}
                            </span>
                            <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-foreground">
                              {group.routes.length} routes
                            </span>
                          </div>
                        </div>

                        <div className="overflow-x-auto">
                          <table className="min-w-full text-sm">
                            <thead>
                              <tr className="border-b border-border text-left text-xs uppercase tracking-[0.18em] text-muted-foreground">
                                <th className="px-4 py-3 font-medium">Method</th>
                                <th className="px-4 py-3 font-medium">Path</th>
                                <th className="px-4 py-3 font-medium">Access</th>
                                <th className="px-4 py-3 font-medium">Monitor</th>
                                <th className="px-4 py-3 font-medium">Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {group.routes.map((route) => (
                                <tr key={`${route.method}-${route.path}`} className="border-b border-border/70 last:border-b-0">
                                  <td className="px-4 py-3 align-top">
                                    <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground">
                                      {route.method}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3 align-top">
                                    <p className="font-medium text-foreground">{route.path}</p>
                                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{route.summary}</p>
                                  </td>
                                  <td className="px-4 py-3 align-top text-muted-foreground">
                                    {formatAccessLabel(route.access)}
                                  </td>
                                  <td className="px-4 py-3 align-top text-muted-foreground">
                                    {route.monitoring === 'direct' ? 'Direct probe' : 'Inherited'}
                                  </td>
                                  <td className="px-4 py-3 align-top">
                                    <span
                                      className={cn(
                                        'rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.2em]',
                                        route.status === 'pass'
                                          ? 'border-primary/20 bg-primary/10 text-primary'
                                          : 'border-destructive/20 bg-destructive/10 text-destructive',
                                      )}
                                    >
                                      {route.status === 'pass' ? 'Healthy' : 'Issue'}
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

            <aside className="space-y-4">
              <section className="rounded-[1.75rem] border border-border bg-card/90 p-5 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Runtime footprint</p>
                <dl className="mt-5 space-y-4">
                  <div className="rounded-2xl bg-muted/60 p-4">
                    <dt className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Service</dt>
                    <dd className="mt-2 text-base font-semibold text-foreground">{health?.service.name ?? 'Loading'}</dd>
                  </div>
                  <div className="rounded-2xl bg-muted/60 p-4">
                    <dt className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Region</dt>
                    <dd className="mt-2 text-base font-semibold text-foreground">{health?.service.region ?? 'Global edge'}</dd>
                  </div>
                  <div className="rounded-2xl bg-muted/60 p-4">
                    <dt className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Deployment</dt>
                    <dd className="mt-2 break-words text-sm text-foreground">
                      {health?.service.deploymentUrl ? (
                        <a
                          href={health.service.deploymentUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-2 font-medium text-foreground transition-colors hover:text-primary"
                        >
                          {health.service.deploymentUrl}
                          <ArrowUpRight className="h-4 w-4" />
                        </a>
                      ) : (
                        'Unavailable'
                      )}
                    </dd>
                  </div>
                </dl>
              </section>

              <section className="rounded-[1.75rem] border border-border bg-card/90 p-5 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Monitoring coverage</p>
                <div className="mt-5 space-y-4">
                  <div className="rounded-2xl border border-border bg-background p-4">
                    <p className="text-sm font-semibold text-foreground">Storage visibility</p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Bucket `{health?.checks.storage.bucket ?? 'app-images'}` is{' '}
                      {health?.checks.storage.public ? 'publicly readable' : 'kept private'} with a size cap of{' '}
                      {formatFileSizeLimit(health?.checks.storage.fileSizeLimit ?? null)}.
                    </p>
                  </div>
                  <div className="rounded-2xl border border-border bg-background p-4">
                    <p className="text-sm font-semibold text-foreground">API route coverage</p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {health?.api
                        ? `${health.api.totals.publicRoutes} public, ${health.api.totals.protectedRoutes} protected, and ${health.api.totals.mixedRoutes} mixed-access routes are tracked.`
                        : 'API route coverage appears after the first successful monitor snapshot.'}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-border bg-background p-4">
                    <p className="text-sm font-semibold text-foreground">Request trace</p>
                    <p className="mt-2 break-all text-sm text-muted-foreground">
                      {health?.service.requestId ?? 'Request ID will appear after the first successful health load.'}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-border bg-background p-4">
                    <p className="text-sm font-semibold text-foreground">Configuration coverage</p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {health
                        ? `${health.checks.configuration.checked.length} required environment keys are validated on every run.`
                        : 'The health endpoint validates the runtime configuration on every request.'}
                    </p>
                  </div>
                </div>
              </section>
            </aside>
          </div>
        </section>
      </main>
    </div>
  );
}
