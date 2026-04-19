import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { InvoiceData } from '../store/useInvoiceStore';
import { InvoicePreview } from '../components/InvoicePreview';
import { Button } from '../components/ui/Button';
import { ArrowLeft, Download } from 'lucide-react';
import { AppHeader } from '../components/layout/AppHeader';
import { ApiError, apiRequest } from '../lib/api';
import { downloadInvoicePdf } from '../lib/invoice-pdf';
import { useWorkspace } from '../lib/workspace';
import { toast } from 'sonner';

export function InvoicePreviewPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { activeCompany } = useWorkspace();
  const [invoice, setInvoice] = useState<(InvoiceData & { id: string }) | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchInvoice = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const data = await apiRequest<(InvoiceData & { id: string })>(`/api/invoices/${id}`);
        setInvoice(data);
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          setError('Invoice not found');
          return;
        }
        if (err instanceof Error) {
          setError(err.message);
          return;
        }
        setError('Failed to fetch invoice');
      } finally {
        setIsLoading(false);
      }
    };

    if (id) {
      void fetchInvoice();
    }
  }, [activeCompany?.id, id]);

  const handleDownloadPDF = async () => {
    if (!invoice || isDownloading) return;

    setIsDownloading(true);

    try {
      toast.info('Preparing download...');
      await downloadInvoicePdf(invoice, `Invoice_${invoice.invoiceNo}.pdf`);
      toast.success('Invoice downloaded successfully');
    } catch (downloadError) {
      toast.error(downloadError instanceof Error ? downloadError.message : 'Failed to download invoice');
    } finally {
      setIsDownloading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-100 font-sans pb-24 sm:pb-0">
        <AppHeader />
        <main className="flex min-h-[calc(100vh-5rem)] items-center justify-center px-4">
          <div className="text-gray-500">Loading invoice...</div>
        </main>
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="min-h-screen bg-gray-100 font-sans pb-24 sm:pb-0">
        <AppHeader />
        <main className="flex min-h-[calc(100vh-5rem)] flex-col items-center justify-center gap-4 px-4">
          <div className="text-red-500 text-lg">{error || 'Invoice not found'}</div>
          <Button onClick={() => navigate('/invoices')} variant="outline" className="gap-2">
            <ArrowLeft className="w-4 h-4" /> Back to Invoices
          </Button>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 font-sans flex flex-col pb-24 sm:pb-0">
      <AppHeader
        className="shrink-0"
        showCreateInvoice={false}
        action={
          <Button
            onClick={() => void handleDownloadPDF()}
            disabled={isDownloading}
            className="h-10 w-10 px-0 sm:h-10 sm:w-auto sm:px-4 gap-2"
            aria-label={isDownloading ? 'Downloading invoice as PDF' : 'Download invoice as PDF'}
          >
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">{isDownloading ? 'Downloading...' : 'Download PDF'}</span>
          </Button>
        }
      />

      <main className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar bg-gray-200/50">
        <div className="max-w-[1100px] mx-auto px-4 py-6 sm:px-6 lg:px-8">
          <div className="mb-6 rounded-2xl border border-white/70 bg-white/90 p-4 shadow-sm sm:p-5">
            <div>
              <Button variant="ghost" onClick={() => navigate(-1)} className="mb-3 -ml-3 gap-2 text-gray-600 hover:text-gray-900">
                <ArrowLeft className="w-4 h-4" /> Back
              </Button>
              <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
                Invoice {invoice.invoiceNo}
              </h1>
              <p className="mt-2 text-sm text-gray-500 sm:text-base">
                Review the final document, then download a PDF copy from the header.
              </p>
            </div>
          </div>

          <InvoicePreview invoiceData={invoice} />
        </div>
      </main>
    </div>
  );
}
