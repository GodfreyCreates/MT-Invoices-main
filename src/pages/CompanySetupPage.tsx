import React, { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Building2, Loader2 } from 'lucide-react';
import { AppHeader } from '../components/layout/AppHeader';
import { CompanyProfileForm } from '../components/company/CompanyProfileForm';
import { Button } from '../components/ui/Button';
import { apiRequest } from '../lib/api';
import type { CompaniesResponse } from '../lib/company';
import { createEmptyCompanyFormValues } from '../lib/company';
import { authClient } from '../lib/auth-client';
import { useWorkspace } from '../lib/workspace';
import { toast } from 'sonner';

export function CompanySetupPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { data: session } = authClient.useSession();
  const workspace = useWorkspace();
  const { refreshWorkspace } = workspace;
  const [form, setForm] = useState(createEmptyCompanyFormValues());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const canCreateCompany = workspace.isGlobalAdmin || session?.user?.role === 'admin';

  const redirectTarget = useMemo(() => {
    const from = (location.state as { from?: string } | null)?.from;
    return from && from !== '/company/setup' ? from : '/dashboard';
  }, [location.state]);

  const handleChange = <K extends keyof typeof form>(field: K, value: (typeof form)[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canCreateCompany) {
      toast.error('Only admin users can create companies');
      return;
    }
    setIsSubmitting(true);
    try {
      await apiRequest<CompaniesResponse>('/api/companies', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      await refreshWorkspace();
      toast.success('Company created successfully');
      navigate(redirectTarget, { replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create company');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader showCreateInvoice={false} showPrimaryLinks={false} />

      <main className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
        {/* Page heading */}
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900">
            <Building2 className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-slate-900">
              Create company
            </h1>
            <p className="text-sm text-slate-500">
              Used as the default issuer on every invoice.
            </p>
          </div>
        </div>

        {/* Form card */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <form className="space-y-6" onSubmit={handleSubmit}>
            <CompanyProfileForm values={form} onChange={handleChange} />

            <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-5">
              <p className="mr-auto text-xs text-slate-400">
                Logo &amp; member access can be configured after setup.
              </p>
              <Button
                type="submit"
                disabled={isSubmitting || !canCreateCompany}
                className="h-10 rounded-xl px-5 text-sm"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating…
                  </>
                ) : (
                  'Create company'
                )}
              </Button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
