export type CompanyRole = 'owner' | 'admin' | 'member';
export type CompanyInvoiceRoleFilter = CompanyRole | 'all';

export type CompanyFormValues = {
  name: string;
  email: string;
  phone: string;
  poBox: string;
  streetAddress: string;
  standNumber: string;
  bankName: string;
  accountHolder: string;
  accountNumber: string;
  accountType: string;
  branchCode: string;
};

export type CompanySummary = {
  id: string;
  name: string;
  documentLogoUrl: string | null;
  membershipRole: CompanyRole;
  memberCount: number;
  createdAt: string;
  updatedAt: string;
};

export type ActiveCompanySummary = CompanySummary &
  CompanyFormValues & {
    permissions: {
      canEditCompany: boolean;
      canManageMembers: boolean;
      canAddMembers: boolean;
    };
  };

export type CompanyMember = {
  id: string;
  userId: string;
  name: string;
  email: string;
  image: string | null;
  membershipRole: CompanyRole;
  joinedAt: string;
  isCurrentUser: boolean;
  canChangeRole: boolean;
  canRemove: boolean;
};

export type AdminCompanySummary = {
  id: string;
  name: string;
  documentLogoUrl: string | null;
  memberCount: number;
  createdAt: string;
  updatedAt: string;
  createdByName: string | null;
};

export type CompaniesResponse = {
  companies: CompanySummary[];
  activeCompany: ActiveCompanySummary | null;
  isGlobalAdmin: boolean;
  allCompanies?: AdminCompanySummary[];
};

export type CompanyDetailResponse = {
  company: ActiveCompanySummary;
  members: CompanyMember[];
};

type LegacyCompanyResponseItem = Partial<CompanySummary> &
  Partial<CompanyFormValues> & {
    memberRole?: CompanyRole;
    membershipRole?: CompanyRole;
    permissions?: ActiveCompanySummary['permissions'];
    isActive?: boolean;
  };

function isCompanyRole(value: unknown): value is CompanyRole {
  return value === 'owner' || value === 'admin' || value === 'member';
}

function getNormalizedCompanyRole(value: unknown): CompanyRole {
  return isCompanyRole(value) ? value : 'member';
}

function getCompanyPermissions(isGlobalAdmin: boolean, membershipRole: CompanyRole) {
  const canEditCompany = isGlobalAdmin || membershipRole === 'owner' || membershipRole === 'admin';
  return {
    canEditCompany,
    canManageMembers: canEditCompany,
    canAddMembers: isGlobalAdmin,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function getString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function getNullableString(value: unknown) {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function getNumber(value: unknown, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function normalizeLegacyCompanySummary(item: LegacyCompanyResponseItem): CompanySummary {
  return {
    id: getString(item.id),
    name: getString(item.name),
    documentLogoUrl: getNullableString(item.documentLogoUrl),
    membershipRole: getNormalizedCompanyRole(item.membershipRole ?? item.memberRole),
    memberCount: getNumber(item.memberCount),
    createdAt: getString(item.createdAt),
    updatedAt: getString(item.updatedAt),
  };
}

function normalizeLegacyActiveCompany(
  item: LegacyCompanyResponseItem,
  isGlobalAdmin: boolean,
): ActiveCompanySummary {
  const summary = normalizeLegacyCompanySummary(item);
  return {
    ...summary,
    email: getString(item.email),
    phone: getString(item.phone),
    poBox: getString(item.poBox),
    streetAddress: getString(item.streetAddress),
    standNumber: getString(item.standNumber),
    bankName: getString(item.bankName),
    accountHolder: getString(item.accountHolder),
    accountNumber: getString(item.accountNumber),
    accountType: getString(item.accountType),
    branchCode: getString(item.branchCode),
    permissions:
      item.permissions ??
      getCompanyPermissions(isGlobalAdmin, summary.membershipRole),
  };
}

export function normalizeCompaniesResponse(
  value: unknown,
  fallbackIsGlobalAdmin = false,
): CompaniesResponse {
  if (Array.isArray(value)) {
    const companies = value
      .filter(isRecord)
      .map((item) => normalizeLegacyCompanySummary(item as LegacyCompanyResponseItem));
    const activeSource =
      value.find((item) => isRecord(item) && item.isActive === true) ??
      value.find(isRecord) ??
      null;

    return {
      companies,
      activeCompany: activeSource
        ? normalizeLegacyActiveCompany(activeSource as LegacyCompanyResponseItem, fallbackIsGlobalAdmin)
        : null,
      isGlobalAdmin: fallbackIsGlobalAdmin,
      allCompanies: fallbackIsGlobalAdmin
        ? companies.map((company) => ({
            id: company.id,
            name: company.name,
            documentLogoUrl: company.documentLogoUrl,
            memberCount: company.memberCount,
            createdAt: company.createdAt,
            updatedAt: company.updatedAt,
            createdByName: null,
          }))
        : undefined,
    };
  }

  if (isRecord(value)) {
    return {
      companies: Array.isArray(value.companies)
        ? value.companies.filter(isRecord).map((item) => normalizeLegacyCompanySummary(item))
        : [],
      activeCompany: isRecord(value.activeCompany)
        ? normalizeLegacyActiveCompany(value.activeCompany, fallbackIsGlobalAdmin)
        : null,
      isGlobalAdmin: typeof value.isGlobalAdmin === 'boolean' ? value.isGlobalAdmin : fallbackIsGlobalAdmin,
      allCompanies: Array.isArray(value.allCompanies)
        ? value.allCompanies
            .filter(isRecord)
            .map((item) => ({
              id: getString(item.id),
              name: getString(item.name),
              documentLogoUrl: getNullableString(item.documentLogoUrl),
              memberCount: getNumber(item.memberCount),
              createdAt: getString(item.createdAt),
              updatedAt: getString(item.updatedAt),
              createdByName: getNullableString(item.createdByName),
            }))
        : undefined,
    };
  }

  return {
    companies: [],
    activeCompany: null,
    isGlobalAdmin: fallbackIsGlobalAdmin,
  };
}

export function createEmptyCompanyFormValues(): CompanyFormValues {
  return {
    name: '',
    email: '',
    phone: '',
    poBox: '',
    streetAddress: '',
    standNumber: '',
    bankName: '',
    accountHolder: '',
    accountNumber: '',
    accountType: '',
    branchCode: '',
  };
}

export function getCompanyRoleLabel(role: CompanyRole) {
  if (role === 'owner') {
    return 'Owner';
  }

  if (role === 'admin') {
    return 'Admin';
  }

  return 'Member';
}

export function getCompanyInvoiceRoleFilterLabel(filter: CompanyInvoiceRoleFilter) {
  if (filter === 'all') {
    return 'All';
  }

  return getCompanyRoleLabel(filter);
}
