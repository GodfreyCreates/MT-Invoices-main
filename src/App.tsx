/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { Dashboard } from './pages/Dashboard';
import { InvoiceGenerator } from './pages/InvoiceGenerator';
import { VerifyInvoice } from './pages/VerifyInvoice';
import { Invoices } from './pages/Invoices';
import { InvoicePreviewPage } from './pages/InvoicePreviewPage';
import { AuthPage } from './pages/AuthPage';
import { UsersPage } from './pages/UsersPage';
import { ProtectedRoute } from './components/ProtectedRoute';
import { MobileNav } from './components/layout/MobileNav';

const SettingsPage = lazy(() =>
  import('./pages/SettingsPage').then((module) => ({ default: module.SettingsPage })),
);

function RouteLoadingState() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 text-sm text-slate-500">
      Loading settings...
    </div>
  );
}

export default function App() {
  return (
    <>
      <Toaster position="top-center" richColors />
      <BrowserRouter>
        <Routes>
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/verify" element={<VerifyInvoice />} />
          
          {/* Protected Routes */}
          <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/users" element={<ProtectedRoute><UsersPage /></ProtectedRoute>} />
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <Suspense fallback={<RouteLoadingState />}>
                  <SettingsPage />
                </Suspense>
              </ProtectedRoute>
            }
          />
          <Route path="/invoices/new" element={<ProtectedRoute><InvoiceGenerator /></ProtectedRoute>} />
          <Route path="/invoices" element={<ProtectedRoute><Invoices /></ProtectedRoute>} />
          <Route path="/invoice/:id/preview" element={<ProtectedRoute><InvoicePreviewPage /></ProtectedRoute>} />
          
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <MobileNav />
      </BrowserRouter>
    </>
  );
}
