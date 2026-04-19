import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { InvoicePreview } from '../components/InvoicePreview';
import { apiRequest } from '../lib/api';
import type { InvoiceData } from '../store/useInvoiceStore';

type StoredInvoice = InvoiceData & { id: string };

function getInvoiceIds(routeId: string | undefined, searchParams: URLSearchParams) {
  if (routeId) {
    return [routeId];
  }

  const rawIds = searchParams.get('ids') ?? '';
  return Array.from(
    new Set(
      rawIds
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  );
}

export function InvoicePrintPage() {
  const { id } = useParams<{ id?: string }>();
  const [searchParams] = useSearchParams();
  const [invoices, setInvoices] = useState<StoredInvoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const searchParamsKey = searchParams.toString();

  const invoiceIds = useMemo(
    () => getInvoiceIds(id, searchParams),
    [id, searchParamsKey],
  );
  const invoiceIdsKey = invoiceIds.join(',');
  const exportToken = useMemo(() => {
    const token = searchParams.get('exportToken')?.trim();
    return token ? token : null;
  }, [searchParamsKey]);

  useEffect(() => {
    const fetchInvoices = async () => {
      if (invoiceIds.length === 0 && !exportToken) {
        setInvoices([]);
        setError('No invoices were selected for PDF generation');
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        if (exportToken) {
          const query = new URLSearchParams({ exportToken });
          const records = await apiRequest<StoredInvoice[]>(
            `/api/invoices/export/render?${query.toString()}`,
          );
          setInvoices(records);
          return;
        }

        const query = new URLSearchParams({ ids: invoiceIds.join(',') });
        const records = await apiRequest<StoredInvoice[]>(`/api/invoices/export?${query.toString()}`);
        setInvoices(records);
      } catch (fetchError) {
        setInvoices([]);
        setError(
          fetchError instanceof Error ? fetchError.message : 'Failed to load invoices for PDF export',
        );
      } finally {
        setIsLoading(false);
      }
    };

    void fetchInvoices();
  }, [exportToken, invoiceIdsKey]);

  useEffect(() => {
    if (isLoading || error || invoices.length === 0) {
      return;
    }

    document.title =
      invoices.length === 1
        ? `Invoice_${invoices[0].invoiceNo || invoices[0].id}`
        : `Invoices_${invoices.length}`;
  }, [error, invoices, isLoading]);

  if (isLoading) {
    return (
      <div
        data-pdf-loading="true"
        className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground"
      >
        Preparing invoice PDF...
      </div>
    );
  }

  if (error) {
    return (
      <div
        data-pdf-error="true"
        className="flex min-h-screen items-center justify-center bg-background px-6 text-center text-sm text-destructive"
      >
        {error}
      </div>
    );
  }

  return (
    <main data-pdf-ready="true" className="min-h-screen bg-background text-foreground">
      <style>{`
        @page {
          size: A4;
          margin: 0;
        }

        html, body {
          margin: 0;
          padding: 0;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
      `}</style>

      {invoices.map((invoice, index) => (
        <section
          key={invoice.id}
          style={index < invoices.length - 1 ? { breakAfter: 'page' } : undefined}
        >
          <InvoicePreview invoiceData={invoice} forExport />
        </section>
      ))}
    </main>
  );
}
