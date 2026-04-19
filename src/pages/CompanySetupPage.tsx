import React, { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Building2, Loader2 } from 'lucide-react';
import { AppHeader } from '../components/layout/AppHeader';
import { CompanyProfileForm } from '../components/company/CompanyProfileForm';
import { Button } from '../components/ui/Button';
import { apiRequest } from '../lib/api';
import type { CompaniesResponse } from '../lib/company';
import { createEmptyCompanyFormValues } from '../lib/company';
import { useWorkspace } from '../lib/workspace';
import { toast } from 'sonner';

export function CompanySetupPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { refreshWorkspace } = useWorkspace();
  const [form, setForm] = useState(createEmptyCompanyFormValues());
  const [isSubmitting, setIsSubmitting] = useState(false);

  const redirectTarget = useMemo(() => {
    const from = (location.state as { from?: string } | null)?.from;
    return from && from !== '/company/setup' ? from : '/';
  }, [location.state]);

  const handleChange = <K extends keyof typeof form>(field: K, value: (typeof form)[K]) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
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
    <div className="min-h-screen bg-slate-100 pb-10">
      <AppHeader showCreateInvoice={false} />

      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="grid gap-6 lg:grid-cols-[0.78fr_1.22fr]">
          <section className="rounded-[32px] border border-white/70 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 p-6 text-white shadow-[0_40px_120px_-60px_rgba(15,23,42,0.75)] sm:p-8">
            <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-white/15 bg-white/10">
              <Building2 className="h-7 w-7" />
            </div>
            <h1 className="mt-6 text-3xl font-semibold tracking-tight">
              Create your first company
            </h1>
            <p className="mt-3 max-w-md text-sm leading-6 text-slate-300 sm:text-base">
              Your invoices, issuer details, bank details, and document logo all live inside a company workspace.
              Set that up once, then the rest of the app will use it automatically.
            </p>
            <div className="mt-8 space-y-3 text-sm text-slate-300">
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                Company details replace the hardcoded invoice issuer profile.
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                Bank details are printed directly on invoice exports for this company.
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                You can add more companies later and switch between them from the header.
              </div>
            </div>
          </section>

          <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_30px_100px_-50px_rgba(15,23,42,0.35)] sm:p-8">
            <div className="border-b border-slate-200 pb-5">
              <h2 className="text-2xl font-semibold tracking-tight text-slate-950">
                Company profile
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                These values become the default issuer and bank details on every invoice created in this workspace.
              </p>
            </div>

            <form className="mt-6 space-y-6" onSubmit={handleSubmit}>
              <CompanyProfileForm values={form} onChange={handleChange} />

              <div className="flex flex-col gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-slate-500">
                  You can update the document logo and member access right after setup.
                </p>
                <Button type="submit" disabled={isSubmitting} className="h-11 rounded-2xl px-5">
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating company
                    </>
                  ) : (
                    'Create company'
                  )}
                </Button>
              </div>
            </form>
          </section>
        </div>
      </main>
    </div>
  );
}
