import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { authClient, isAuthenticatedSession } from '../lib/auth-client';
import { savePostAuthRedirectTarget } from '../lib/auth-redirect';
import { useWorkspace } from '../lib/workspace';

export function ProtectedRoute({
  children,
  requireCompany = true,
}: {
  children: React.ReactNode;
  requireCompany?: boolean;
}) {
  const location = useLocation();
  const { data: session, isPending } = authClient.useSession();
  const workspace = useWorkspace();
  const isAuthenticated = isAuthenticatedSession(session);
  const routeTarget = `${location.pathname}${location.search}${location.hash}`;
  const companySetupReturnTarget =
    typeof location.state === 'object' &&
    location.state &&
    'from' in location.state &&
    typeof location.state.from === 'string' &&
    location.state.from !== '/company/setup'
      ? location.state.from
      : '/dashboard';
  const isGlobalAdmin = workspace.isGlobalAdmin || session?.user?.role === 'admin';
  const canAccessCompanies =
    isGlobalAdmin || workspace.activeCompany?.permissions.canEditCompany === true;
  const hasWorkspaceData =
    workspace.companies.length > 0 ||
    Boolean(workspace.activeCompany) ||
    (workspace.allCompanies?.length ?? 0) > 0;
  const shouldRequireCompanySetup = isGlobalAdmin && workspace.companies.length === 0;
  const isResolvingAuth = isPending && !isAuthenticated;
  const isResolvingWorkspace =
    isAuthenticated &&
    (!workspace.isReady || workspace.resolvedSessionKey !== session.user.id);

  if (isResolvingAuth || isResolvingWorkspace) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="text-sm font-medium text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    savePostAuthRedirectTarget(routeTarget);
    return (
      <Navigate
        to="/auth"
        replace
        state={{ from: routeTarget }}
      />
    );
  }

  if (workspace.error && !hasWorkspaceData) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-md rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
          <h1 className="text-xl font-semibold text-card-foreground">Workspace unavailable</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {workspace.error}
          </p>
        </div>
      </div>
    );
  }

  if (location.pathname === '/company/setup') {
    if (!isGlobalAdmin) {
      return <Navigate to={companySetupReturnTarget} replace />;
    }

    if (!shouldRequireCompanySetup) {
      return <Navigate to={companySetupReturnTarget} replace />;
    }
  }

  if (
    (location.pathname === '/companies' || location.pathname.startsWith('/company/')) &&
    location.pathname !== '/company/setup' &&
    !canAccessCompanies
  ) {
    return <Navigate to="/dashboard" replace />;
  }

  if (requireCompany && shouldRequireCompanySetup) {
    return (
      <Navigate
        to="/company/setup"
        replace
        state={{ from: routeTarget }}
      />
    );
  }

  if (requireCompany && workspace.companies.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-md rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
          <h1 className="text-xl font-semibold text-card-foreground">Workspace unavailable</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            You do not have access to a company workspace yet. Contact an administrator to assign you to one.
          </p>
        </div>
      </div>
    );
  }

  if (!requireCompany && location.pathname === '/company/setup' && workspace.companies.length > 0) {
    return <Navigate to={companySetupReturnTarget} replace />;
  }

  return <>{children}</>;
}
