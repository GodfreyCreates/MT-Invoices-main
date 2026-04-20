import type { InvoiceData } from '../store/useInvoiceStore';
import { toClientApiUrl } from './client-env';
import { getSupabaseAccessToken } from './supabase';

type DownloadableInvoice = Pick<InvoiceData, 'invoiceNo'> & { id?: string };

function getErrorMessage(statusText: string, fallback: string) {
  return statusText?.trim() || fallback;
}

async function readPdfError(response: Response, fallback: string) {
  const contentType = response.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    try {
      const payload = (await response.json()) as { error?: unknown };
      if (typeof payload.error === 'string' && payload.error.trim()) {
        return payload.error;
      }
    } catch {
      // Ignore malformed JSON error bodies.
    }
  }

  return getErrorMessage(response.statusText, fallback);
}

function getFilenameFromDisposition(contentDisposition: string | null) {
  if (!contentDisposition) {
    return null;
  }

  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return utf8Match[1];
    }
  }

  const standardMatch = contentDisposition.match(/filename="?([^"]+)"?/i);
  return standardMatch?.[1] ?? null;
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.style.display = 'none';

  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
}

function getRequiredInvoiceId(invoice: DownloadableInvoice) {
  if (!invoice.id) {
    throw new Error('Save the invoice before downloading the PDF');
  }

  return invoice.id;
}

async function requestPdf(url: string, fallbackFilename: string, fallbackError: string) {
  const headers = new Headers();
  const accessToken = await getSupabaseAccessToken();

  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }

  const response = await fetch(toClientApiUrl(url), {
    headers,
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error(await readPdfError(response, fallbackError));
  }

  const blob = await response.blob();
  const resolvedFilename =
    getFilenameFromDisposition(response.headers.get('content-disposition')) ?? fallbackFilename;

  triggerBlobDownload(blob, resolvedFilename);
}

export async function downloadInvoicePdf(
  invoice: DownloadableInvoice,
  filename = `Invoice_${invoice.invoiceNo || 'invoice'}.pdf`,
) {
  const invoiceId = getRequiredInvoiceId(invoice);
  await requestPdf(
    `/api/invoices/${encodeURIComponent(invoiceId)}/pdf`,
    filename,
    'Failed to download invoice PDF',
  );
}

export async function downloadInvoicesPdf(
  invoices: DownloadableInvoice[],
  filename = 'Invoices.pdf',
) {
  const invoiceIds = Array.from(
    new Set(
      invoices
        .map((invoice) => invoice.id?.trim())
        .filter((invoiceId): invoiceId is string => Boolean(invoiceId)),
    ),
  );

  if (invoiceIds.length === 0) {
    throw new Error('Select at least one saved invoice to download');
  }

  const query = new URLSearchParams({ ids: invoiceIds.join(',') });
  await requestPdf(
    `/api/invoices/pdf?${query.toString()}`,
    filename,
    'Failed to download invoice PDFs',
  );
}
