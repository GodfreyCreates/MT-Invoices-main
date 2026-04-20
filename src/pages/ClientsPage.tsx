import React, { startTransition, useDeferredValue, useEffect, useMemo, useState } from 'react';
import {
  Briefcase,
  FileText,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { AppHeader } from '../components/layout/AppHeader';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Label } from '../components/ui/Label';
import { useConfirmation } from '../components/ui/ConfirmationProvider';
import { apiRequest } from '../lib/api';
import { useWorkspace } from '../lib/workspace';
import type { SavedClientData } from '../store/useInvoiceStore';
import { toast } from 'sonner';

type ClientRecord = SavedClientData & {
  invoiceCount: number;
  lastInvoiceAt: string | null;
};

type ClientFormValues = {
  clientCompanyName: string;
  clientEmail: string;
  clientPhone: string;
  clientStreet: string;
  clientHouseNumber: string;
  clientCity: string;
  clientPostalCode: string;
};

const emptyClientForm: ClientFormValues = {
  clientCompanyName: '',
  clientEmail: '',
  clientPhone: '',
  clientStreet: '',
  clientHouseNumber: '',
  clientCity: '',
  clientPostalCode: '',
};

const dateFormatter = new Intl.DateTimeFormat('en-ZA', {
  dateStyle: 'medium',
});

function formatDate(value: string | null, fallback = 'Never') {
  if (!value) {
    return fallback;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : dateFormatter.format(parsed);
}

function mapClientToFormValues(client: ClientRecord | null): ClientFormValues {
  if (!client) {
    return emptyClientForm;
  }

  return {
    clientCompanyName: client.clientCompanyName,
    clientEmail: client.clientEmail,
    clientPhone: client.clientPhone,
    clientStreet: client.clientStreet,
    clientHouseNumber: client.clientHouseNumber,
    clientCity: client.clientCity,
    clientPostalCode: client.clientPostalCode,
  };
}

function ClientEditorDialog({
  client,
  form,
  isSubmitting,
  onChange,
  onClose,
  onSubmit,
}: {
  client: ClientRecord | null;
  form: ClientFormValues;
  isSubmitting: boolean;
  onChange: <K extends keyof ClientFormValues>(field: K, value: ClientFormValues[K]) => void;
  onClose: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  const isEditing = Boolean(client);

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center p-0 sm:items-center sm:p-4">
      <button
        type="button"
        aria-label="Close client editor"
        className="absolute inset-0 bg-foreground/20 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative z-10 flex max-h-[min(100vh-0.75rem,48rem)] w-full max-w-2xl flex-col overflow-hidden rounded-t-[32px] border border-border bg-card text-card-foreground shadow-2xl sm:max-h-[min(100vh-2rem,48rem)] sm:rounded-[32px]">
        <div className="flex items-start justify-between gap-4 border-b border-border bg-muted/30 px-5 py-5 sm:px-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Clients
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-card-foreground">
              {isEditing ? 'Edit client' : 'Add client'}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {isEditing
                ? 'Update the saved client details used across future invoices.'
                : 'Create a reusable client profile for this company workspace.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-border bg-background p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form className="flex-1 overflow-y-auto px-5 py-5 sm:px-6" onSubmit={onSubmit}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label className="text-foreground">Company name</Label>
              <Input
                value={form.clientCompanyName}
                onChange={(event) => onChange('clientCompanyName', event.target.value)}
                className="border-input bg-background text-foreground"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-foreground">Email</Label>
              <Input
                value={form.clientEmail}
                onChange={(event) => onChange('clientEmail', event.target.value)}
                className="border-input bg-background text-foreground"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-foreground">Phone</Label>
              <Input
                value={form.clientPhone}
                onChange={(event) => onChange('clientPhone', event.target.value)}
                className="border-input bg-background text-foreground"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label className="text-foreground">Street address</Label>
              <Input
                value={form.clientStreet}
                onChange={(event) => onChange('clientStreet', event.target.value)}
                className="border-input bg-background text-foreground"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-foreground">House or suite</Label>
              <Input
                value={form.clientHouseNumber}
                onChange={(event) => onChange('clientHouseNumber', event.target.value)}
                className="border-input bg-background text-foreground"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-foreground">City</Label>
              <Input
                value={form.clientCity}
                onChange={(event) => onChange('clientCity', event.target.value)}
                className="border-input bg-background text-foreground"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-foreground">Postal code</Label>
              <Input
                value={form.clientPostalCode}
                onChange={(event) => onChange('clientPostalCode', event.target.value)}
                className="border-input bg-background text-foreground"
              />
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="h-11 rounded-2xl border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting} className="h-11 rounded-2xl px-5">
              {isSubmitting ? 'Saving...' : isEditing ? 'Save changes' : 'Create client'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function ClientsPage() {
  const workspace = useWorkspace();
  const confirm = useConfirmation();
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClient, setSelectedClient] = useState<ClientRecord | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [form, setForm] = useState<ClientFormValues>(emptyClientForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const deferredSearchQuery = useDeferredValue(searchQuery);

  const loadClients = React.useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    if (mode === 'refresh') {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    try {
      const response = await apiRequest<ClientRecord[]>('/api/clients');
      startTransition(() => {
        setClients(response);
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load clients');
    } finally {
      if (mode === 'refresh') {
        setIsRefreshing(false);
      } else {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadClients();
  }, [loadClients, workspace.activeCompany?.id]);

  const filteredClients = useMemo(() => {
    const normalizedQuery = deferredSearchQuery.trim().toLowerCase();
    if (!normalizedQuery) {
      return clients;
    }

    return clients.filter((client) =>
      [
        client.clientCompanyName,
        client.clientEmail,
        client.clientPhone,
        client.clientCity,
      ]
        .join(' ')
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [clients, deferredSearchQuery]);

  const stats = useMemo(() => {
    const totalClients = clients.length;
    const totalLinkedInvoices = clients.reduce((sum, client) => sum + client.invoiceCount, 0);
    const activeClients = clients.filter((client) => client.invoiceCount > 0).length;
    const mostUsedClient = clients[0] ?? null;

    return {
      totalClients,
      totalLinkedInvoices,
      activeClients,
      mostUsedClient,
    };
  }, [clients]);

  const openCreateDialog = () => {
    setSelectedClient(null);
    setForm(emptyClientForm);
    setIsCreateOpen(true);
  };

  const openEditDialog = (client: ClientRecord) => {
    setSelectedClient(client);
    setForm(mapClientToFormValues(client));
    setIsCreateOpen(true);
  };

  const closeDialog = () => {
    setIsCreateOpen(false);
    setSelectedClient(null);
    setForm(emptyClientForm);
  };

  const handleFormChange = <K extends keyof ClientFormValues>(
    field: K,
    value: ClientFormValues[K],
  ) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);

    try {
      const endpoint = selectedClient ? `/api/clients/${selectedClient.id}` : '/api/clients';
      const method = selectedClient ? 'PATCH' : 'POST';
      const response = await apiRequest<ClientRecord>(endpoint, {
        method,
        body: JSON.stringify(form),
      });

      setClients((currentClients) => {
        const remainingClients = currentClients.filter((client) => client.id !== response.id);
        return selectedClient ? [response, ...remainingClients] : [response, ...remainingClients];
      });
      toast.success(selectedClient ? 'Client updated successfully' : 'Client created successfully');
      closeDialog();
      await loadClients('refresh');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save client');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = (client: ClientRecord) => {
    void (async () => {
      const confirmed = await confirm({
        title: 'Delete client',
        description: `Delete ${client.clientCompanyName}? Existing invoices will remain, but this saved client will no longer be reusable.`,
        confirmLabel: 'Delete',
        variant: 'destructive',
      });

      if (!confirmed) {
        return;
      }

      try {
        await apiRequest<void>(`/api/clients/${client.id}`, { method: 'DELETE' });
        setClients((currentClients) =>
          currentClients.filter((currentClient) => currentClient.id !== client.id),
        );
        toast.success('Client deleted successfully');
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to delete client');
      }
    })();
  };

  return (
    <div className="min-h-screen bg-background pb-24 sm:pb-10">
      <AppHeader showCreateInvoice={workspace.companies.length > 0} />

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <section className="rounded-[32px] border border-border bg-card p-6 text-card-foreground shadow-sm sm:p-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-border bg-muted px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                <Briefcase className="h-3.5 w-3.5" />
                Clients
              </p>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight text-card-foreground">
                Client directory
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                Manage reusable clients for {workspace.activeCompany?.name ?? 'your active company'}.
                Records are ranked from most used to least used so your highest-value clients stay visible.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button
                variant="outline"
                onClick={() => void loadClients('refresh')}
                className="h-11 rounded-2xl border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground"
              >
                <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Button onClick={openCreateDialog} className="h-11 rounded-2xl px-4">
                <Plus className="mr-2 h-4 w-4" />
                Add client
              </Button>
            </div>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-[28px] border border-border bg-background p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Total clients
              </p>
              <p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">
                {stats.totalClients}
              </p>
            </div>
            <div className="rounded-[28px] border border-border bg-background p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Active clients
              </p>
              <p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">
                {stats.activeClients}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">Used at least once on an invoice</p>
            </div>
            <div className="rounded-[28px] border border-border bg-background p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Linked invoices
              </p>
              <p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">
                {stats.totalLinkedInvoices}
              </p>
            </div>
            <div className="rounded-[28px] border border-border bg-background p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Most used client
              </p>
              <p className="mt-3 truncate text-lg font-semibold tracking-tight text-foreground">
                {stats.mostUsedClient?.clientCompanyName ?? 'No clients yet'}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {stats.mostUsedClient ? `${stats.mostUsedClient.invoiceCount} invoices` : 'Start by saving a client'}
              </p>
            </div>
          </div>

          <div className="mt-8 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative w-full max-w-xl">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search by company, email, phone, or city..."
                className="h-12 rounded-2xl border-input bg-background pl-11 text-foreground"
              />
            </div>
            <div className="text-sm text-muted-foreground">
              {filteredClients.length} client{filteredClients.length === 1 ? '' : 's'} visible
            </div>
          </div>

          {isLoading ? (
            <div className="mt-8 rounded-[28px] border border-border bg-background px-6 py-12 text-center text-muted-foreground">
              Loading clients...
            </div>
          ) : filteredClients.length === 0 ? (
            <div className="mt-8 rounded-[28px] border border-dashed border-border bg-background px-6 py-12 text-center">
              <Briefcase className="mx-auto h-10 w-10 text-muted-foreground" />
              <h2 className="mt-4 text-xl font-semibold text-foreground">
                {clients.length === 0 ? 'No saved clients yet' : 'No clients match this search'}
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {clients.length === 0
                  ? 'Save clients from invoices or create one directly here to reuse them across future work.'
                  : 'Adjust the search or clear it to see the full client directory again.'}
              </p>
            </div>
          ) : (
            <>
              <div className="mt-8 hidden overflow-x-auto lg:block">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-border text-muted-foreground">
                    <tr>
                      <th className="px-5 py-4 font-medium">Client</th>
                      <th className="px-5 py-4 font-medium">Usage</th>
                      <th className="px-5 py-4 font-medium">Last invoice</th>
                      <th className="px-5 py-4 font-medium">Address</th>
                      <th className="px-5 py-4 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredClients.map((client) => (
                      <tr key={client.id} className="transition-colors hover:bg-muted/40">
                        <td className="px-5 py-5">
                          <div className="space-y-1">
                            <p className="font-semibold text-foreground">{client.clientCompanyName}</p>
                            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                              <span className="inline-flex items-center gap-2">
                                <Mail className="h-4 w-4" />
                                {client.clientEmail}
                              </span>
                              <span className="inline-flex items-center gap-2">
                                <Phone className="h-4 w-4" />
                                {client.clientPhone}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-5">
                          <div>
                            <p className="text-lg font-semibold text-foreground">{client.invoiceCount}</p>
                            <p className="text-sm text-muted-foreground">
                              invoice{client.invoiceCount === 1 ? '' : 's'}
                            </p>
                          </div>
                        </td>
                        <td className="px-5 py-5 text-muted-foreground">
                          <div>
                            <p>{formatDate(client.lastInvoiceAt)}</p>
                            <p className="text-xs">Last synced {formatDate(client.lastUsedAt)}</p>
                          </div>
                        </td>
                        <td className="px-5 py-5 text-muted-foreground">
                          <div className="inline-flex items-start gap-2">
                            <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                            <span>
                              {client.clientStreet} {client.clientHouseNumber}, {client.clientCity},{' '}
                              {client.clientPostalCode}
                            </span>
                          </div>
                        </td>
                        <td className="px-5 py-5">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="outline"
                              onClick={() => openEditDialog(client)}
                              className="h-10 rounded-2xl border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground"
                            >
                              <Pencil className="mr-2 h-4 w-4" />
                              Edit
                            </Button>
                            <Button
                              variant="destructive"
                              onClick={() => handleDelete(client)}
                              className="h-10 rounded-2xl"
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-8 grid gap-4 lg:hidden">
                {filteredClients.map((client) => (
                  <article
                    key={client.id}
                    className="rounded-[28px] border border-border bg-background p-5"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <h2 className="truncate text-lg font-semibold text-foreground">
                          {client.clientCompanyName}
                        </h2>
                        <p className="mt-1 text-sm text-muted-foreground">{client.clientEmail}</p>
                      </div>
                      <div className="rounded-full border border-border bg-muted px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                        {client.invoiceCount} used
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3">
                      <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                        <Phone className="h-4 w-4" />
                        {client.clientPhone}
                      </div>
                      <div className="inline-flex items-start gap-2 text-sm text-muted-foreground">
                        <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>
                          {client.clientStreet} {client.clientHouseNumber}, {client.clientCity},{' '}
                          {client.clientPostalCode}
                        </span>
                      </div>
                      <div className="rounded-2xl border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
                        Last invoice: {formatDate(client.lastInvoiceAt)}
                      </div>
                    </div>

                    <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                      <Button
                        variant="outline"
                        onClick={() => openEditDialog(client)}
                        className="h-10 rounded-2xl border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground"
                      >
                        <Pencil className="mr-2 h-4 w-4" />
                        Edit
                      </Button>
                      <Button variant="destructive" onClick={() => handleDelete(client)} className="h-10 rounded-2xl">
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </Button>
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}
        </section>
      </main>

      {isCreateOpen ? (
        <ClientEditorDialog
          client={selectedClient}
          form={form}
          isSubmitting={isSubmitting}
          onChange={handleFormChange}
          onClose={closeDialog}
          onSubmit={handleSubmit}
        />
      ) : null}
    </div>
  );
}
