import React, { useEffect, useMemo, useState } from 'react';
import {
  Building2,
  CheckCircle2,
  Loader2,
  Plus,
  ShieldCheck,
  UserPlus,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { AppHeader } from '../components/layout/AppHeader';
import { Button } from '../components/ui/Button';
import { PopoverSelect, type PopoverSelectOption } from '../components/ui/PopoverSelect';
import { CompanyProfileForm } from '../components/company/CompanyProfileForm';
import { CompanySettingsModal } from '../components/company/CompanySettingsModal';
import { apiRequest } from '../lib/api';
import {
  createEmptyCompanyFormValues,
  getCompanyRoleLabel,
  type CompaniesResponse,
  type CompanyRole,
} from '../lib/company';
import { useWorkspace } from '../lib/workspace';
import { toast } from 'sonner';

type UserOption = {
  id: string;
  name: string;
  email: string;
  role: string | null;
};

type InviteRole = CompanyRole;

const companyRoleOptions: PopoverSelectOption<InviteRole>[] = [
  { value: 'member', label: 'Member' },
  { value: 'admin', label: 'Admin' },
  { value: 'owner', label: 'Owner' },
];

type CompanyCardProps = {
  name: string;
  role: CompanyRole;
  memberCount: number;
  isActive: boolean;
  logoUrl: string | null;
  onOpen: () => void;
  onManage: () => void;
};

const CompanyCard: React.FC<CompanyCardProps> = ({
  name,
  role,
  memberCount,
  isActive,
  logoUrl,
  onOpen,
  onManage,
}) => {
  return (
    <article
      className={`rounded-[28px] border p-5 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.35)] transition-all ${
        isActive
          ? 'border-indigo-200 bg-indigo-50/70'
          : 'border-slate-200 bg-white hover:border-indigo-200 hover:bg-slate-50'
      }`}
    >
      <div className="flex items-start gap-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
          {logoUrl ? (
            <img src={logoUrl} alt={name} className="max-h-full max-w-full object-contain" />
          ) : (
            <div className="flex h-full w-full items-center justify-center rounded-xl bg-slate-900 text-sm font-bold tracking-[0.2em] text-white">
              {name.slice(0, 2).toUpperCase()}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-lg font-semibold tracking-tight text-slate-950">{name}</h2>
            {isActive ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Active
              </span>
            ) : null}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-slate-500">
            <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-700">
              {getCompanyRoleLabel(role)}
            </span>
            <span>
              {memberCount} member{memberCount === 1 ? '' : 's'}
            </span>
          </div>
        </div>
      </div>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <Button onClick={onOpen} className="h-10 rounded-2xl px-4">
          {isActive ? 'Open workspace' : 'Switch to company'}
        </Button>
        <Button
          variant="outline"
          onClick={onManage}
          className="h-10 rounded-2xl px-4"
          aria-label={`Open company settings for ${name}`}
        >
          Company settings
        </Button>
      </div>
    </article>
  );
};

export function CompaniesPage() {
  const navigate = useNavigate();
  const workspace = useWorkspace();
  const [isCreateOpen, setIsCreateOpen] = useState(workspace.companies.length === 0);
  const [isCreating, setIsCreating] = useState(false);
  const [form, setForm] = useState(createEmptyCompanyFormValues());
  const [users, setUsers] = useState<UserOption[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [assignment, setAssignment] = useState({
    companyId: '',
    userId: '',
    role: 'member' as InviteRole,
  });
  const [isAssigning, setIsAssigning] = useState(false);

  useEffect(() => {
    if (!workspace.isGlobalAdmin) {
      return;
    }

    const loadAdminUsers = async () => {
      setIsLoadingUsers(true);
      try {
        const response = await apiRequest<UserOption[]>('/api/users');
        setUsers(
          response.map((user) => ({
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role ?? 'user',
          })),
        );
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to load users');
      } finally {
        setIsLoadingUsers(false);
      }
    };

    void loadAdminUsers();
  }, [workspace.isGlobalAdmin]);

  const handleChange = <K extends keyof typeof form>(field: K, value: (typeof form)[K]) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const openCreate = () => {
    setIsCreateOpen(true);
  };

  const closeCreate = () => {
    if (workspace.companies.length > 0) {
      setIsCreateOpen(false);
    }
  };

  const handleCreateCompany = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsCreating(true);

    try {
      await apiRequest<CompaniesResponse>('/api/companies', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      await workspace.refreshWorkspace();
      toast.success('Company created successfully');
      setForm(createEmptyCompanyFormValues());
      setIsCreateOpen(false);
      navigate('/');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create company');
    } finally {
      setIsCreating(false);
    }
  };

  const handleSwitchCompany = async (companyId: string) => {
    try {
      await workspace.switchCompany(companyId);
      toast.success('Company switched successfully');
      navigate('/');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to switch company');
    }
  };

  const handleAssignUser = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!assignment.companyId || !assignment.userId) {
      toast.error('Select both a company and a user');
      return;
    }

    setIsAssigning(true);
    try {
      await apiRequest(`/api/companies/${assignment.companyId}/members`, {
        method: 'POST',
        body: JSON.stringify({
          userId: assignment.userId,
          role: assignment.role,
        }),
      });
      toast.success('User assigned to company');
      setAssignment({
        companyId: '',
        userId: '',
        role: 'member',
      });
      await workspace.refreshWorkspace();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to assign user');
    } finally {
      setIsAssigning(false);
    }
  };

  const allCompanies = workspace.allCompanies ?? [];
  const companyOptions = useMemo<PopoverSelectOption<string>[]>(() => {
    return allCompanies.map((company) => ({
      value: company.id,
      label: company.name,
    }));
  }, [allCompanies]);

  const availableUserOptions = useMemo(() => {
    return [...users].sort((left, right) => left.name.localeCompare(right.name));
  }, [users]);

  const userOptions = useMemo<PopoverSelectOption<string>[]>(() => {
    return availableUserOptions.map((user) => ({
      value: user.id,
      label: user.name,
      description: user.email,
    }));
  }, [availableUserOptions]);

  return (
    <div className="min-h-screen bg-slate-100 pb-24 sm:pb-10">
      <AppHeader showCreateInvoice={workspace.companies.length > 0} />

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <section className="rounded-[32px] border border-white/70 bg-white/90 p-6 shadow-[0_30px_100px_-50px_rgba(15,23,42,0.35)] sm:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-indigo-700">
                <Building2 className="h-3.5 w-3.5" />
                Companies
              </p>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950">
                Manage company workspaces
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500 sm:text-base">
                Your company controls invoice issuer details, bank details, members, and document branding.
                Switch between companies from the header any time.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button
                variant="outline"
                onClick={() => void workspace.refreshWorkspace()}
                className="h-11 rounded-2xl px-4"
              >
                Refresh
              </Button>
              <Button onClick={openCreate} className="h-11 rounded-2xl px-4 gap-2">
                <Plus className="h-4 w-4" />
                Create company
              </Button>
            </div>
          </div>

          <div className="mt-8 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {workspace.companies.map((company) => (
              <CompanyCard
                key={company.id}
                name={company.name}
                role={company.membershipRole}
                memberCount={company.memberCount}
                isActive={workspace.activeCompany?.id === company.id}
                logoUrl={company.documentLogoUrl}
                onOpen={() => void handleSwitchCompany(company.id)}
                onManage={() => setSelectedCompanyId(company.id)}
              />
            ))}
          </div>

          {workspace.companies.length === 0 ? (
            <div className="mt-8 rounded-[28px] border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
              <Building2 className="mx-auto h-10 w-10 text-slate-400" />
              <h2 className="mt-4 text-xl font-semibold text-slate-900">No companies yet</h2>
              <p className="mt-2 text-sm text-slate-500">
                Create your first company to unlock the dashboard, invoice creation, and company-scoped settings.
              </p>
            </div>
          ) : null}
        </section>

        {isCreateOpen ? (
          <section className="mt-6 rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_30px_100px_-50px_rgba(15,23,42,0.35)] sm:p-8">
            <div className="flex flex-col gap-3 border-b border-slate-200 pb-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight text-slate-950">
                  Create company
                </h2>
                <p className="mt-2 text-sm text-slate-500">
                  This company will become available in the header switcher as soon as it is created.
                </p>
              </div>
              {workspace.companies.length > 0 ? (
                <Button variant="outline" onClick={closeCreate} className="h-11 rounded-2xl px-4">
                  Close
                </Button>
              ) : null}
            </div>

            <form className="mt-6 space-y-6" onSubmit={handleCreateCompany}>
              <CompanyProfileForm values={form} onChange={handleChange} />
              <div className="flex flex-col gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-slate-500">
                  Company members and the company document logo can be managed after creation.
                </p>
                <Button type="submit" disabled={isCreating} className="h-11 rounded-2xl px-5">
                  {isCreating ? (
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
        ) : null}

        {workspace.isGlobalAdmin ? (
          <section className="mt-6 rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_30px_100px_-50px_rgba(15,23,42,0.35)] sm:p-6">
            <div className="border-b border-slate-200 pb-4">
              <div className="max-w-2xl">
                <p className="inline-flex items-center gap-2 rounded-full border border-sky-100 bg-sky-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-sky-700">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Workspace admin
                </p>
                <h2 className="mt-3 text-xl font-semibold tracking-tight text-slate-950 sm:text-2xl">
                  Assign existing users to companies
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  Attach existing users to a company workspace without leaving this page.
                </p>
              </div>
            </div>

            <div className="mt-4 max-w-5xl rounded-[24px] border border-slate-200 bg-slate-50/80 p-4 sm:p-5">
              <form
                className="grid gap-3 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1.15fr)_180px_auto] lg:items-end"
                onSubmit={handleAssignUser}
              >
                <div className="grid gap-2">
                  <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Company
                  </label>
                  <PopoverSelect
                    value={assignment.companyId}
                    onValueChange={(value) =>
                      setAssignment((current) => ({ ...current, companyId: value }))
                    }
                    options={companyOptions}
                    placeholder="Select a company"
                    ariaLabel="Select company"
                    triggerClassName="h-10"
                  />
                </div>

                <div className="grid gap-2">
                  <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Existing user
                  </label>
                  <PopoverSelect
                    value={assignment.userId}
                    onValueChange={(value) =>
                      setAssignment((current) => ({ ...current, userId: value }))
                    }
                    options={userOptions}
                    placeholder={
                      isLoadingUsers
                        ? 'Loading users...'
                        : userOptions.length > 0
                          ? 'Select a user'
                          : 'No users available'
                    }
                    disabled={isLoadingUsers}
                    emptyMessage={isLoadingUsers ? 'Loading users...' : 'No users available'}
                    ariaLabel="Select existing user"
                    triggerClassName="h-10"
                  />
                </div>

                <div className="grid gap-2">
                  <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Company role
                  </label>
                  <PopoverSelect
                    value={assignment.role}
                    onValueChange={(value) =>
                      setAssignment((current) => ({
                        ...current,
                        role: value,
                      }))
                    }
                    options={companyRoleOptions}
                    ariaLabel="Select company role"
                    triggerClassName="h-10"
                  />
                </div>

                <Button
                  type="submit"
                  disabled={isAssigning || isLoadingUsers || availableUserOptions.length === 0}
                  className="h-10 rounded-2xl px-4 gap-2 lg:min-w-[190px]"
                >
                  {isAssigning ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Assigning user
                    </>
                  ) : (
                    <>
                      <UserPlus className="h-4 w-4" />
                      Assign existing user
                    </>
                  )}
                </Button>
              </form>
            </div>
          </section>
        ) : null}
      </main>

      <CompanySettingsModal
        companyId={selectedCompanyId}
        isOpen={Boolean(selectedCompanyId)}
        onClose={() => setSelectedCompanyId(null)}
        onUpdated={async () => {
          await workspace.refreshWorkspace();
        }}
      />
    </div>
  );
}
