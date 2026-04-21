/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Toaster } from 'sonner';
import { Dashboard } from './pages/Dashboard';
import { Invoices } from './pages/Invoices';
import { AuthPage } from './pages/AuthPage';
import { SettingsPage } from './pages/SettingsPage';
import { ProtectedRoute } from './components/ProtectedRoute';
import { ConfirmationProvider } from './components/ui/ConfirmationProvider';
import { MobileNav } from './components/layout/MobileNav';
import { BrandingProvider } from './lib/branding';
import { WorkspaceProvider } from './lib/workspace';

const AcceptInvitationPage = React.lazy(() =>
  import('./pages/AcceptInvitationPage').then((module) => ({ default: module.AcceptInvitationPage })),
);
const ClientsPage = React.lazy(() =>
  import('./pages/ClientsPage').then((module) => ({ default: module.ClientsPage })),
);
const CompaniesPage = React.lazy(() =>
  import('./pages/CompaniesPage').then((module) => ({ default: module.CompaniesPage })),
);
const CompanySetupPage = React.lazy(() =>
  import('./pages/CompanySetupPage').then((module) => ({ default: module.CompanySetupPage })),
);
const InvoiceGenerator = React.lazy(() =>
  import('./pages/InvoiceGenerator').then((module) => ({ default: module.InvoiceGenerator })),
);
const InvoicePreviewPage = React.lazy(() =>
  import('./pages/InvoicePreviewPage').then((module) => ({ default: module.InvoicePreviewPage })),
);
const InvoicePrintPage = React.lazy(() =>
  import('./pages/InvoicePrintPage').then((module) => ({ default: module.InvoicePrintPage })),
);
const HealthPage = React.lazy(() =>
  import('./pages/HealthPage').then((module) => ({ default: module.HealthPage })),
);
const UsersPage = React.lazy(() =>
  import('./pages/UsersPage').then((module) => ({ default: module.UsersPage })),
);
const VerifyInvoice = React.lazy(() =>
  import('./pages/VerifyInvoice').then((module) => ({ default: module.VerifyInvoice })),
);

function RouteFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="text-sm font-medium text-muted-foreground">Loading...</div>
    </div>
  );
}

function LazyRoute({ children }: { children: React.ReactNode }) {
  return <React.Suspense fallback={<RouteFallback />}>{children}</React.Suspense>;
}

function AppRoutes() {
  const location = useLocation();
  const isPrintRoute = location.pathname.startsWith('/print/');

  return (
    <>
      <Routes>
        <Route path="/" element={<Navigate to="/auth" replace />} />
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/invite/:token" element={<LazyRoute><AcceptInvitationPage /></LazyRoute>} />
        <Route path="/health" element={<LazyRoute><HealthPage /></LazyRoute>} />
        <Route path="/verify" element={<LazyRoute><VerifyInvoice /></LazyRoute>} />
        <Route path="/print/invoice/:id" element={<LazyRoute><InvoicePrintPage /></LazyRoute>} />
        <Route path="/print/invoices" element={<LazyRoute><InvoicePrintPage /></LazyRoute>} />

        {/* Protected Routes */}
        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/clients" element={<ProtectedRoute><LazyRoute><ClientsPage /></LazyRoute></ProtectedRoute>} />
        <Route path="/users" element={<ProtectedRoute requireCompany={false}><LazyRoute><UsersPage /></LazyRoute></ProtectedRoute>} />
        <Route path="/companies" element={<ProtectedRoute requireCompany={false}><LazyRoute><CompaniesPage /></LazyRoute></ProtectedRoute>} />
        <Route path="/company/setup" element={<ProtectedRoute requireCompany={false}><LazyRoute><CompanySetupPage /></LazyRoute></ProtectedRoute>} />
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <SettingsPage />
            </ProtectedRoute>
          }
        />
        <Route path="/invoices/new" element={<ProtectedRoute><LazyRoute><InvoiceGenerator /></LazyRoute></ProtectedRoute>} />
        <Route path="/invoices" element={<ProtectedRoute><Invoices /></ProtectedRoute>} />
        <Route path="/invoice/:id/preview" element={<ProtectedRoute><LazyRoute><InvoicePreviewPage /></LazyRoute></ProtectedRoute>} />

        <Route path="*" element={<Navigate to="/auth" replace />} />
      </Routes>
      {!isPrintRoute ? <MobileNav /> : null}
    </>
  );
}

export default function App() {
  return (
    <BrandingProvider>
      <WorkspaceProvider>
        <ConfirmationProvider>
          <Toaster position="bottom-right" richColors />
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </ConfirmationProvider>
      </WorkspaceProvider>
    </BrandingProvider>
  );
}
