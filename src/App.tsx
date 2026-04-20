/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Toaster } from 'sonner';
import { Dashboard } from './pages/Dashboard';
import { InvoiceGenerator } from './pages/InvoiceGenerator';
import { VerifyInvoice } from './pages/VerifyInvoice';
import { Invoices } from './pages/Invoices';
import { InvoicePreviewPage } from './pages/InvoicePreviewPage';
import { AuthPage } from './pages/AuthPage';
import { AcceptInvitationPage } from './pages/AcceptInvitationPage';
import { UsersPage } from './pages/UsersPage';
import { CompaniesPage } from './pages/CompaniesPage';
import { CompanySetupPage } from './pages/CompanySetupPage';
import { InvoicePrintPage } from './pages/InvoicePrintPage';
import { SettingsPage } from './pages/SettingsPage';
import { ProtectedRoute } from './components/ProtectedRoute';
import { ConfirmationProvider } from './components/ui/ConfirmationProvider';
import { MobileNav } from './components/layout/MobileNav';
import { BrandingProvider } from './lib/branding';
import { WorkspaceProvider } from './lib/workspace';

function AppRoutes() {
  const location = useLocation();
  const isPrintRoute = location.pathname.startsWith('/print/');

  return (
    <>
      <Routes>
        <Route path="/" element={<Navigate to="/auth" replace />} />
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/invite/:token" element={<AcceptInvitationPage />} />
        <Route path="/verify" element={<VerifyInvoice />} />
        <Route path="/print/invoice/:id" element={<InvoicePrintPage />} />
        <Route path="/print/invoices" element={<InvoicePrintPage />} />

        {/* Protected Routes */}
        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/users" element={<ProtectedRoute requireCompany={false}><UsersPage /></ProtectedRoute>} />
        <Route path="/companies" element={<ProtectedRoute requireCompany={false}><CompaniesPage /></ProtectedRoute>} />
        <Route path="/company/setup" element={<ProtectedRoute requireCompany={false}><CompanySetupPage /></ProtectedRoute>} />
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <SettingsPage />
            </ProtectedRoute>
          }
        />
        <Route path="/invoices/new" element={<ProtectedRoute><InvoiceGenerator /></ProtectedRoute>} />
        <Route path="/invoices" element={<ProtectedRoute><Invoices /></ProtectedRoute>} />
        <Route path="/invoice/:id/preview" element={<ProtectedRoute><InvoicePreviewPage /></ProtectedRoute>} />

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
