import React, { forwardRef, useEffect, useState, useRef } from 'react';
import { useInvoiceStore, InvoiceData, DEFAULT_AUTHORIZED_SIGNATURE } from '../store/useInvoiceStore';
import { formatCurrency } from '../lib/utils';
import { format } from 'date-fns';
import { QRCodeSVG } from 'qrcode.react';
import { getInvoiceTheme } from '../lib/invoice-themes';

interface InvoicePreviewProps {
  invoiceData?: InvoiceData & { id?: string };
  logoUrl?: string | null;
  forExport?: boolean;
}

export const InvoicePreview = forwardRef<HTMLDivElement, InvoicePreviewProps>((props, ref) => {
  const PDF_PAGE_HEIGHT = '296.6mm';
  const storeData = useInvoiceStore((state) => state.data);
  const data = props.invoiceData || storeData;
  const resolvedLogoUrl =
    props.logoUrl ?? data.companyDocumentLogoUrl ?? data.ownerLogoUrl ?? null;
  const theme = getInvoiceTheme(data.theme);
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const forExport = props.forExport ?? false;
  const issuerName = data.issuerName?.trim() || 'Company name';
  const issuerEmail = data.issuerEmail?.trim() || '-';
  const issuerPhone = data.issuerPhone?.trim() || '-';
  const issuerPoBox = data.issuerPoBox?.trim() || '';
  const issuerStreetAddress = data.issuerStreetAddress?.trim() || '-';
  const issuerStandNumber = data.issuerStandNumber?.trim() || '';
  const bankName = data.bankName?.trim() || '-';
  const bankAccountHolder = data.bankAccountHolder?.trim() || '-';
  const bankAccountNumber = data.bankAccountNumber?.trim() || '-';
  const bankAccountType = data.bankAccountType?.trim() || '-';
  const bankBranchCode = data.bankBranchCode?.trim() || '-';

  useEffect(() => {
    if (forExport) {
      setScale(1);
      return;
    }

    const updateScale = () => {
      if (containerRef.current) {
        // 210mm is approximately 794px at 96 DPI
        const A4_WIDTH_PX = 794;
        // Padding of the container (p-4 is 16px * 2 = 32px, md:p-8 is 32px * 2 = 64px)
        // Let's use a safe margin of 64px
        const availableWidth = containerRef.current.clientWidth - 64;
        
        if (availableWidth < A4_WIDTH_PX) {
          setScale(availableWidth / A4_WIDTH_PX);
        } else {
          setScale(1);
        }
      }
    };

    updateScale();
    window.addEventListener('resize', updateScale);
    
    const observer = new ResizeObserver(updateScale);
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => {
      window.removeEventListener('resize', updateScale);
      observer.disconnect();
    };
  }, [forExport]);

  // Calculations
  const calculateRowTotals = (service: any) => {
    const quantity = Number(service.quantity) || 0;
    const unitPrice = Number(service.unitPrice) || 0;
    const discountPercent = Number(service.discountPercent) || 0;
    const taxPercent = Number(service.taxPercent) || 0;

    const subtotal = quantity * unitPrice;
    const discountAmount = subtotal * (discountPercent / 100);
    const afterDiscount = subtotal - discountAmount;
    const taxAmount = afterDiscount * (taxPercent / 100);
    const netTotal = afterDiscount + taxAmount;
    return { subtotal, discountAmount, taxAmount, netTotal };
  };

  const totals = data.services.reduce(
    (acc, service) => {
      const row = calculateRowTotals(service);
      return {
        subtotal: acc.subtotal + row.subtotal,
        discount: acc.discount + row.discountAmount,
        tax: acc.tax + row.taxAmount,
        grandTotal: acc.grandTotal + row.netTotal,
      };
    },
    { subtotal: 0, discount: 0, tax: 0, grandTotal: 0 }
  );

  // Pagination Logic
  const pages: { rows: any[], isFirst: boolean, isLast: boolean, emptyRowsCount: number }[] = [];
  let remainingRows = [...data.services];
  let isFirstPage = true;

  const PAGE_HEIGHT = 1000; // Safe usable height in pixels (A4 is ~1122px, minus 80px padding, minus safety margin)
  const HEADER_HEIGHT = 230;
  const CLIENT_BANK_HEIGHT = 230;
  const TABLE_HEADER_HEIGHT = 40;
  const TOTALS_FOOTER_HEIGHT = 270;
  const PAGE_NUMBER_HEIGHT = 40;
  const EMPTY_ROW_HEIGHT = 40;

  const calculateRowHeight = (row: any) => {
    // max-w-[70px] for sender, receiver, reference at text-[11px] allows ~11 chars per line
    const charsPerLine = 11; 
    // max-w-[100px] for service allows ~16 chars per line
    const charsPerLineService = 16;
    
    const senderLines = Math.ceil(Math.max(1, (row.sender?.length || 0) / charsPerLine));
    const receiverLines = Math.ceil(Math.max(1, (row.receiver?.length || 0) / charsPerLine));
    const referenceLines = Math.ceil(Math.max(1, (row.reference?.length || 0) / charsPerLine));
    const serviceLines = Math.ceil(Math.max(1, (row.service?.length || 0) / charsPerLineService));
    
    const maxLines = Math.max(senderLines, receiverLines, referenceLines, serviceLines, 1);
    
    // py-3 is 24px padding (12px top, 12px bottom)
    // text-[11px] line-height is ~16px
    return 24 + (maxLines * 16); 
  };

  while (remainingRows.length > 0 || isFirstPage) {
    let currentPageHeight = HEADER_HEIGHT + TABLE_HEADER_HEIGHT + PAGE_NUMBER_HEIGHT;
    
    if (isFirstPage) {
      currentPageHeight += CLIENT_BANK_HEIGHT;
    }

    let rowsForThisPage = [];
    let isLastPage = false;

    let totalRemainingHeight = remainingRows.reduce((sum, row) => sum + calculateRowHeight(row), 0);
    
    if (currentPageHeight + totalRemainingHeight + TOTALS_FOOTER_HEIGHT <= PAGE_HEIGHT) {
      // Everything fits on this page!
      rowsForThisPage = remainingRows.splice(0, remainingRows.length);
      isLastPage = true;
      currentPageHeight += totalRemainingHeight + TOTALS_FOOTER_HEIGHT;
    } else {
      // Fill the current page with as many rows as possible
      while (remainingRows.length > 0) {
        const nextRowHeight = calculateRowHeight(remainingRows[0]);
        if (currentPageHeight + nextRowHeight <= PAGE_HEIGHT) {
          currentPageHeight += nextRowHeight;
          rowsForThisPage.push(remainingRows.shift());
        } else {
          break; // Page is full
        }
      }
      
      // Edge case: If a single row is too tall for a page, force it in
      if (rowsForThisPage.length === 0 && remainingRows.length > 0) {
        const forcedRow = remainingRows.shift();
        currentPageHeight += calculateRowHeight(forcedRow);
        rowsForThisPage.push(forcedRow);
      }
    }

    let emptyRowsCount = 0;
    const remainingSpace = PAGE_HEIGHT - currentPageHeight;
    if (remainingSpace > EMPTY_ROW_HEIGHT) {
      emptyRowsCount = Math.floor(remainingSpace / EMPTY_ROW_HEIGHT);
    }

    pages.push({
      rows: rowsForThisPage,
      isFirst: isFirstPage,
      isLast: isLastPage,
      emptyRowsCount,
    });

    isFirstPage = false;
  }

  // If the loop finished but the last page wasn't marked as isLast 
  // (e.g. it was exactly full but couldn't fit totals)
  if (pages.length > 0 && !pages[pages.length - 1].isLast) {
    let currentPageHeight = HEADER_HEIGHT + TABLE_HEADER_HEIGHT + PAGE_NUMBER_HEIGHT + TOTALS_FOOTER_HEIGHT;
    let emptyRowsCount = 0;
    const remainingSpace = PAGE_HEIGHT - currentPageHeight;
    if (remainingSpace > EMPTY_ROW_HEIGHT) {
      emptyRowsCount = Math.floor(remainingSpace / EMPTY_ROW_HEIGHT);
    }

    pages.push({
      rows: [],
      isFirst: false,
      isLast: true,
      emptyRowsCount,
    });
  }

  return (
    <div
      ref={containerRef}
      className={forExport ? 'flex flex-col items-center w-full' : 'p-4 md:p-8 flex flex-col items-center w-full'}
    >
      <div 
        data-invoice-preview-root="true"
        ref={ref} 
        className={
          forExport
            ? 'flex flex-col gap-0 print:bg-transparent origin-top'
            : 'flex flex-col gap-8 print:gap-0 print:bg-transparent origin-top transition-transform duration-200'
        }
        style={
          forExport
            ? undefined
            : {
                transform: `scale(${scale})`,
                marginBottom: `-${(1 - scale) * (pages.length * 1122.5 + (pages.length - 1) * 32)}px`,
              }
        }
      >
        {pages.map((page, index) => (
          <div 
            key={index} 
            data-invoice-page="true"
            className={`shadow-xl print:shadow-none box-border flex flex-col relative ${
              index < pages.length - 1 ? 'break-after-page' : ''
            }`} 
            style={{
              width: '210mm',
              minHeight: PDF_PAGE_HEIGHT,
              height: PDF_PAGE_HEIGHT,
              padding: '40px 32px',
              backgroundColor: '#ffffff',
              overflow: 'hidden',
            }}
          >
            {/* Header (Visible on all pages) */}
            <div
              className="grid grid-cols-3 gap-4 items-start border-b-2 pb-8 mb-8 shrink-0"
              style={{ borderBottomColor: theme.colors.lineStrong }}
            >
              <div>
                <h2
                  className="text-2xl font-bold tracking-tight"
                  style={{ color: theme.colors.primary }}
                >
                  {issuerName}
                </h2>
                <div className="mt-2 text-sm space-y-1" style={{ color: theme.colors.textMuted }}>
                  <p>Email: {issuerEmail}</p>
                  <p>Phone: {issuerPhone}</p>
                  {issuerPoBox ? <p>P.O. BOX: {issuerPoBox}</p> : null}
                  <p>Address: {issuerStreetAddress}</p>
                  {issuerStandNumber ? <p>Stand No: {issuerStandNumber}</p> : null}
                </div>
              </div>
              <div className="flex flex-col items-center justify-start pt-2">
                {data.verificationToken ? (
                  <>
                    <QRCodeSVG
                      value={`${window.location.origin}/verify?token=${encodeURIComponent(data.verificationToken)}`}
                      size={100}
                      fgColor={theme.colors.lineStrong}
                      bgColor="#FFFFFF"
                      level="M"
                      includeMargin={false}
                    />
                    <p
                      className="text-[9px] mt-1.5 text-center leading-tight"
                      style={{ color: theme.colors.textMuted }}
                    >
                      Scan to verify
                    </p>
                  </>
                ) : (
                  <div
                    className="w-[100px] h-[100px] rounded-lg border border-dashed flex items-center justify-center text-center px-3"
                    style={{
                      borderColor: theme.colors.surfaceBorder,
                      backgroundColor: theme.colors.surface,
                    }}
                  >
                    <p
                      className="text-[10px] leading-tight"
                      style={{ color: theme.colors.textMuted }}
                    >
                      Save the invoice to generate a verification QR code
                    </p>
                  </div>
                )}
                <div
                  className="mt-4 flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl border p-2 shadow-sm"
                  style={{
                    borderColor: '#e2e8f0',
                    backgroundColor: '#ffffff',
                  }}
                >
                  {resolvedLogoUrl ? (
                    <img
                      src={resolvedLogoUrl}
                      alt="Company logo"
                      className="max-h-full max-w-full object-contain"
                    />
                  ) : (
                    <div
                      className="flex h-full w-full items-center justify-center rounded-xl text-sm font-bold tracking-wider"
                      style={{
                        color: '#ffffff',
                        background: `linear-gradient(135deg, ${theme.colors.primary} 0%, ${theme.colors.secondary} 100%)`,
                      }}
                    >
                      MT
                    </div>
                  )}
                </div>
              </div>
              <div className="text-right flex flex-col items-end">
                <h1
                  className="text-4xl font-bold tracking-tight mb-4"
                  style={{ color: theme.colors.textStrong }}
                >
                  INVOICE
                </h1>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm text-right mb-4">
                  <div className="font-medium" style={{ color: theme.colors.textMuted }}>Invoice No:</div>
                  <div className="font-semibold" style={{ color: theme.colors.textStrong }}>{data.invoiceNo}</div>
                  <div className="font-medium" style={{ color: theme.colors.textMuted }}>Issue Date:</div>
                  <div className="font-semibold" style={{ color: theme.colors.textStrong }}>{data.issueDate ? format(new Date(data.issueDate), 'dd MMM yyyy') : '-'}</div>
                  <div className="font-medium" style={{ color: theme.colors.textMuted }}>Due Date:</div>
                  <div className="font-semibold" style={{ color: theme.colors.textStrong }}>{data.dueDate ? format(new Date(data.dueDate), 'dd MMM yyyy') : '-'}</div>
                </div>
                <div
                  className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
                  style={{
                    backgroundColor: theme.colors.accentSoft,
                    color: theme.colors.accentText,
                  }}
                >
                  {data.paymentTerms}
                </div>
              </div>
            </div>

            {page.isFirst && (
              <>
                {/* Client & Bank Details */}
                <div className="grid grid-cols-2 gap-12 mb-10 shrink-0">
                  {/* Client Meta */}
                  <div>
                    <h3
                      className="text-xs font-bold uppercase tracking-wider mb-3"
                      style={{ color: theme.colors.textMuted }}
                    >
                      Billed To
                    </h3>
                    <div
                      className="p-4 rounded-lg text-sm space-y-1 border"
                      style={{
                        backgroundColor: theme.colors.surface,
                        borderColor: theme.colors.surfaceBorder,
                        color: theme.colors.textBody,
                      }}
                    >
                      <p className="font-bold text-base" style={{ color: theme.colors.textStrong }}>{data.clientCompanyName}</p>
                      {data.clientStreet && <p>{data.clientStreet} {data.clientHouseNumber}</p>}
                      {data.clientCity && <p>{data.clientCity}, {data.clientPostalCode}</p>}
                      {data.clientEmail && <p className="mt-2">{data.clientEmail}</p>}
                      {data.clientPhone && <p>{data.clientPhone}</p>}
                    </div>
                  </div>

                  {/* Bank Details */}
                  <div>
                    <h3
                      className="text-xs font-bold uppercase tracking-wider mb-3"
                      style={{ color: theme.colors.textMuted }}
                    >
                      Bank Details
                    </h3>
                    <div
                      className="p-4 rounded-lg text-sm space-y-1.5 border"
                      style={{
                        backgroundColor: theme.colors.surface,
                        borderColor: theme.colors.surfaceBorder,
                        color: theme.colors.textBody,
                      }}
                    >
                      <p><span className="w-24 inline-block" style={{ color: theme.colors.textMuted }}>Bank:</span> <span className="font-semibold" style={{ color: theme.colors.textStrong }}>{bankName}</span></p>
                      <p><span className="w-24 inline-block" style={{ color: theme.colors.textMuted }}>Holder:</span> <span className="font-semibold" style={{ color: theme.colors.textStrong }}>{bankAccountHolder}</span></p>
                      <p><span className="w-24 inline-block" style={{ color: theme.colors.textMuted }}>Account No:</span> <span className="font-semibold" style={{ color: theme.colors.textStrong }}>{bankAccountNumber}</span></p>
                      <p><span className="w-24 inline-block" style={{ color: theme.colors.textMuted }}>Type:</span> <span className="font-semibold" style={{ color: theme.colors.textStrong }}>{bankAccountType}</span></p>
                      <p><span className="w-24 inline-block" style={{ color: theme.colors.textMuted }}>Branch Code:</span> <span className="font-semibold" style={{ color: theme.colors.textStrong }}>{bankBranchCode}</span></p>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Services Table */}
            {(page.rows.length > 0 || page.emptyRowsCount > 0 || page.isFirst) && (
              <div className="mb-10">
                <table className="w-full text-left text-[11px]">
                  <thead className="break-inside-avoid">
                    <tr
                      className="border-b text-[10px] uppercase tracking-wider"
                      style={{
                        backgroundColor: theme.colors.surface,
                        borderBottomColor: theme.colors.lineSoft,
                        color: theme.colors.accentText,
                      }}
                    >
                      <th className="py-3 font-bold pl-2 pr-2">DATE</th>
                      <th className="py-3 font-bold pr-2">SENDER</th>
                      <th className="py-3 font-bold pr-2">RECEIVER</th>
                      <th className="py-3 font-bold pr-2">REFERENCE</th>
                      <th className="py-3 font-bold pr-2">SERVICE</th>
                      <th className="py-3 font-bold text-right pr-2">QTY</th>
                      <th className="py-3 font-bold text-right pr-2 whitespace-nowrap">UNIT PRICE</th>
                      <th className="py-3 font-bold text-right pr-2">DISC%</th>
                      <th className="py-3 font-bold text-right pr-2">TAX%</th>
                      <th className="py-3 font-bold text-right whitespace-nowrap pr-2">NET PRICE</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y" style={{ borderColor: theme.colors.surfaceBorder }}>
                    {page.rows.map((service) => {
                      const row = calculateRowTotals(service);
                      return (
                        <tr
                          key={service.id}
                          className="group break-inside-avoid"
                          style={{ color: theme.colors.textBody }}
                        >
                          <td className="py-3 pl-2 pr-2 align-top whitespace-nowrap">
                            {service.date ? format(new Date(service.date), 'dd MMM yyyy') : '-'}
                          </td>
                          <td className="py-3 pr-2 align-top break-words max-w-[70px]">{service.sender}</td>
                          <td className="py-3 pr-2 align-top break-words max-w-[70px]">{service.receiver}</td>
                          <td className="py-3 pr-2 align-top break-words max-w-[70px]">{service.reference}</td>
                          <td
                            className="py-3 pr-2 align-top break-words max-w-[100px] font-semibold"
                            style={{ color: theme.colors.textStrong }}
                          >
                            {service.service}
                          </td>
                          <td className="py-3 pr-2 text-right align-top">{service.quantity !== '' ? service.quantity : '-'}</td>
                          <td className="py-3 pr-2 text-right align-top whitespace-nowrap">{service.unitPrice !== '' ? formatCurrency(Number(service.unitPrice)) : '-'}</td>
                          <td className="py-3 pr-2 text-right align-top">{service.discountPercent !== '' ? `${service.discountPercent}%` : '-'}</td>
                          <td className="py-3 pr-2 text-right align-top">{service.taxPercent !== '' ? `${service.taxPercent}%` : '-'}</td>
                          <td
                            className="py-3 pr-2 text-right align-top font-medium whitespace-nowrap"
                            style={{ color: theme.colors.textStrong }}
                          >
                            {formatCurrency(row.netTotal)}
                          </td>
                        </tr>
                      );
                    })}
                    {Array.from({ length: page.emptyRowsCount || 0 }).map((_, i) => (
                      <tr key={`empty-${i}`} className="text-transparent break-inside-avoid">
                        <td className="py-3 pl-2 pr-2 align-top whitespace-nowrap">-</td>
                        <td className="py-3 pr-2 align-top break-words max-w-[70px]">-</td>
                        <td className="py-3 pr-2 align-top break-words max-w-[70px]">-</td>
                        <td className="py-3 pr-2 align-top break-words max-w-[70px]">-</td>
                        <td className="py-3 pr-2 align-top break-words max-w-[100px]">-</td>
                        <td className="py-3 pr-2 text-right align-top">-</td>
                        <td className="py-3 pr-2 text-right align-top whitespace-nowrap">-</td>
                        <td className="py-3 pr-2 text-right align-top">-</td>
                        <td className="py-3 pr-2 text-right align-top">-</td>
                        <td className="py-3 pr-2 text-right align-top whitespace-nowrap">-</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {page.isLast && (
              <div className="mt-auto flex flex-col gap-0">
                {/* Totals */}
                <div className="flex justify-end mb-10 break-inside-avoid shrink-0">
                  <div className="w-1/2 space-y-3 text-sm">
                    <div className="flex justify-between" style={{ color: theme.colors.textBody }}>
                      <span>Subtotal</span>
                      <span>{formatCurrency(totals.subtotal)}</span>
                    </div>
                    {totals.discount > 0 && (
                      <div className="flex justify-between" style={{ color: theme.colors.discount }}>
                        <span>Discount</span>
                        <span>-{formatCurrency(totals.discount)}</span>
                      </div>
                    )}
                    <div className="flex justify-between" style={{ color: theme.colors.textBody }}>
                      <span>Tax</span>
                      <span>{formatCurrency(totals.tax)}</span>
                    </div>
                    <div
                      className="flex justify-between items-center pt-4 border-t-2"
                      style={{ borderTopColor: theme.colors.lineStrong }}
                    >
                      <span className="font-bold" style={{ color: theme.colors.textStrong }}>Grand Total</span>
                      <span className="text-xl font-bold" style={{ color: theme.colors.primary }}>{formatCurrency(totals.grandTotal)}</span>
                    </div>
                  </div>
                </div>

                {/* Footer Notes */}
                <div
                  className="grid grid-cols-2 gap-12 text-sm pt-8 border-t break-inside-avoid shrink-0"
                  style={{
                    color: theme.colors.textBody,
                    borderTopColor: theme.colors.surfaceBorder,
                  }}
                >
                  <div>
                    {data.notes && (
                      <div className="mb-4">
                        <h4 className="font-bold mb-1" style={{ color: theme.colors.textStrong }}>Notes</h4>
                        <p className="whitespace-pre-wrap">{data.notes}</p>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-end justify-end">
                    <div className="w-48 border-b mb-2" style={{ borderBottomColor: theme.colors.lineSoft }}></div>
                    <p
                      className="font-signature text-3xl leading-none tracking-[0.03em]"
                      style={{ color: theme.colors.textStrong }}
                    >
                      {data.authorizedSignature || DEFAULT_AUTHORIZED_SIGNATURE}
                    </p>
                    <p className="text-xs" style={{ color: theme.colors.textMuted }}>Authorized Signature</p>
                  </div>
                </div>
              </div>
            )}

            {/* Page Number indicator */}
            {pages.length > 1 && (
              <div
                className="absolute bottom-4 left-0 right-0 text-center text-[10px] print:hidden"
                style={{ color: theme.colors.textMuted }}
              >
                Page {index + 1} of {pages.length}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
});

InvoicePreview.displayName = 'InvoicePreview';
