import React, { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { DollarSign, FileText, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { AppHeader } from '../components/layout/AppHeader';
import { Button } from '../components/ui/Button';
import { apiRequest } from '../lib/api';
import { type CompanyRole, getCompanyRoleLabel } from '../lib/company';
import { formatCurrency } from '../lib/utils';
import { useWorkspace } from '../lib/workspace';

type DashboardRecentInvoice = {
  clientCompanyName: string;
  id: string;
  invoiceNo: string;
  issueDate: string;
  totalAmount: number;
};

type DashboardSummary = {
  appliedRoleFilter: CompanyRole;
  recentInvoices: DashboardRecentInvoice[];
  totalInvoices: number;
  totalRevenue: number;
  uniqueClients: number;
};

const EMPTY_DASHBOARD_SUMMARY: DashboardSummary = {
  appliedRoleFilter: 'member',
  recentInvoices: [],
  totalInvoices: 0,
  totalRevenue: 0,
  uniqueClients: 0,
};

const DASHBOARD_ROLE_FILTERS: CompanyRole[] = ['owner', 'admin', 'member'];
const dashboardCache = new Map<string, DashboardSummary>();

type StatCardProps = {
  icon: React.ReactNode;
  label: string;
  value: string | number;
};

function StatCard({ icon, label, value }: StatCardProps) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-6 text-card-foreground shadow-sm">
      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
        {icon}
      </div>
      <div>
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <h3 className="text-2xl font-bold text-card-foreground">{value}</h3>
      </div>
    </div>
  );
}

export function Dashboard() {
  const navigate = useNavigate();
  const { activeCompany } = useWorkspace();
  const [roleFilter, setRoleFilter] = useState<CompanyRole>('member');
  const [dashboard, setDashboard] = useState<DashboardSummary>(EMPTY_DASHBOARD_SUMMARY);
  const [isLoading, setIsLoading] = useState(true);
  const canFilterInvoicesByRole = activeCompany?.permissions.canManageMembers ?? false;
  const activeRole = activeCompany?.membershipRole ?? 'member';

  useEffect(() => {
    setRoleFilter(activeRole);
  }, [activeCompany?.id, activeRole]);

  useEffect(() => {
    let isCancelled = false;
    const cacheKey = activeCompany ? `${activeCompany.id}:${roleFilter}` : null;

    const fetchDashboard = async () => {
      const cachedDashboard = cacheKey ? dashboardCache.get(cacheKey) : undefined;

      if (cachedDashboard) {
        setDashboard(cachedDashboard);
        setIsLoading(false);
      } else {
        setIsLoading(true);
      }

      try {
        const query = canFilterInvoicesByRole
          ? `?roleFilter=${encodeURIComponent(roleFilter)}`
          : '';
        const data = await apiRequest<DashboardSummary>(`/api/dashboard${query}`);
        if (isCancelled) {
          return;
        }

        if (cacheKey) {
          dashboardCache.set(cacheKey, data);
        }
        setDashboard(data);
      } catch (error) {
        if (isCancelled) {
          return;
        }

        console.error('Error fetching dashboard:', error);
        toast.error('Failed to load dashboard data');
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    if (!activeCompany) {
      setDashboard(EMPTY_DASHBOARD_SUMMARY);
      setIsLoading(false);
      return () => {
        isCancelled = true;
      };
    }

    void fetchDashboard();

    return () => {
      isCancelled = true;
    };
  }, [activeCompany?.id, canFilterInvoicesByRole, roleFilter]);

  return (
    <div className="min-h-screen bg-background text-foreground pb-24 sm:pb-0">
      <AppHeader />

      <main className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
        <section>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {activeCompany ? activeCompany.name : 'Workspace overview'}
          </h1>
          <p className="mt-1 text-muted-foreground">
            Here&apos;s an overview of the invoicing activity in your active company workspace.
          </p>
          {canFilterInvoicesByRole ? (
            <div className="mt-4 flex flex-col gap-3">
              <div className="flex flex-wrap gap-2">
                {DASHBOARD_ROLE_FILTERS.map((availableRole) => {
                  const isActive = roleFilter === availableRole;

                  return (
                    <button
                      key={availableRole}
                      type="button"
                      onClick={() => setRoleFilter(availableRole)}
                      className={`inline-flex items-center rounded-full border px-3 py-2 text-sm font-medium transition ${
                        isActive
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border bg-card text-card-foreground hover:bg-muted'
                      }`}
                    >
                      {getCompanyRoleLabel(availableRole)}
                    </button>
                  );
                })}
              </div>
              <p className="text-sm text-muted-foreground">
                {roleFilter === activeRole
                  ? `Showing your ${getCompanyRoleLabel(roleFilter).toLowerCase()} invoices by default.`
                  : `Showing invoices created by ${getCompanyRoleLabel(roleFilter).toLowerCase()} members in this workspace.`}
              </p>
            </div>
          ) : null}
        </section>

        <section className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <StatCard
            icon={<DollarSign className="h-6 w-6" />}
            label="Total Revenue"
            value={formatCurrency(dashboard.totalRevenue)}
          />
          <StatCard
            icon={<FileText className="h-6 w-6" />}
            label="Total Invoices"
            value={dashboard.totalInvoices}
          />
          <StatCard
            icon={<Users className="h-6 w-6" />}
            label="Unique Clients"
            value={dashboard.uniqueClients}
          />
        </section>

        <section className="overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-sm">
          <div className="flex items-center justify-between border-b border-border p-6">
            <h2 className="text-lg font-bold text-card-foreground">Recent Invoices</h2>
            <Button variant="ghost" onClick={() => navigate('/invoices')}>
              View All
            </Button>
          </div>

          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading...</div>
          ) : dashboard.recentInvoices.length === 0 ? (
            <div className="flex flex-col items-center p-12 text-center">
              <FileText className="mb-3 h-8 w-8 text-muted-foreground" />
              <p className="mb-4 text-muted-foreground">No invoices created yet.</p>
              <Button onClick={() => navigate('/invoices/new')}>Create First Invoice</Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border bg-muted/40">
                  <tr>
                    <th className="px-6 py-4 font-medium text-muted-foreground">Invoice No</th>
                    <th className="px-6 py-4 font-medium text-muted-foreground">Client</th>
                    <th className="px-6 py-4 font-medium text-muted-foreground">Issue Date</th>
                    <th className="px-6 py-4 text-right font-medium text-muted-foreground">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {dashboard.recentInvoices.map((invoice) => (
                    <tr
                      key={invoice.id}
                      className="cursor-pointer bg-card transition-colors hover:bg-muted/40"
                      onClick={() => navigate(`/invoice/${invoice.id}/preview`)}
                    >
                      <td className="px-6 py-4 font-medium text-card-foreground">{invoice.invoiceNo}</td>
                      <td className="px-6 py-4 text-muted-foreground">{invoice.clientCompanyName}</td>
                      <td className="px-6 py-4 text-muted-foreground">
                        {invoice.issueDate ? format(new Date(invoice.issueDate), 'MMM dd, yyyy') : '-'}
                      </td>
                      <td className="px-6 py-4 text-right font-medium text-card-foreground">
                        {formatCurrency(invoice.totalAmount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
