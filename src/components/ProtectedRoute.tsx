import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { authClient, isAuthenticatedSession } from '../lib/auth-client';
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
  const hasWorkspaceData =
    workspace.companies.length > 0 ||
    Boolean(workspace.activeCompany) ||
    (workspace.allCompanies?.length ?? 0) > 0;
  const isResolvingAuth = isPending && !isAuthenticated;
  const isResolvingWorkspace = isAuthenticated && !workspace.isReady;

  if (isResolvingAuth || isResolvingWorkspace) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="text-sm font-medium text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <Navigate
        to="/auth"
        replace
        state={{ from: `${location.pathname}${location.search}${location.hash}` }}
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

  if (!requireCompany && location.pathname === '/company/setup' && workspace.companies.length > 0) {
    return <Navigate to="/dashboard" replace />;
  }

  if (requireCompany && workspace.companies.length === 0) {
    return (
      <Navigate
        to="/company/setup"
        replace
        state={{ from: `${location.pathname}${location.search}${location.hash}` }}
      />
    );
  }

  return <>{children}</>;
}
