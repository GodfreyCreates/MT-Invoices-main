import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Building2, Check, ChevronDown, Loader2, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { authClient } from '../../lib/auth-client';
import { useBranding } from '../../lib/branding';
import { useWorkspace } from '../../lib/workspace';
import { getCompanyRoleLabel } from '../../lib/company';
import { Button } from '../ui/Button';
import { Header, HeaderBrand } from './Header';

function getWorkspaceSubtitle(role?: string | null) {
  return role?.toLowerCase() === 'admin' ? 'Super Admin' : 'Invoice Workspace';
}

function CompanySwitcher() {
  const navigate = useNavigate();
  const workspace = useWorkspace();
  const [isOpen, setIsOpen] = useState(false);
  const [switchingCompanyId, setSwitchingCompanyId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  const activeCompany = workspace.activeCompany;

  const handleSwitchCompany = async (companyId: string) => {
    if (companyId === activeCompany?.id) {
      setIsOpen(false);
      return;
    }

    setSwitchingCompanyId(companyId);
    try {
      await workspace.switchCompany(companyId);
      toast.success('Switched company successfully');
      setIsOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to switch company');
    } finally {
      setSwitchingCompanyId(null);
    }
  };

  const activeRoleLabel = useMemo(() => {
    if (!activeCompany) {
      return null;
    }

    return getCompanyRoleLabel(activeCompany.membershipRole);
  }, [activeCompany]);

  if (workspace.companies.length === 0) {
    return null;
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-left shadow-sm transition hover:border-indigo-200 hover:bg-slate-50"
        aria-haspopup="menu"
        aria-expanded={isOpen}
      >
        <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-slate-900 text-white shadow-sm">
          <Building2 className="h-4 w-4" />
        </div>
        <div className="hidden min-w-0 sm:block">
          <p className="truncate text-sm font-semibold text-slate-900">
            {activeCompany?.name ?? 'Company'}
          </p>
          {activeRoleLabel ? (
            <p className="truncate text-[11px] uppercase tracking-[0.16em] text-slate-500">
              {activeRoleLabel}
            </p>
          ) : null}
        </div>
        <ChevronDown
          className={`h-4 w-4 text-slate-500 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen ? (
        <div className="absolute right-0 top-[calc(100%+0.75rem)] z-50 w-[20rem] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_60px_-24px_rgba(15,23,42,0.35)]">
          <div className="border-b border-slate-200 bg-gradient-to-br from-slate-50 via-white to-indigo-50 px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Active company
            </p>
            <p className="mt-2 text-base font-semibold tracking-tight text-slate-950">
              {activeCompany?.name ?? 'Select a company'}
            </p>
          </div>

          <div className="max-h-80 overflow-y-auto p-2">
            {workspace.companies.map((company) => {
              const isActive = company.id === activeCompany?.id;
              return (
                <button
                  key={company.id}
                  type="button"
                  role="menuitem"
                  onClick={() => void handleSwitchCompany(company.id)}
                  className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-3 text-left transition ${
                    isActive
                      ? 'bg-indigo-50 text-indigo-700'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{company.name}</p>
                    <p className="mt-1 text-[11px] uppercase tracking-[0.16em] text-slate-500">
                      {getCompanyRoleLabel(company.membershipRole)} · {company.memberCount} member
                      {company.memberCount === 1 ? '' : 's'}
                    </p>
                  </div>
                  {switchingCompanyId === company.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : isActive ? (
                    <Check className="h-4 w-4" />
                  ) : null}
                </button>
              );
            })}
          </div>

          <div className="border-t border-slate-200 p-2">
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                navigate('/companies');
              }}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-100"
            >
              <Plus className="h-4 w-4" />
              Create company
            </button>
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                navigate('/companies');
              }}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-100"
            >
              <Building2 className="h-4 w-4" />
              Manage companies
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

type AppHeaderProps = {
  action?: React.ReactNode;
  className?: string;
  contentClassName?: string;
  showCreateInvoice?: boolean;
};

export function AppHeader({
  action,
  className,
  contentClassName,
  showCreateInvoice = true,
}: AppHeaderProps) {
  const navigate = useNavigate();
  const { data: session } = authClient.useSession();
  const { resolvedLogoSrc } = useBranding();
  const workspace = useWorkspace();

  const handleSignOut = async () => {
    await authClient.signOut();
    toast.success('Signed out successfully');
    navigate('/auth');
  };

  return (
    <Header
      className={className}
      contentClassName={contentClassName}
      left={
        <HeaderBrand
          title="MT Legacy"
          subtitle={getWorkspaceSubtitle(session?.user?.role)}
          logoSrc={resolvedLogoSrc}
          logoAlt="MT Legacy logo"
        />
      }
      user={session?.user}
      onSignOut={handleSignOut}
      right={
        <>
          <CompanySwitcher />
          {action}
          {showCreateInvoice && workspace.activeCompany ? (
            <Button onClick={() => navigate('/invoices/new')} className="hidden gap-2 sm:flex">
              <Plus className="h-4 w-4" />
              Create Invoice
            </Button>
          ) : null}
        </>
      }
    />
  );
}
