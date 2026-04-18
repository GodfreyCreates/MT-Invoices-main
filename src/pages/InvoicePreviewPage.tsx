import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { InvoiceData } from '../store/useInvoiceStore';
import { InvoicePreview } from '../components/InvoicePreview';
import { Button } from '../components/ui/Button';
import { ArrowLeft, Download } from 'lucide-react';
import { AppHeader } from '../components/layout/AppHeader';
import html2pdf from 'html2pdf.js';
import { ApiError, apiRequest } from '../lib/api';

export function InvoicePreviewPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [invoice, setInvoice] = useState<(InvoiceData & { id: string }) | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const componentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchInvoice = async () => {
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
      fetchInvoice();
    }
  }, [id]);

  const handleExportPDF = () => {
    if (!componentRef.current || !invoice) return;

    const element = componentRef.current;
    
    const opt = {
      margin: 0,
      filename: `Invoice_${invoice.invoiceNo}.pdf`,
      image: { type: 'jpeg' as const, quality: 0.98 },
      html2canvas: { 
        scale: 2,
        useCORS: true,
        logging: false,
        onclone: (document: Document) => {
          const container = document.getElementById('invoice-preview-container');
          if (container) {
            container.classList.remove('gap-8');
            const pages = container.querySelectorAll('.shadow-xl');
            pages.forEach(page => page.classList.remove('shadow-xl'));
          }
        }
      },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' as const },
      pagebreak: { mode: 'css', before: '.break-before-page', after: '.break-after-page' }
    };

    html2pdf().set(opt).from(element).save();
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
            onClick={handleExportPDF}
            className="h-10 w-10 px-0 sm:h-10 sm:w-auto sm:px-4 gap-2"
            aria-label="Export invoice as PDF"
          >
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Export PDF</span>
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
                Review the final document, then export a PDF copy from the header.
              </p>
            </div>
          </div>

          <InvoicePreview ref={componentRef} invoiceData={invoice} />
        </div>
      </main>
    </div>
  );
}
