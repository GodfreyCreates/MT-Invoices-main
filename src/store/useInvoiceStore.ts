import { create } from 'zustand';
import { format } from 'date-fns';
import { apiRequest } from '../lib/api';
import { DEFAULT_INVOICE_THEME, type InvoiceThemeId } from '../lib/invoice-themes';

export interface ServiceRow {
  id: string;
  date: string;
  sender: string;
  receiver: string;
  reference: string;
  service: string;
  quantity: number | '';
  unitPrice: number | '';
  discountPercent: number | '';
  taxPercent: number | '';
}

export interface InvoiceData {
  // Client Details
  clientCompanyName: string;
  clientEmail: string;
  clientPhone: string;
  clientStreet: string;
  clientHouseNumber: string;
  clientCity: string;
  clientPostalCode: string;
  invoiceNo: string;
  
  // Additional Fields
  issueDate: string;
  dueDate: string;
  paymentTerms: string;
  theme: InvoiceThemeId;
  notes: string;
  termsAndConditions?: string;
  authorizedSignature: string;
  verificationToken?: string;
  userId?: string | null;
  companyId?: string | null;
  ownerLogoUrl?: string | null;
  companyDocumentLogoUrl?: string | null;
  issuerName?: string | null;
  issuerEmail?: string | null;
  issuerPhone?: string | null;
  issuerPoBox?: string | null;
  issuerStreetAddress?: string | null;
  issuerStandNumber?: string | null;
  bankName?: string | null;
  bankAccountHolder?: string | null;
  bankAccountNumber?: string | null;
  bankAccountType?: string | null;
  bankBranchCode?: string | null;

  // Services
  services: ServiceRow[];
}

export type InvoiceCompanyContext = {
  companyId: string;
  companyDocumentLogoUrl: string | null;
  issuerName: string;
  issuerEmail: string;
  issuerPhone: string;
  issuerPoBox: string | null;
  issuerStreetAddress: string;
  issuerStandNumber: string | null;
  bankName: string;
  bankAccountHolder: string;
  bankAccountNumber: string;
  bankAccountType: string;
  bankBranchCode: string;
};

interface InvoiceStore {
  data: InvoiceData & { id?: string };
  isSaving: boolean;
  updateField: (field: keyof InvoiceData, value: any) => void;
  addService: () => void;
  updateService: (id: string, field: keyof ServiceRow, value: any) => void;
  duplicateService: (id: string) => void;
  removeService: (id: string) => void;
  saveInvoice: () => Promise<InvoiceData & { id: string }>;
  setInvoiceData: (data: InvoiceData & { id?: string }) => void;
  syncCompanyContext: (context: InvoiceCompanyContext) => void;
}

const generateId = () => globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).substring(2, 9);
export const DEFAULT_AUTHORIZED_SIGNATURE = 'R Mulaudzi';

const defaultService: ServiceRow = {
  id: generateId(),
  date: format(new Date(), 'yyyy-MM-dd'),
  sender: '',
  receiver: '',
  reference: '',
  service: 'Clearing',
  quantity: 1,
  unitPrice: '',
  discountPercent: 0,
  taxPercent: 0,
};

export const useInvoiceStore = create<InvoiceStore>((set, get) => ({
  isSaving: false,
  data: {
    clientCompanyName: '',
    clientEmail: '',
    clientPhone: '',
    clientStreet: '',
    clientHouseNumber: '',
    clientCity: '',
    clientPostalCode: '',
    invoiceNo: 'INV-2026-001',
    issueDate: format(new Date(), 'yyyy-MM-dd'),
    dueDate: format(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd'),
    paymentTerms: 'Net 30',
    theme: DEFAULT_INVOICE_THEME,
    notes: 'Thank you for your business.',
    authorizedSignature: DEFAULT_AUTHORIZED_SIGNATURE,
    services: [defaultService],
  },
  updateField: (field, value) =>
    set((state) => ({ data: { ...state.data, [field]: value } })),
  addService: () =>
    set((state) => ({
      data: {
        ...state.data,
        services: [
          ...state.data.services,
          { ...defaultService, id: generateId() },
        ],
      },
    })),
  updateService: (id, field, value) =>
    set((state) => ({
      data: {
        ...state.data,
        services: state.data.services.map((s) =>
          s.id === id ? { ...s, [field]: value } : s
        ),
      },
    })),
  duplicateService: (id) =>
    set((state) => {
      const serviceToDuplicate = state.data.services.find((s) => s.id === id);
      if (!serviceToDuplicate) return state;
      return {
        data: {
          ...state.data,
          services: [
            ...state.data.services,
            { ...serviceToDuplicate, id: generateId() },
          ],
        },
      };
    }),
  removeService: (id) =>
    set((state) => ({
      data: {
        ...state.data,
        services: state.data.services.filter((s) => s.id !== id),
      },
    })),
  setInvoiceData: (data) =>
    set({
      data: {
        ...data,
        theme: data.theme ?? DEFAULT_INVOICE_THEME,
        authorizedSignature: data.authorizedSignature ?? DEFAULT_AUTHORIZED_SIGNATURE,
      },
    }),
  syncCompanyContext: (context) =>
    set((state) => ({
      data: {
        ...state.data,
        companyId: context.companyId,
        ownerLogoUrl: context.companyDocumentLogoUrl,
        companyDocumentLogoUrl: context.companyDocumentLogoUrl,
        issuerName: context.issuerName,
        issuerEmail: context.issuerEmail,
        issuerPhone: context.issuerPhone,
        issuerPoBox: context.issuerPoBox,
        issuerStreetAddress: context.issuerStreetAddress,
        issuerStandNumber: context.issuerStandNumber,
        bankName: context.bankName,
        bankAccountHolder: context.bankAccountHolder,
        bankAccountNumber: context.bankAccountNumber,
        bankAccountType: context.bankAccountType,
        bankBranchCode: context.bankBranchCode,
      },
    })),
  saveInvoice: async () => {
    set({ isSaving: true });
    try {
      const { data } = get();
      const savedData = await apiRequest<InvoiceData & { id: string }>('/api/invoices', {
        method: 'POST',
        body: JSON.stringify(data),
      });

      set({ data: savedData });
      return savedData;
    } catch (error) {
      console.error('Error saving invoice:', error);
      throw error;
    } finally {
      set({ isSaving: false });
    }
  }
}));
