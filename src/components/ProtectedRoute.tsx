import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { authClient } from '../lib/auth-client';
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

  if (isPending || (session && workspace.isLoading)) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500 font-medium">Loading...</div>
      </div>
    );
  }

  if (!session) {
    return (
      <Navigate
        to="/auth"
        replace
        state={{ from: `${location.pathname}${location.search}${location.hash}` }}
      />
    );
  }

  if (workspace.error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <h1 className="text-xl font-semibold text-slate-900">Workspace unavailable</h1>
          <p className="mt-2 text-sm text-slate-500">
            {workspace.error}
          </p>
        </div>
      </div>
    );
  }

  if (!requireCompany && location.pathname === '/company/setup' && workspace.companies.length > 0) {
    return <Navigate to="/" replace />;
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
