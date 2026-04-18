import React, { forwardRef, useEffect, useState, useRef } from 'react';
import { useInvoiceStore, InvoiceData, DEFAULT_AUTHORIZED_SIGNATURE } from '../store/useInvoiceStore';
import { formatCurrency } from '../lib/utils';
import { format } from 'date-fns';
import { QRCodeSVG } from 'qrcode.react';

interface InvoicePreviewProps {
  invoiceData?: InvoiceData & { id?: string };
  logoUrl?: string | null;
}

export const InvoicePreview = forwardRef<HTMLDivElement, InvoicePreviewProps>((props, ref) => {
  const storeData = useInvoiceStore((state) => state.data);
  const data = props.invoiceData || storeData;
  const resolvedLogoUrl = props.logoUrl ?? data.ownerLogoUrl ?? null;
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
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
  }, []);

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
    <div ref={containerRef} className="p-4 md:p-8 flex flex-col items-center w-full">
      <div 
        id="invoice-preview-container" 
        ref={ref} 
        className="flex flex-col gap-8 print:gap-0 print:bg-transparent origin-top transition-transform duration-200"
        style={{ 
          transform: `scale(${scale})`, 
          marginBottom: `-${(1 - scale) * (pages.length * 1122.5 + (pages.length - 1) * 32)}px` 
        }}
      >
        {pages.map((page, index) => (
          <div 
            key={index} 
            className="bg-white shadow-xl print:shadow-none box-border flex flex-col relative break-after-page" 
            style={{ width: '210mm', minHeight: '297mm', height: '297mm', padding: '40px 32px' }}
          >
            {/* Header (Visible on all pages) */}
            <div className="grid grid-cols-3 gap-4 items-start border-b-2 border-gray-900 pb-8 mb-8 shrink-0">
              <div>
                <h2 className="text-2xl font-bold text-blue-900 tracking-tight">MT LEGACY LOGISTICS</h2>
                <div className="mt-2 text-sm text-gray-600 space-y-1">
                  <p>Email: info@mtlegacylogistics.co.za</p>
                  <p>Phone: +27 762038481 | +26 876806294</p>
                  <p>P.O. BOX: 98</p>
                  <p>Address: OSHOEK N17 ROAD</p>
                  <p>Stand No: 200</p>
                </div>
              </div>
              <div className="flex flex-col items-center justify-start pt-2">
                {data.verificationToken ? (
                  <>
                    <QRCodeSVG
                      value={`${window.location.origin}/verify?token=${encodeURIComponent(data.verificationToken)}`}
                      size={100}
                      level="M"
                      includeMargin={false}
                    />
                    <p className="text-[9px] text-gray-400 mt-1.5 text-center leading-tight">Scan to verify</p>
                  </>
                ) : (
                  <div className="w-[100px] h-[100px] rounded-lg border border-dashed border-gray-300 bg-gray-50 flex items-center justify-center text-center px-3">
                    <p className="text-[10px] text-gray-400 leading-tight">Save the invoice to generate a verification QR code</p>
                  </div>
                )}
                <div className="mt-4 flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
                  {resolvedLogoUrl ? (
                    <img
                      src={resolvedLogoUrl}
                      alt="Company logo"
                      className="max-h-full max-w-full object-contain"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-700 text-sm font-bold tracking-wider text-white">
                      MT
                    </div>
                  )}
                </div>
              </div>
              <div className="text-right flex flex-col items-end">
                <h1 className="text-4xl font-bold tracking-tight text-gray-900 mb-4">INVOICE</h1>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm text-right mb-4">
                  <div className="text-gray-500 font-medium">Invoice No:</div>
                  <div className="font-semibold text-gray-900">{data.invoiceNo}</div>
                  <div className="text-gray-500 font-medium">Issue Date:</div>
                  <div className="font-semibold text-gray-900">{data.issueDate ? format(new Date(data.issueDate), 'dd MMM yyyy') : '-'}</div>
                  <div className="text-gray-500 font-medium">Due Date:</div>
                  <div className="font-semibold text-gray-900">{data.dueDate ? format(new Date(data.dueDate), 'dd MMM yyyy') : '-'}</div>
                </div>
                <div className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
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
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Billed To</h3>
                    <div className="text-sm space-y-1">
                      <p className="font-bold text-gray-900 text-base">{data.clientCompanyName}</p>
                      {data.clientStreet && <p>{data.clientStreet} {data.clientHouseNumber}</p>}
                      {data.clientCity && <p>{data.clientCity}, {data.clientPostalCode}</p>}
                      {data.clientEmail && <p className="text-gray-600 mt-2">{data.clientEmail}</p>}
                      {data.clientPhone && <p className="text-gray-600">{data.clientPhone}</p>}
                    </div>
                  </div>

                  {/* Bank Details */}
                  <div>
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Bank Details</h3>
                    <div className="bg-gray-50 p-4 rounded-lg text-sm space-y-1.5 border border-gray-100">
                      <p><span className="text-gray-500 w-24 inline-block">Bank:</span> <span className="font-semibold text-gray-900">First National Bank</span></p>
                      <p><span className="text-gray-500 w-24 inline-block">Holder:</span> <span className="font-semibold text-gray-900">MT LEGACY LOGISTICS</span></p>
                      <p><span className="text-gray-500 w-24 inline-block">Account No:</span> <span className="font-semibold text-gray-900">62930593464</span></p>
                      <p><span className="text-gray-500 w-24 inline-block">Type:</span> <span className="font-semibold text-gray-900">CHEQUE</span></p>
                      <p><span className="text-gray-500 w-24 inline-block">Branch Code:</span> <span className="font-semibold text-gray-900">250039</span></p>
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
                    <tr className="border-b border-gray-300 text-[10px] uppercase tracking-wider text-indigo-600">
                      <th className="py-3 font-bold pr-2">DATE</th>
                      <th className="py-3 font-bold pr-2">SENDER</th>
                      <th className="py-3 font-bold pr-2">RECEIVER</th>
                      <th className="py-3 font-bold pr-2">REFERENCE</th>
                      <th className="py-3 font-bold pr-2">SERVICE</th>
                      <th className="py-3 font-bold text-right pr-2">QTY</th>
                      <th className="py-3 font-bold text-right pr-2 whitespace-nowrap">UNIT PRICE</th>
                      <th className="py-3 font-bold text-right pr-2">DISC%</th>
                      <th className="py-3 font-bold text-right pr-2">TAX%</th>
                      <th className="py-3 font-bold text-right whitespace-nowrap">NET PRICE</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {page.rows.map((service) => {
                      const row = calculateRowTotals(service);
                      return (
                        <tr key={service.id} className="group text-gray-800 break-inside-avoid">
                          <td className="py-3 pr-2 align-top whitespace-nowrap">
                            {service.date ? format(new Date(service.date), 'dd MMM yyyy') : '-'}
                          </td>
                          <td className="py-3 pr-2 align-top break-words max-w-[70px]">{service.sender}</td>
                          <td className="py-3 pr-2 align-top break-words max-w-[70px]">{service.receiver}</td>
                          <td className="py-3 pr-2 align-top break-words max-w-[70px]">{service.reference}</td>
                          <td className="py-3 pr-2 align-top break-words max-w-[100px] font-semibold text-gray-900">{service.service}</td>
                          <td className="py-3 pr-2 text-right align-top">{service.quantity !== '' ? service.quantity : '-'}</td>
                          <td className="py-3 pr-2 text-right align-top whitespace-nowrap">{service.unitPrice !== '' ? formatCurrency(Number(service.unitPrice)) : '-'}</td>
                          <td className="py-3 pr-2 text-right align-top">{service.discountPercent !== '' ? `${service.discountPercent}%` : '-'}</td>
                          <td className="py-3 pr-2 text-right align-top">{service.taxPercent !== '' ? `${service.taxPercent}%` : '-'}</td>
                          <td className="py-3 text-right align-top font-medium text-gray-900 whitespace-nowrap">
                            {formatCurrency(row.netTotal)}
                          </td>
                        </tr>
                      );
                    })}
                    {Array.from({ length: page.emptyRowsCount || 0 }).map((_, i) => (
                      <tr key={`empty-${i}`} className="text-transparent break-inside-avoid">
                        <td className="py-3 pr-2 align-top whitespace-nowrap">-</td>
                        <td className="py-3 pr-2 align-top break-words max-w-[70px]">-</td>
                        <td className="py-3 pr-2 align-top break-words max-w-[70px]">-</td>
                        <td className="py-3 pr-2 align-top break-words max-w-[70px]">-</td>
                        <td className="py-3 pr-2 align-top break-words max-w-[100px]">-</td>
                        <td className="py-3 pr-2 text-right align-top">-</td>
                        <td className="py-3 pr-2 text-right align-top whitespace-nowrap">-</td>
                        <td className="py-3 pr-2 text-right align-top">-</td>
                        <td className="py-3 pr-2 text-right align-top">-</td>
                        <td className="py-3 text-right align-top whitespace-nowrap">-</td>
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
                    <div className="flex justify-between text-gray-600">
                      <span>Subtotal</span>
                      <span>{formatCurrency(totals.subtotal)}</span>
                    </div>
                    {totals.discount > 0 && (
                      <div className="flex justify-between text-red-600">
                        <span>Discount</span>
                        <span>-{formatCurrency(totals.discount)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-gray-600">
                      <span>Tax</span>
                      <span>{formatCurrency(totals.tax)}</span>
                    </div>
                    <div className="flex justify-between items-center pt-4 border-t-2 border-gray-900">
                      <span className="font-bold text-gray-900">Grand Total</span>
                      <span className="text-xl font-bold text-blue-900">{formatCurrency(totals.grandTotal)}</span>
                    </div>
                  </div>
                </div>

                {/* Footer Notes */}
                <div className="grid grid-cols-2 gap-12 text-sm text-gray-600 pt-8 border-t border-gray-200 break-inside-avoid shrink-0">
                  <div>
                    {data.notes && (
                      <div className="mb-4">
                        <h4 className="font-bold text-gray-900 mb-1">Notes</h4>
                        <p className="whitespace-pre-wrap">{data.notes}</p>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-end justify-end">
                    <div className="w-48 border-b border-gray-400 mb-2"></div>
                    <p className="font-signature text-3xl leading-none tracking-[0.03em] text-gray-900">
                      {data.authorizedSignature || DEFAULT_AUTHORIZED_SIGNATURE}
                    </p>
                    <p className="text-xs text-gray-500">Authorized Signature</p>
                  </div>
                </div>
              </div>
            )}

            {/* Page Number indicator */}
            {pages.length > 1 && (
              <div className="absolute bottom-4 left-0 right-0 text-center text-[10px] text-gray-400 print:hidden">
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
