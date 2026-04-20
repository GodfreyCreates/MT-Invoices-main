import React from 'react';
import { Copy, Trash2, ChevronDown, Loader2, Plus, Save, UserRoundSearch, X } from 'lucide-react';
import { toast } from 'sonner';
import { apiRequest } from '../lib/api';
import { invoiceThemes } from '../lib/invoice-themes';
import { useWorkspace } from '../lib/workspace';
import {
  DEFAULT_AUTHORIZED_SIGNATURE,
  type SavedClientData,
  useInvoiceStore,
} from '../store/useInvoiceStore';
import { Button } from './ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/Card';
import { Input } from './ui/Input';
import { Label } from './ui/Label';
import { PopoverSelect, type PopoverSelectOption } from './ui/PopoverSelect';

type InvoiceFormProps = {
  isPreviewVisible?: boolean;
};

function upsertSavedClient(
  clients: SavedClientData[],
  nextClient: SavedClientData,
): SavedClientData[] {
  const existingClients = clients.filter((client) => client.id !== nextClient.id);
  const mergedClients = [nextClient, ...existingClients];

  return mergedClients.sort((left, right) => {
    const leftRank = left.lastUsedAt ?? left.updatedAt;
    const rightRank = right.lastUsedAt ?? right.updatedAt;
    return rightRank.localeCompare(leftRank) || left.clientCompanyName.localeCompare(right.clientCompanyName);
  });
}

export function InvoiceForm({ isPreviewVisible = true }: InvoiceFormProps) {
  const {
    data,
    updateField,
    applySavedClient,
    addService,
    updateService,
    duplicateService,
    removeService,
  } = useInvoiceStore();
  const { activeCompany } = useWorkspace();
  const isInlineServicesLayout = !isPreviewVisible;
  const [isThemePaneOpen, setIsThemePaneOpen] = React.useState(false);
  const [savedClients, setSavedClients] = React.useState<SavedClientData[]>([]);
  const [isLoadingClients, setIsLoadingClients] = React.useState(false);
  const [isSavingClient, setIsSavingClient] = React.useState(false);
  const activeTheme = invoiceThemes.find((theme) => theme.id === data.theme) ?? invoiceThemes[0];

  const serviceFieldClasses = isInlineServicesLayout
    ? {
        description: 'space-y-1 flex-[2_2_160px] min-w-0',
        date: 'space-y-1 flex-[1_1_110px] min-w-0',
        reference: 'space-y-1 flex-[1_1_110px] min-w-0',
        sender: 'space-y-1 flex-[1_1_120px] min-w-0',
        receiver: 'space-y-1 flex-[1_1_120px] min-w-0',
        quantity: 'space-y-1 flex-[0_0_70px] min-w-0',
        unitPrice: 'space-y-1 flex-[0_0_80px] min-w-0',
        discount: 'space-y-1 flex-[0_0_70px] min-w-0',
        tax: 'space-y-1 flex-[0_0_60px] min-w-0',
      }
    : {
        description: 'col-span-12 md:col-span-6 space-y-2',
        date: 'col-span-6 md:col-span-3 space-y-2',
        reference: 'col-span-6 md:col-span-3 space-y-2',
        sender: 'col-span-12 md:col-span-6 space-y-2',
        receiver: 'col-span-12 md:col-span-6 space-y-2',
        quantity: 'col-span-6 md:col-span-3 space-y-2',
        unitPrice: 'col-span-6 md:col-span-3 space-y-2',
        discount: 'col-span-6 md:col-span-3 space-y-2',
        tax: 'col-span-6 md:col-span-3 space-y-2',
      };

  React.useEffect(() => {
    let cancelled = false;

    const loadClients = async () => {
      if (!activeCompany) {
        setSavedClients([]);
        return;
      }

      setIsLoadingClients(true);

      try {
        const response = await apiRequest<SavedClientData[]>('/api/clients');
        if (!cancelled) {
          setSavedClients(response);
        }
      } catch (error) {
        if (!cancelled) {
          setSavedClients([]);
          toast.error(error instanceof Error ? error.message : 'Failed to load saved clients');
        }
      } finally {
        if (!cancelled) {
          setIsLoadingClients(false);
        }
      }
    };

    void loadClients();

    return () => {
      cancelled = true;
    };
  }, [activeCompany?.id]);

  React.useEffect(() => {
    if (data.savedClientId && !savedClients.some((client) => client.id === data.savedClientId)) {
      updateField('savedClientId', null);
    }
  }, [data.savedClientId, savedClients, updateField]);

  const savedClientOptions = React.useMemo<PopoverSelectOption[]>(
    () =>
      savedClients.map((client) => ({
        value: client.id,
        label: client.clientCompanyName,
        description: [client.clientEmail, client.clientPhone].filter(Boolean).join(' • '),
      })),
    [savedClients],
  );

  const selectedSavedClient = React.useMemo(
    () => savedClients.find((client) => client.id === data.savedClientId) ?? null,
    [data.savedClientId, savedClients],
  );

  const handleSavedClientSelect = React.useCallback(
    (clientId: string) => {
      const client = savedClients.find((candidate) => candidate.id === clientId);
      if (!client) {
        return;
      }

      applySavedClient(client);
      toast.success(`Loaded ${client.clientCompanyName}`);
    },
    [applySavedClient, savedClients],
  );

  const handleSavedClientClear = React.useCallback(() => {
    updateField('savedClientId', null);
  }, [updateField]);

  const handleSaveClient = React.useCallback(async () => {
    if (isSavingClient) {
      return;
    }

    setIsSavingClient(true);

    try {
      const savedClient = await apiRequest<SavedClientData>('/api/clients', {
        method: 'POST',
        body: JSON.stringify({
          id: data.savedClientId ?? undefined,
          clientCompanyName: data.clientCompanyName,
          clientEmail: data.clientEmail,
          clientPhone: data.clientPhone,
          clientStreet: data.clientStreet,
          clientHouseNumber: data.clientHouseNumber,
          clientCity: data.clientCity,
          clientPostalCode: data.clientPostalCode,
        }),
      });

      setSavedClients((currentClients) => upsertSavedClient(currentClients, savedClient));
      applySavedClient(savedClient);
      toast.success(
        data.savedClientId ? 'Saved client updated successfully' : 'Client saved for future use',
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save client');
    } finally {
      setIsSavingClient(false);
    }
  }, [
    applySavedClient,
    data.clientCity,
    data.clientCompanyName,
    data.clientEmail,
    data.clientHouseNumber,
    data.clientPhone,
    data.clientPostalCode,
    data.clientStreet,
    data.savedClientId,
    isSavingClient,
  ]);

  return (
    <div className="space-y-6 pb-20">
      <Card className="border-border bg-card text-card-foreground">
        <CardHeader className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <CardTitle>Client Details</CardTitle>
              <p className="text-sm text-muted-foreground">
                Reuse a saved client or capture the current details for future invoices.
              </p>
            </div>
            <div className="rounded-full border border-border bg-muted/50 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
              {activeCompany ? activeCompany.name : 'No active company'}
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto]">
            <div className="space-y-2">
              <Label className="text-foreground">Saved clients</Label>
              <PopoverSelect
                value={data.savedClientId ?? ''}
                onValueChange={handleSavedClientSelect}
                options={savedClientOptions}
                placeholder={isLoadingClients ? 'Loading saved clients...' : 'Select a saved client'}
                emptyMessage={isLoadingClients ? 'Loading saved clients...' : 'No saved clients yet'}
                ariaLabel="Saved clients"
                sameWidth
                triggerClassName="h-11 rounded-xl border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground"
                contentClassName="border-border bg-popover text-popover-foreground shadow-lg"
                optionClassName="data-[active=true]:bg-accent data-[active=true]:text-accent-foreground"
                disabled={!activeCompany || isLoadingClients}
              />
            </div>

            <div className="flex items-end">
              <Button
                type="button"
                onClick={handleSaveClient}
                disabled={!activeCompany || isSavingClient}
                className="h-11 w-full gap-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 sm:w-auto"
              >
                {isSavingClient ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                <span>{data.savedClientId ? 'Update client' : 'Save client'}</span>
              </Button>
            </div>

            <div className="flex items-end">
              <Button
                type="button"
                variant="outline"
                onClick={handleSavedClientClear}
                disabled={!data.savedClientId}
                className="h-11 w-full gap-2 rounded-xl border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground sm:w-auto"
              >
                <X className="h-4 w-4" />
                <span>Clear link</span>
              </Button>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
            {selectedSavedClient ? (
              <div className="flex flex-wrap items-center gap-2">
                <UserRoundSearch className="h-4 w-4 text-foreground" />
                <span className="font-medium text-foreground">{selectedSavedClient.clientCompanyName}</span>
                <span>is linked to this invoice and will be kept in sync when you save the invoice.</span>
              </div>
            ) : (
              <span>Pick a saved client to fill these fields instantly, or save the current details as a reusable client.</span>
            )}
          </div>
        </CardHeader>

        <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label className="text-foreground">Company Name</Label>
            <Input
              value={data.clientCompanyName}
              onChange={(event) => updateField('clientCompanyName', event.target.value)}
              className="border-input bg-background text-foreground placeholder:text-muted-foreground focus-visible:ring-ring"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-foreground">Email</Label>
            <Input
              value={data.clientEmail}
              onChange={(event) => updateField('clientEmail', event.target.value)}
              className="border-input bg-background text-foreground placeholder:text-muted-foreground focus-visible:ring-ring"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-foreground">Phone</Label>
            <Input
              value={data.clientPhone}
              onChange={(event) => updateField('clientPhone', event.target.value)}
              className="border-input bg-background text-foreground placeholder:text-muted-foreground focus-visible:ring-ring"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-foreground">Invoice No</Label>
            <Input
              value={data.invoiceNo}
              onChange={(event) => updateField('invoiceNo', event.target.value)}
              className="border-input bg-background text-foreground placeholder:text-muted-foreground focus-visible:ring-ring"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-foreground">Street Address</Label>
            <Input
              value={data.clientStreet}
              onChange={(event) => updateField('clientStreet', event.target.value)}
              className="border-input bg-background text-foreground placeholder:text-muted-foreground focus-visible:ring-ring"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-foreground">House/Apt Number</Label>
            <Input
              value={data.clientHouseNumber}
              onChange={(event) => updateField('clientHouseNumber', event.target.value)}
              className="border-input bg-background text-foreground placeholder:text-muted-foreground focus-visible:ring-ring"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-foreground">City</Label>
            <Input
              value={data.clientCity}
              onChange={(event) => updateField('clientCity', event.target.value)}
              className="border-input bg-background text-foreground placeholder:text-muted-foreground focus-visible:ring-ring"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-foreground">Postal Code</Label>
            <Input
              value={data.clientPostalCode}
              onChange={(event) => updateField('clientPostalCode', event.target.value)}
              className="border-input bg-background text-foreground placeholder:text-muted-foreground focus-visible:ring-ring"
            />
          </div>
        </CardContent>
      </Card>

      <Card className="border-border bg-card text-card-foreground">
        <CardHeader>
          <CardTitle>Invoice Details</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label className="text-foreground">Issue Date</Label>
            <Input
              type="date"
              value={data.issueDate}
              onChange={(event) => updateField('issueDate', event.target.value)}
              className="border-input bg-background text-foreground focus-visible:ring-ring"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-foreground">Due Date</Label>
            <Input
              type="date"
              value={data.dueDate}
              onChange={(event) => updateField('dueDate', event.target.value)}
              className="border-input bg-background text-foreground focus-visible:ring-ring"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-foreground">Payment Terms</Label>
            <Input
              value={data.paymentTerms}
              onChange={(event) => updateField('paymentTerms', event.target.value)}
              className="border-input bg-background text-foreground placeholder:text-muted-foreground focus-visible:ring-ring"
            />
          </div>
          <div className="space-y-3 md:col-span-3">
            <button
              type="button"
              onClick={() => setIsThemePaneOpen((current) => !current)}
              className="flex w-full items-center justify-between rounded-2xl border border-border bg-background px-4 py-3 text-left transition-colors hover:bg-accent hover:text-accent-foreground"
              aria-expanded={isThemePaneOpen}
            >
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Theme
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <span className="font-semibold text-foreground">{activeTheme.name}</span>
                  <span className="rounded-full border border-border bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                    Layout preset
                  </span>
                </div>
              </div>
              <ChevronDown
                className={`h-4 w-4 flex-shrink-0 text-muted-foreground transition-transform ${
                  isThemePaneOpen ? 'rotate-180' : ''
                }`}
              />
            </button>
            {isThemePaneOpen ? (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {invoiceThemes.map((theme) => {
                  const isActive = data.theme === theme.id;

                  return (
                    <button
                      key={theme.id}
                      type="button"
                      onClick={() => updateField('theme', theme.id)}
                      className={`rounded-2xl border p-4 text-left transition-all ${
                        isActive
                          ? 'border-primary bg-accent/40 shadow-sm'
                          : 'border-border bg-card hover:bg-accent/50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-semibold text-foreground">{theme.name}</p>
                        {isActive ? <span className="h-2.5 w-2.5 rounded-full bg-primary" /> : null}
                      </div>
                      <p className="mt-3 text-sm text-muted-foreground">
                        Applies the full invoice presentation preset.
                      </p>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card className="border-border bg-card text-card-foreground">
        <CardHeader>
          <CardTitle>Services</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.services.map((service, index) => (
            <div
              key={service.id}
              className={`group relative rounded-xl border border-border bg-muted/30 transition-all hover:bg-muted/50 ${
                isInlineServicesLayout
                  ? 'flex items-end gap-2 overflow-x-auto px-3 py-2'
                  : 'space-y-4 p-5'
              }`}
            >
              {isInlineServicesLayout ? (
                <>
                  <span className="mt-1 flex h-5 w-5 flex-shrink-0 self-start items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">
                    {index + 1}
                  </span>

                  <div className={serviceFieldClasses.description}>
                    <Label className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Description</Label>
                    <Input value={service.service} onChange={(event) => updateService(service.id, 'service', event.target.value)} className="h-8 border-input bg-background text-foreground" />
                  </div>
                  <div className={serviceFieldClasses.date}>
                    <Label className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Date</Label>
                    <Input type="date" value={service.date} onChange={(event) => updateService(service.id, 'date', event.target.value)} className="h-8 border-input bg-background text-foreground" />
                  </div>
                  <div className={serviceFieldClasses.reference}>
                    <Label className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Ref <span className="text-destructive">*</span></Label>
                    <Input required value={service.reference} onChange={(event) => updateService(service.id, 'reference', event.target.value)} className="h-8 border-input bg-background text-foreground" />
                  </div>
                  <div className={serviceFieldClasses.sender}>
                    <Label className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Sender <span className="text-destructive">*</span></Label>
                    <Input required value={service.sender} onChange={(event) => updateService(service.id, 'sender', event.target.value)} className="h-8 border-input bg-background text-foreground" />
                  </div>
                  <div className={serviceFieldClasses.receiver}>
                    <Label className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Receiver <span className="text-destructive">*</span></Label>
                    <Input required value={service.receiver} onChange={(event) => updateService(service.id, 'receiver', event.target.value)} className="h-8 border-input bg-background text-foreground" />
                  </div>
                  <div className={serviceFieldClasses.quantity}>
                    <Label className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Qty</Label>
                    <Input type="number" min="1" value={service.quantity} onChange={(event) => updateService(service.id, 'quantity', event.target.value === '' ? '' : Number(event.target.value))} className="h-8 border-input bg-background text-foreground" />
                  </div>
                  <div className={serviceFieldClasses.unitPrice}>
                    <Label className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Price <span className="text-destructive">*</span></Label>
                    <Input type="number" min="0" step="0.01" required value={service.unitPrice} onChange={(event) => updateService(service.id, 'unitPrice', event.target.value === '' ? '' : Number(event.target.value))} className="h-8 border-input bg-background text-foreground" />
                  </div>
                  <div className={serviceFieldClasses.discount}>
                    <Label className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Disc%</Label>
                    <Input type="number" min="0" max="100" value={service.discountPercent} onChange={(event) => updateService(service.id, 'discountPercent', event.target.value === '' ? '' : Number(event.target.value))} className="h-8 border-input bg-background text-foreground" />
                  </div>
                  <div className={serviceFieldClasses.tax}>
                    <Label className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Tax%</Label>
                    <Input type="number" min="0" max="100" value={service.taxPercent} onChange={(event) => updateService(service.id, 'taxPercent', event.target.value === '' ? '' : Number(event.target.value))} className="h-8 border-input bg-background text-foreground" />
                  </div>

                  <div className="flex flex-shrink-0 items-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <Button variant="outline" size="sm" className="h-8 w-8 border-border bg-background p-0 text-foreground hover:bg-accent hover:text-accent-foreground" title="Duplicate" onClick={() => duplicateService(service.id)}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="destructive" size="sm" className="h-8 w-8 p-0" title="Remove" onClick={() => removeService(service.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <div className="mb-4 flex flex-col gap-3 border-b border-border pb-3 sm:flex-row sm:items-center sm:justify-between">
                    <h4 className="text-sm font-semibold text-foreground">Service Item {index + 1}</h4>
                    <div className="flex gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                      <Button variant="outline" size="sm" className="h-8 border-border bg-background px-3 text-foreground hover:bg-accent hover:text-accent-foreground" onClick={() => duplicateService(service.id)}>
                        <Copy className="mr-2 h-3.5 w-3.5" /> Duplicate
                      </Button>
                      <Button variant="destructive" size="sm" className="h-8 px-3" onClick={() => removeService(service.id)}>
                        <Trash2 className="mr-2 h-3.5 w-3.5" /> Remove
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-12 gap-x-4 gap-y-5">
                    <div className={serviceFieldClasses.description}>
                      <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Service Description</Label>
                      <Input value={service.service} onChange={(event) => updateService(service.id, 'service', event.target.value)} className="border-input bg-background text-foreground" />
                    </div>
                    <div className={serviceFieldClasses.date}>
                      <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Date</Label>
                      <Input type="date" value={service.date} onChange={(event) => updateService(service.id, 'date', event.target.value)} className="border-input bg-background text-foreground" />
                    </div>
                    <div className={serviceFieldClasses.reference}>
                      <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Reference <span className="text-destructive">*</span></Label>
                      <Input required value={service.reference} onChange={(event) => updateService(service.id, 'reference', event.target.value)} className="border-input bg-background text-foreground" />
                    </div>
                    <div className={serviceFieldClasses.sender}>
                      <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Sender <span className="text-destructive">*</span></Label>
                      <Input required value={service.sender} onChange={(event) => updateService(service.id, 'sender', event.target.value)} className="border-input bg-background text-foreground" />
                    </div>
                    <div className={serviceFieldClasses.receiver}>
                      <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Receiver <span className="text-destructive">*</span></Label>
                      <Input required value={service.receiver} onChange={(event) => updateService(service.id, 'receiver', event.target.value)} className="border-input bg-background text-foreground" />
                    </div>
                    <div className={serviceFieldClasses.quantity}>
                      <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Quantity</Label>
                      <Input type="number" min="1" value={service.quantity} onChange={(event) => updateService(service.id, 'quantity', event.target.value === '' ? '' : Number(event.target.value))} className="border-input bg-background text-foreground" />
                    </div>
                    <div className={serviceFieldClasses.unitPrice}>
                      <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Unit Price <span className="text-destructive">*</span></Label>
                      <Input type="number" min="0" step="0.01" required value={service.unitPrice} onChange={(event) => updateService(service.id, 'unitPrice', event.target.value === '' ? '' : Number(event.target.value))} className="border-input bg-background text-foreground" />
                    </div>
                    <div className={serviceFieldClasses.discount}>
                      <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Discount (%)</Label>
                      <Input type="number" min="0" max="100" value={service.discountPercent} onChange={(event) => updateService(service.id, 'discountPercent', event.target.value === '' ? '' : Number(event.target.value))} className="border-input bg-background text-foreground" />
                    </div>
                    <div className={serviceFieldClasses.tax}>
                      <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tax (%)</Label>
                      <Input type="number" min="0" max="100" value={service.taxPercent} onChange={(event) => updateService(service.id, 'taxPercent', event.target.value === '' ? '' : Number(event.target.value))} className="border-input bg-background text-foreground" />
                    </div>
                  </div>
                </>
              )}
            </div>
          ))}

          <div className="pt-2">
            <Button
              onClick={addService}
              variant="outline"
              className="w-full gap-2 border-2 border-dashed border-border bg-background py-6 text-foreground hover:bg-accent hover:text-accent-foreground"
            >
              <Plus className="h-5 w-5" /> Add Service
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border bg-card text-card-foreground">
        <CardHeader>
          <CardTitle>Additional Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="text-foreground">Notes</Label>
            <textarea
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={data.notes}
              onChange={(event) => updateField('notes', event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label className="text-foreground">Authorized Signature Name</Label>
            <Input
              value={data.authorizedSignature}
              placeholder={DEFAULT_AUTHORIZED_SIGNATURE}
              onChange={(event) => updateField('authorizedSignature', event.target.value)}
              className="h-14 rounded-xl border-border border-dashed bg-muted/40 px-4 font-signature text-3xl tracking-[0.03em] text-foreground shadow-sm"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
