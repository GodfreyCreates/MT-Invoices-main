import React, { useEffect, useRef, useState } from 'react';
import { InvoiceForm } from '../components/InvoiceForm';
import { InvoicePreview } from '../components/InvoicePreview';
import { Button } from '../components/ui/Button';
import { Download, Eye, EyeOff } from 'lucide-react';
import { AppHeader } from '../components/layout/AppHeader';
import html2pdf from 'html2pdf.js';
import { useInvoiceStore } from '../store/useInvoiceStore';
import { apiRequest } from '../lib/api';
import { toast } from 'sonner';

export function InvoiceGenerator() {
  const exportPreviewRef = useRef<HTMLDivElement>(null);
  const { saveInvoice, isSaving } = useInvoiceStore();
  const [isPreviewVisible, setIsPreviewVisible] = useState(true);
  const [brandLogoUrl, setBrandLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadBranding = async () => {
      try {
        const summary = await apiRequest<{ branding?: { logoUrl?: string | null } }>('/api/settings/summary');
        if (isMounted) {
          setBrandLogoUrl(summary.branding?.logoUrl ?? null);
        }
      } catch {
        if (isMounted) {
          setBrandLogoUrl(null);
        }
      }
    };

    void loadBranding();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleExportPDF = async () => {
    if (!exportPreviewRef.current) return;

    try {
      await saveInvoice();
      toast.success('Invoice saved successfully');

      const element = exportPreviewRef.current;
      
      // Create a wrapper for the PDF generation to ensure styles are applied correctly
      // and we don't capture the scrollbar or container backgrounds
      const opt = {
        margin: 0,
        filename: 'Invoice_MT_LEGACY_LOGISTICS.pdf',
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

      toast.info('Generating PDF...');
      html2pdf().set(opt).from(element).save().then(() => {
        toast.success('PDF downloaded successfully');
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save invoice');
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 font-sans pb-24 sm:pb-0">
      <AppHeader
        showCreateInvoice={false}
        action={
          <>
            <Button
              variant="outline"
              onClick={() => setIsPreviewVisible((current) => !current)}
              className="h-10 w-10 px-0 sm:h-10 sm:w-auto sm:px-4 gap-2"
              aria-label={isPreviewVisible ? 'Hide live preview' : 'Show live preview'}
            >
              {isPreviewVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              <span className="hidden sm:inline">
                {isPreviewVisible ? 'Hide Preview' : 'Show Preview'}
              </span>
            </Button>
            <Button
              onClick={handleExportPDF}
              disabled={isSaving}
              className="h-10 w-10 px-0 sm:h-10 sm:w-auto sm:px-4 gap-2"
              aria-label={isSaving ? 'Saving invoice for export' : 'Export invoice as PDF'}
            >
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">{isSaving ? 'Saving...' : 'Export PDF'}</span>
            </Button>
          </>
        }
      />

      <main className="max-w-[1600px] mx-auto p-4 sm:p-6 lg:p-8">
        <div className={`grid grid-cols-1 gap-8 ${isPreviewVisible ? 'lg:grid-cols-2' : ''}`}>
          {/* Form Section */}
          <div className={`h-[calc(100dvh-14rem)] sm:h-[calc(100vh-8rem)] overflow-y-auto custom-scrollbar ${isPreviewVisible ? 'pr-2' : ''}`}>
            <InvoiceForm isPreviewVisible={isPreviewVisible} />
          </div>
          
          {/* Preview Section */}
          {isPreviewVisible ? (
            <div className="h-[calc(100dvh-14rem)] sm:h-[calc(100vh-8rem)] overflow-y-auto overflow-x-hidden custom-scrollbar rounded-xl bg-gray-200/50">
              <InvoicePreview logoUrl={brandLogoUrl} />
            </div>
          ) : null}
        </div>

        <div className="absolute left-[-9999px] top-[-9999px]">
          <InvoicePreview ref={exportPreviewRef} logoUrl={brandLogoUrl} />
        </div>
      </main>
    </div>
  );
}
