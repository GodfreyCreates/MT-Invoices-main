export const DEFAULT_INVOICE_THEME = 'legacy-indigo' as const;

export type InvoiceThemeId =
  | 'legacy-indigo'
  | 'emerald-slate'
  | 'amber-charcoal'
  | 'rose-plum'
  | 'ocean-steel'
  | 'black-white';

export type InvoiceTheme = {
  id: InvoiceThemeId;
  name: string;
  description: string;
  colors: {
    primary: string;
    secondary: string;
    accentText: string;
    accentSoft: string;
    accentBorder: string;
    surface: string;
    surfaceBorder: string;
    lineStrong: string;
    lineSoft: string;
    textStrong: string;
    textBody: string;
    textMuted: string;
    discount: string;
  };
};

export const invoiceThemes: InvoiceTheme[] = [
  {
    id: 'legacy-indigo',
    name: 'Legacy Indigo',
    description: 'Deep indigo and clean neutrals.',
    colors: {
      primary: '#1d4ed8',
      secondary: '#4f46e5',
      accentText: '#4338ca',
      accentSoft: '#e0e7ff',
      accentBorder: '#c7d2fe',
      surface: '#f8fafc',
      surfaceBorder: '#e2e8f0',
      lineStrong: '#0f172a',
      lineSoft: '#d1d5db',
      textStrong: '#0f172a',
      textBody: '#334155',
      textMuted: '#64748b',
      discount: '#dc2626',
    },
  },
  {
    id: 'emerald-slate',
    name: 'Emerald Slate',
    description: 'Fresh green accents with slate text.',
    colors: {
      primary: '#047857',
      secondary: '#0f766e',
      accentText: '#047857',
      accentSoft: '#d1fae5',
      accentBorder: '#a7f3d0',
      surface: '#f8fafc',
      surfaceBorder: '#dbe4ea',
      lineStrong: '#111827',
      lineSoft: '#d1d5db',
      textStrong: '#111827',
      textBody: '#334155',
      textMuted: '#64748b',
      discount: '#dc2626',
    },
  },
  {
    id: 'amber-charcoal',
    name: 'Amber Charcoal',
    description: 'Warm amber highlights on charcoal ink.',
    colors: {
      primary: '#b45309',
      secondary: '#d97706',
      accentText: '#b45309',
      accentSoft: '#fef3c7',
      accentBorder: '#fcd34d',
      surface: '#fffaf0',
      surfaceBorder: '#fde68a',
      lineStrong: '#1f2937',
      lineSoft: '#d6d3d1',
      textStrong: '#1f2937',
      textBody: '#44403c',
      textMuted: '#78716c',
      discount: '#dc2626',
    },
  },
  {
    id: 'rose-plum',
    name: 'Rose Plum',
    description: 'Elegant rose tones with plum accents.',
    colors: {
      primary: '#be185d',
      secondary: '#7e22ce',
      accentText: '#9d174d',
      accentSoft: '#fce7f3',
      accentBorder: '#f9a8d4',
      surface: '#fff7fb',
      surfaceBorder: '#f5d0e6',
      lineStrong: '#312e81',
      lineSoft: '#e5d5ff',
      textStrong: '#312e81',
      textBody: '#4c1d95',
      textMuted: '#7c3aed',
      discount: '#dc2626',
    },
  },
  {
    id: 'ocean-steel',
    name: 'Ocean Steel',
    description: 'Calm blue-green accents with steel neutrals.',
    colors: {
      primary: '#0f766e',
      secondary: '#0369a1',
      accentText: '#0369a1',
      accentSoft: '#cffafe',
      accentBorder: '#a5f3fc',
      surface: '#f4fbfd',
      surfaceBorder: '#cbd5e1',
      lineStrong: '#164e63',
      lineSoft: '#cbd5e1',
      textStrong: '#164e63',
      textBody: '#334155',
      textMuted: '#64748b',
      discount: '#dc2626',
    },
  },
  {
    id: 'black-white',
    name: 'Black & White',
    description: 'Sharp monochrome ink with soft gray surfaces.',
    colors: {
      primary: '#111111',
      secondary: '#404040',
      accentText: '#111111',
      accentSoft: '#f5f5f5',
      accentBorder: '#d4d4d4',
      surface: '#fafafa',
      surfaceBorder: '#e5e5e5',
      lineStrong: '#111111',
      lineSoft: '#d4d4d4',
      textStrong: '#111111',
      textBody: '#404040',
      textMuted: '#737373',
      discount: '#b91c1c',
    },
  },
];

export function isInvoiceThemeId(value: string): value is InvoiceThemeId {
  return invoiceThemes.some((theme) => theme.id === value);
}

export function getInvoiceTheme(themeId?: string | null) {
  return invoiceThemes.find((theme) => theme.id === themeId) ?? invoiceThemes[0];
}
