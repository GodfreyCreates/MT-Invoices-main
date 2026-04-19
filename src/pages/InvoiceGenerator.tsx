import React, { useEffect, useMemo, useState } from 'react';
import { InvoiceForm } from '../components/InvoiceForm';
import { InvoicePreview } from '../components/InvoicePreview';
import { Button } from '../components/ui/Button';
import { Download, Eye, EyeOff } from 'lucide-react';
import { AppHeader } from '../components/layout/AppHeader';
import { downloadInvoicePdf } from '../lib/invoice-pdf';
import { useInvoiceStore } from '../store/useInvoiceStore';
import { useWorkspace } from '../lib/workspace';
import { toast } from 'sonner';

export function InvoiceGenerator() {
  const { data, saveInvoice, isSaving, syncCompanyContext } = useInvoiceStore();
  const { activeCompany } = useWorkspace();
  const [isPreviewVisible, setIsPreviewVisible] = useState(true);
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    if (!activeCompany) {
      return;
    }

    syncCompanyContext({
      companyId: activeCompany.id,
      companyDocumentLogoUrl: activeCompany.documentLogoUrl,
      issuerName: activeCompany.name,
      issuerEmail: activeCompany.email,
      issuerPhone: activeCompany.phone,
      issuerPoBox: activeCompany.poBox,
      issuerStreetAddress: activeCompany.streetAddress,
      issuerStandNumber: activeCompany.standNumber,
      bankName: activeCompany.bankName,
      bankAccountHolder: activeCompany.accountHolder,
      bankAccountNumber: activeCompany.accountNumber,
      bankAccountType: activeCompany.accountType,
      bankBranchCode: activeCompany.branchCode,
    });
  }, [activeCompany, syncCompanyContext]);

  const previewInvoiceData = useMemo(() => {
    if (!activeCompany) {
      return data;
    }

    return {
      ...data,
      companyId: activeCompany.id,
      ownerLogoUrl: activeCompany.documentLogoUrl,
      companyDocumentLogoUrl: activeCompany.documentLogoUrl,
      issuerName: activeCompany.name,
      issuerEmail: activeCompany.email,
      issuerPhone: activeCompany.phone,
      issuerPoBox: activeCompany.poBox,
      issuerStreetAddress: activeCompany.streetAddress,
      issuerStandNumber: activeCompany.standNumber,
      bankName: activeCompany.bankName,
      bankAccountHolder: activeCompany.accountHolder,
      bankAccountNumber: activeCompany.accountNumber,
      bankAccountType: activeCompany.accountType,
      bankBranchCode: activeCompany.branchCode,
    };
  }, [activeCompany, data]);

  const handleDownloadPDF = async () => {
    if (isDownloading) return;

    setIsDownloading(true);
    try {
      toast.info('Saving invoice and preparing download...');
      const savedInvoice = await saveInvoice();
      const filename = `${(activeCompany?.name ?? savedInvoice.issuerName ?? 'Invoice').replace(/\s+/g, '_')}_${savedInvoice.invoiceNo || 'invoice'}.pdf`;

      await downloadInvoicePdf(savedInvoice, filename);
      toast.success('Invoice saved and downloaded successfully');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save and download invoice');
    } finally {
      setIsDownloading(false);
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
              onClick={handleDownloadPDF}
              disabled={isSaving || isDownloading}
              className="h-10 w-10 px-0 sm:h-10 sm:w-auto sm:px-4 gap-2"
              aria-label={
                isSaving || isDownloading
                  ? 'Saving invoice and downloading PDF'
                  : 'Download invoice as PDF'
              }
            >
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">
                {isSaving || isDownloading ? 'Downloading...' : 'Download PDF'}
              </span>
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
              <InvoicePreview invoiceData={previewInvoiceData} />
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}
