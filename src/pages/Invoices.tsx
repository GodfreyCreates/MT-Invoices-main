import React, { startTransition, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { Download, Edit, Eye, FileText, Loader2, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { AppHeader } from '../components/layout/AppHeader';
import { Button } from '../components/ui/Button';
import { useConfirmation } from '../components/ui/ConfirmationProvider';
import { apiRequest } from '../lib/api';
import { type CompanyRole, getCompanyRoleLabel } from '../lib/company';
import { downloadInvoicePdf, downloadInvoicesPdf } from '../lib/invoice-pdf';
import { cn } from '../lib/utils';
import { useWorkspace } from '../lib/workspace';
import { type InvoiceData, useInvoiceStore } from '../store/useInvoiceStore';

type InvoiceListItem = Pick<
  InvoiceData,
  'clientCompanyName' | 'dueDate' | 'invoiceNo' | 'issueDate'
> & {
  id: string;
};

type InvoiceListResponse = {
  appliedRoleFilter: CompanyRole;
  invoices: InvoiceListItem[];
};

const INVOICE_ROLE_FILTERS: CompanyRole[] = ['owner', 'admin', 'member'];
const invoiceListCache = new Map<string, InvoiceListResponse>();

export function Invoices() {
  const navigate = useNavigate();
  const confirm = useConfirmation();
  const setInvoiceData = useInvoiceStore((state) => state.setInvoiceData);
  const { activeCompany } = useWorkspace();
  const [invoices, setInvoices] = useState<InvoiceListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [downloadingIds, setDownloadingIds] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isBulkDownloading, setIsBulkDownloading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null);
  const [roleFilter, setRoleFilter] = useState<CompanyRole>('member');
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const canFilterInvoicesByRole = activeCompany?.permissions.canManageMembers ?? false;
  const activeRole = activeCompany?.membershipRole ?? 'member';

  useEffect(() => {
    setRoleFilter(activeRole);
  }, [activeCompany?.id, activeRole]);

  useEffect(() => {
    let isCancelled = false;
    const cacheKey = activeCompany ? `${activeCompany.id}:${roleFilter}` : null;

    const fetchInvoices = async () => {
      const cachedInvoices = cacheKey ? invoiceListCache.get(cacheKey) : undefined;

      if (cachedInvoices) {
        startTransition(() => {
          setInvoices(cachedInvoices.invoices);
          setSelectedIds((currentSelectedIds) => {
            if (currentSelectedIds.length === 0) {
              return currentSelectedIds;
            }

            const availableIds = new Set(cachedInvoices.invoices.map((invoice) => invoice.id));
            return currentSelectedIds.filter((invoiceId) => availableIds.has(invoiceId));
          });
        });
        setIsLoading(false);
      } else {
        setIsLoading(true);
      }

      try {
        const query = canFilterInvoicesByRole
          ? `?roleFilter=${encodeURIComponent(roleFilter)}`
          : '';
        const data = await apiRequest<InvoiceListResponse>(`/api/invoices${query}`);
        if (isCancelled) {
          return;
        }

        if (cacheKey) {
          invoiceListCache.set(cacheKey, data);
        }
        startTransition(() => {
          setInvoices(data.invoices);
          setRoleFilter(data.appliedRoleFilter);
          setSelectedIds((currentSelectedIds) => {
            if (currentSelectedIds.length === 0) {
              return currentSelectedIds;
            }

            const availableIds = new Set(data.invoices.map((invoice) => invoice.id));
            return currentSelectedIds.filter((invoiceId) => availableIds.has(invoiceId));
          });
        });
      } catch (error) {
        if (isCancelled) {
          return;
        }

        console.error('Error fetching invoices:', error);
        toast.error('Failed to load invoices');
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    if (!activeCompany) {
      setInvoices([]);
      setSelectedIds([]);
      setIsLoading(false);
      return () => {
        isCancelled = true;
      };
    }

    void fetchInvoices();

    return () => {
      isCancelled = true;
    };
  }, [activeCompany?.id, canFilterInvoicesByRole, roleFilter]);

  const filteredInvoices = useMemo(() => {
    const normalizedQuery = deferredSearchQuery.trim().toLowerCase();
    if (!normalizedQuery) {
      return invoices;
    }

    return invoices.filter((invoice) => {
      return (
        (invoice.invoiceNo || '').toLowerCase().includes(normalizedQuery) ||
        (invoice.clientCompanyName || '').toLowerCase().includes(normalizedQuery) ||
        (invoice.issueDate || '').toLowerCase().includes(normalizedQuery)
      );
    });
  }, [deferredSearchQuery, invoices]);

  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const filteredInvoiceIds = useMemo(
    () => filteredInvoices.map((invoice) => invoice.id),
    [filteredInvoices],
  );
  const allFilteredInvoicesSelected =
    filteredInvoiceIds.length > 0 &&
    filteredInvoiceIds.every((invoiceId) => selectedIdSet.has(invoiceId));

  const handleSelectAll = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.checked) {
      setSelectedIds(filteredInvoiceIds);
      return;
    }

    setSelectedIds([]);
  };

  const handleSelect = (invoiceId: string) => {
    setSelectedIds((currentSelectedIds) =>
      currentSelectedIds.includes(invoiceId)
        ? currentSelectedIds.filter((selectedId) => selectedId !== invoiceId)
        : [...currentSelectedIds, invoiceId],
    );
  };

  const handleBulkDelete = async () => {
    const selectedIdsSnapshot = [...selectedIds];
    if (selectedIdsSnapshot.length === 0) {
      return;
    }

    const confirmed = await confirm({
      title: selectedIdsSnapshot.length === 1 ? 'Delete invoice' : 'Delete invoices',
      description: `Delete ${selectedIdsSnapshot.length} ${
        selectedIdsSnapshot.length === 1 ? 'invoice' : 'invoices'
      }? This action cannot be undone.`,
      confirmLabel: 'Delete',
      variant: 'destructive',
    });

    if (!confirmed) {
      return;
    }

    const selectedIdsSnapshotSet = new Set(selectedIdsSnapshot);
    const results = await Promise.allSettled(
      selectedIdsSnapshot.map((invoiceId) =>
        apiRequest<void>(`/api/invoices/${invoiceId}`, { method: 'DELETE' }),
      ),
    );
    const failedCount = results.filter((result) => result.status === 'rejected').length;

    if (failedCount === 0) {
      setInvoices((currentInvoices) =>
        currentInvoices.filter((invoice) => !selectedIdsSnapshotSet.has(invoice.id)),
      );
      setSelectedIds([]);
      toast.success(`${selectedIdsSnapshot.length} invoices deleted`);
      return;
    }

    console.error('Error deleting invoices:', results);
    setSelectedIds([]);
    toast.error(
      `${failedCount} invoice ${failedCount === 1 ? 'was' : 'were'} not deleted`,
    );
  };

  const handleBulkDownload = async () => {
    const downloadToastId = toast.loading('Preparing invoice download...');
    setIsBulkDownloading(true);
    setDownloadingIds([...selectedIds]);

    try {
      const selectedInvoices = invoices.filter((invoice) => selectedIdSet.has(invoice.id));
      await downloadInvoicesPdf(
        selectedInvoices,
        `Bulk_Invoices_${format(new Date(), 'yyyyMMdd')}.pdf`,
      );
      toast.success('Bulk download complete', { id: downloadToastId });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to download invoices', {
        id: downloadToastId,
      });
    } finally {
      setDownloadingIds([]);
      setIsBulkDownloading(false);
    }
  };

  const handleEdit = async (invoiceId: string) => {
    setEditingInvoiceId(invoiceId);

    try {
      const invoice = await apiRequest<InvoiceData & { id: string }>(`/api/invoices/${invoiceId}`);
      startTransition(() => {
        setInvoiceData(invoice);
        navigate('/invoices/new');
      });
    } catch (error) {
      console.error('Error loading invoice for edit:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to load invoice');
    } finally {
      setEditingInvoiceId(null);
    }
  };

  const handleDelete = (invoiceId: string) => {
    void (async () => {
      const confirmed = await confirm({
        title: 'Delete invoice',
        description: 'Delete this invoice? This action cannot be undone.',
        confirmLabel: 'Delete',
        variant: 'destructive',
      });

      if (!confirmed) {
        return;
      }

      try {
        await apiRequest<void>(`/api/invoices/${invoiceId}`, {
          method: 'DELETE',
        });
        setInvoices((currentInvoices) =>
          currentInvoices.filter((invoice) => invoice.id !== invoiceId),
        );
        setSelectedIds((currentSelectedIds) =>
          currentSelectedIds.filter((selectedId) => selectedId !== invoiceId),
        );
        toast.success('Invoice deleted successfully');
      } catch (error) {
        console.error('Error deleting invoice:', error);
        toast.error('Failed to delete invoice');
      }
    })();
  };

  const handleDownload = async (invoice: InvoiceListItem) => {
    const downloadToastId = toast.loading(`Preparing ${invoice.invoiceNo}...`);
    setDownloadingIds((currentDownloadingIds) =>
      currentDownloadingIds.includes(invoice.id)
        ? currentDownloadingIds
        : [...currentDownloadingIds, invoice.id],
    );

    try {
      await downloadInvoicePdf(invoice, `Invoice_${invoice.invoiceNo}.pdf`);
      toast.success('Invoice downloaded successfully', { id: downloadToastId });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to download invoice', {
        id: downloadToastId,
      });
    } finally {
      setDownloadingIds((currentDownloadingIds) =>
        currentDownloadingIds.filter((downloadingId) => downloadingId !== invoice.id),
      );
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground pb-24 sm:pb-0">
      <AppHeader />

      <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
        <section className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-2xl">
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">Invoices</h1>
            <p className="mt-2 text-sm text-muted-foreground sm:text-base">
              Search, review, download, and manage every invoice in{' '}
              {activeCompany?.name ?? 'your active company'}.
            </p>
            {canFilterInvoicesByRole ? (
              <div className="mt-4 flex flex-col gap-3">
                <div className="flex flex-wrap gap-2">
                  {INVOICE_ROLE_FILTERS.map((availableRole) => {
                    const isActive = roleFilter === availableRole;

                    return (
                      <button
                        key={availableRole}
                        type="button"
                        onClick={() => setRoleFilter(availableRole)}
                        className={cn(
                          'inline-flex items-center rounded-full border px-3 py-2 text-sm font-medium transition',
                          isActive
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border bg-card text-card-foreground hover:bg-muted',
                        )}
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
          </div>

          <div className="flex w-full flex-col gap-3 xl:max-w-3xl xl:flex-row xl:items-center xl:justify-end">
            <label className="relative block w-full xl:max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search by invoice number, client, or date..."
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="h-10 w-full rounded-lg border border-input bg-background pl-9 pr-4 text-sm text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>

            {selectedIds.length > 0 ? (
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap xl:justify-end">
                <span className="inline-flex items-center rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-card-foreground">
                  {selectedIds.length} selected
                </span>
                <Button
                  variant="outline"
                  onClick={() => void handleBulkDownload()}
                  disabled={isBulkDownloading}
                  className="gap-2"
                >
                  <Download className="h-4 w-4" />
                  {isBulkDownloading ? 'Downloading...' : 'Download Selected'}
                </Button>
                <Button variant="destructive" onClick={() => void handleBulkDelete()} className="gap-2">
                  <Trash2 className="h-4 w-4" />
                  Delete Selected
                </Button>
              </div>
            ) : (
              <p className="hidden text-sm text-muted-foreground xl:block">
                Select invoices to download or delete them in bulk.
              </p>
            )}
          </div>
        </section>

        <section className="overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-sm">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading invoices...</div>
          ) : invoices.length === 0 ? (
            <div className="flex flex-col items-center p-12 text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-border bg-muted">
                <FileText className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="mb-2 text-lg font-medium text-card-foreground">No invoices found</h3>
              <p className="mb-6 text-muted-foreground">Create your first invoice to get started.</p>
              <Button onClick={() => navigate('/invoices/new')}>Create Invoice</Button>
            </div>
          ) : filteredInvoices.length === 0 ? (
            <div className="flex flex-col items-center p-12 text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-border bg-muted">
                <Search className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="mb-2 text-lg font-medium text-card-foreground">No results found</h3>
              <p className="text-muted-foreground">No invoices match your search query.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border bg-muted/40">
                  <tr>
                    <th className="w-12 px-6 py-4">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-input bg-background text-primary focus-visible:ring-2 focus-visible:ring-ring"
                        checked={allFilteredInvoicesSelected}
                        onChange={handleSelectAll}
                        aria-label="Select all visible invoices"
                      />
                    </th>
                    <th className="px-6 py-4 font-medium text-muted-foreground">Invoice No</th>
                    <th className="px-6 py-4 font-medium text-muted-foreground">Client</th>
                    <th className="px-6 py-4 font-medium text-muted-foreground">Issue Date</th>
                    <th className="px-6 py-4 font-medium text-muted-foreground">Due Date</th>
                    <th className="px-6 py-4 text-right font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredInvoices.map((invoice) => {
                    const isDownloadingInvoice = downloadingIds.includes(invoice.id);
                    const isEditingInvoice = editingInvoiceId === invoice.id;
                    const isSelected = selectedIdSet.has(invoice.id);

                    return (
                      <tr
                        key={invoice.id}
                        className={cn(
                          'transition-colors hover:bg-muted/40',
                          isSelected ? 'bg-muted/50' : 'bg-card',
                        )}
                      >
                        <td className="px-6 py-4">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-input bg-background text-primary focus-visible:ring-2 focus-visible:ring-ring"
                            checked={isSelected}
                            onChange={() => handleSelect(invoice.id)}
                            aria-label={`Select invoice ${invoice.invoiceNo}`}
                          />
                        </td>
                        <td className="px-6 py-4 font-medium text-card-foreground">{invoice.invoiceNo}</td>
                        <td className="px-6 py-4 text-muted-foreground">{invoice.clientCompanyName}</td>
                        <td className="px-6 py-4 text-muted-foreground">
                          {invoice.issueDate ? format(new Date(invoice.issueDate), 'MMM dd, yyyy') : '-'}
                        </td>
                        <td className="px-6 py-4 text-muted-foreground">
                          {invoice.dueDate ? format(new Date(invoice.dueDate), 'MMM dd, yyyy') : '-'}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-end gap-1 sm:gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => navigate(`/invoice/${invoice.id}/preview`)}
                              title="View preview"
                              aria-label={`Preview invoice ${invoice.invoiceNo}`}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => void handleDownload(invoice)}
                              disabled={isDownloadingInvoice}
                              title="Download PDF"
                              aria-label={`Download invoice ${invoice.invoiceNo} as PDF`}
                            >
                              {isDownloadingInvoice ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Download className="h-4 w-4" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => void handleEdit(invoice.id)}
                              disabled={isEditingInvoice}
                              title="Edit invoice"
                              aria-label={`Edit invoice ${invoice.invoiceNo}`}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDelete(invoice.id)}
                              title="Delete invoice"
                              aria-label={`Delete invoice ${invoice.invoiceNo}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
