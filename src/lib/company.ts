export type CompanyRole = 'owner' | 'admin' | 'member';

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
