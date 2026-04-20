import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { createAdminClient, HttpError, requireAuthUser, syncAppUser } from '../_shared/auth.ts';

const APP_STORAGE_BUCKET = 'app-images';
const HEALTH_CHECK_TIMEOUT_MS = 4_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_INVOICE_THEMES = new Set([
  'legacy-indigo',
  'emerald-slate',
  'amber-charcoal',
  'rose-plum',
  'ocean-steel',
  'black-white',
]);

type CompanyRole = 'owner' | 'admin' | 'member';
type CompanyRecord = {
  id: string;
  name: string;
  email: string;
  phone: string;
  poBox: string | null;
  streetAddress: string;
  standNumber: string | null;
  documentLogoUrl: string | null;
  documentLogoKey: string | null;
  bankName: string;
  accountHolder: string;
  accountNumber: string;
  accountType: string;
  branchCode: string;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string | null;
};
type CompanyAccessMembership = {
  id: string;
  role: CompanyRole;
  companyId: string;
  company: CompanyRecord;
};
type CompanyAccessContext = {
  userId: string;
  isGlobalAdmin: boolean;
  memberships: CompanyAccessMembership[];
  memberCounts: Map<string, number>;
  activeMembership: CompanyAccessMembership | null;
};
type SessionRecord = {
  user: {
    id: string;
    role: string;
  };
  sessionId: string | null;
};
type SessionListItem = {
  id: string;
  createdAt: string | null;
  updatedAt: string | null;
  expiresAt: string | null;
  userAgent: string | null;
  ipAddress: string | null;
};
type CompanyMemberPermissions = {
  canChangeRole: boolean;
  canRemove: boolean;
};
type CompanyFormPayload = {
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
type SavedClientPayload = {
  id?: string;
  clientCompanyName: string;
  clientEmail: string;
  clientPhone: string;
  clientStreet: string;
  clientHouseNumber: string;
  clientCity: string;
  clientPostalCode: string;
};
type InvoiceServicePayload = {
  date: string;
  sender: string;
  receiver: string;
  reference: string;
  service: string;
  quantity: string;
  unitPrice: string;
  discountPercent: string;
  taxPercent: string;
};
type InvoicePayload = {
  id?: string;
  savedClientId?: string | null;
  clientCompanyName: string;
  clientEmail: string;
  clientPhone: string;
  clientStreet: string;
  clientHouseNumber: string;
  clientCity: string;
  clientPostalCode: string;
  invoiceNo: string;
  issueDate: string;
  dueDate: string;
  paymentTerms: string;
  theme: string;
  notes: string | null;
  authorizedSignature: string;
  services: InvoiceServicePayload[];
};

let cachedAdminClient: ReturnType<typeof createAdminClient> | null = null;

function getAdminClient() {
  if (!cachedAdminClient) {
    cachedAdminClient = createAdminClient();
  }

  return cachedAdminClient;
}

function responseHeaders(contentType = 'application/json') {
  return {
    ...corsHeaders,
    'Content-Type': contentType,
  };
}

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders(),
  });
}

function emptyResponse(status = 204) {
  return new Response(null, {
    status,
    headers: corsHeaders,
  });
}

function serializeTimestamp(value: string | null | undefined) {
  return typeof value === 'string' && value.trim() ? value : null;
}

function requireUuid(value: string | null | undefined, field: string) {
  if (!value || !UUID_PATTERN.test(value.trim())) {
    throw new HttpError(400, `${field} must be a valid UUID`);
  }

  return value.trim();
}

function getTrimmedString(value: unknown, field: string, maxLength = 500) {
  if (typeof value !== 'string') {
    throw new HttpError(400, `${field} is required`);
  }

  const trimmed = value.trim();
  if (!trimmed) {
    throw new HttpError(400, `${field} is required`);
  }

  if (trimmed.length > maxLength) {
    throw new HttpError(400, `${field} is too long`);
  }

  return trimmed;
}

function getOptionalTrimmedString(value: unknown, field: string, maxLength = 500) {
  if (value == null || value === '') {
    return null;
  }

  return getTrimmedString(value, field, maxLength);
}

function getEmail(value: unknown, field: string) {
  const email = getTrimmedString(value, field, 320).toLowerCase();
  if (!EMAIL_PATTERN.test(email)) {
    throw new HttpError(400, `${field} must be a valid email address`);
  }

  return email;
}

function getDateString(value: unknown, field: string) {
  const dateValue = getTrimmedString(value, field, 10);
  if (!DATE_PATTERN.test(dateValue)) {
    throw new HttpError(400, `${field} must use YYYY-MM-DD format`);
  }

  return dateValue;
}

function getDecimalString(value: unknown, field: string, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const numericValue =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value)
        : Number.NaN;

  if (!Number.isFinite(numericValue)) {
    throw new HttpError(400, `${field} must be a valid number`);
  }

  if (numericValue < min || numericValue > max) {
    throw new HttpError(400, `${field} must be between ${min} and ${max}`);
  }

  return numericValue.toString();
}

function isCompanyRole(value: string): value is CompanyRole {
  return value === 'owner' || value === 'admin' || value === 'member';
}

function getCompanyRole(value: unknown, field: string, defaultValue?: CompanyRole): CompanyRole {
  if (value == null || value === '') {
    if (defaultValue) {
      return defaultValue;
    }

    throw new HttpError(400, `${field} is required`);
  }

  if (typeof value !== 'string') {
    throw new HttpError(400, `${field} must be a string`);
  }

  const normalized = value.trim().toLowerCase();
  if (!isCompanyRole(normalized)) {
    throw new HttpError(400, `${field} must be owner, admin, or member`);
  }

  return normalized;
}

function getDashboardInvoiceRoleFilter(value: unknown, defaultValue: CompanyRole): CompanyRole {
  if (value == null || value === '') {
    return defaultValue;
  }

  if (typeof value !== 'string') {
    throw new HttpError(400, 'roleFilter must be a string');
  }

  const normalized = value.trim().toLowerCase();
  if (!isCompanyRole(normalized)) {
    throw new HttpError(400, 'roleFilter must be owner, admin, or member');
  }

  return normalized;
}

function getRecord(value: unknown, field: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(400, `${field} must be an object`);
  }

  return value as Record<string, unknown>;
}

function getOptionalUuidValue(value: unknown, field: string) {
  if (value == null || value === '') {
    return null;
  }

  if (typeof value !== 'string') {
    throw new HttpError(400, `${field} must be a string`);
  }

  return requireUuid(value.trim(), field);
}

function getInvoiceThemeValue(value: unknown, field: string) {
  if (value == null || value === '') {
    return 'legacy-indigo';
  }

  if (typeof value !== 'string') {
    throw new HttpError(400, `${field} must be a string`);
  }

  const normalized = value.trim();
  if (!VALID_INVOICE_THEMES.has(normalized)) {
    throw new HttpError(400, `${field} must be a supported invoice theme`);
  }

  return normalized;
}

function parseCompanyInput(value: unknown): CompanyFormPayload {
  const payload = getRecord(value, 'request body');

  return {
    name: getTrimmedString(payload.name, 'name', 160),
    email: getEmail(payload.email, 'email'),
    phone: getTrimmedString(payload.phone, 'phone', 80),
    poBox: getOptionalTrimmedString(payload.poBox, 'poBox', 80) ?? '',
    streetAddress: getTrimmedString(payload.streetAddress, 'streetAddress', 240),
    standNumber: getOptionalTrimmedString(payload.standNumber, 'standNumber', 80) ?? '',
    bankName: getTrimmedString(payload.bankName, 'bankName', 160),
    accountHolder: getTrimmedString(payload.accountHolder, 'accountHolder', 160),
    accountNumber: getTrimmedString(payload.accountNumber, 'accountNumber', 80),
    accountType: getTrimmedString(payload.accountType, 'accountType', 80),
    branchCode: getTrimmedString(payload.branchCode, 'branchCode', 40),
  };
}

function parseSavedClientInput(value: unknown): SavedClientPayload {
  const payload = getRecord(value, 'request body');

  return {
    id: getOptionalUuidValue(payload.id, 'id') ?? undefined,
    clientCompanyName: getTrimmedString(payload.clientCompanyName, 'clientCompanyName', 200),
    clientEmail: getEmail(payload.clientEmail, 'clientEmail'),
    clientPhone: getTrimmedString(payload.clientPhone, 'clientPhone', 50),
    clientStreet: getTrimmedString(payload.clientStreet, 'clientStreet', 200),
    clientHouseNumber: getTrimmedString(payload.clientHouseNumber, 'clientHouseNumber', 100),
    clientCity: getTrimmedString(payload.clientCity, 'clientCity', 120),
    clientPostalCode: getTrimmedString(payload.clientPostalCode, 'clientPostalCode', 20),
  };
}

function parseServiceInput(value: unknown, index: number): InvoiceServicePayload {
  const service = getRecord(value, `services[${index}]`);

  return {
    date: getDateString(service.date, `services[${index}].date`),
    sender: getTrimmedString(service.sender, `services[${index}].sender`, 200),
    receiver: getTrimmedString(service.receiver, `services[${index}].receiver`, 200),
    reference: getTrimmedString(service.reference, `services[${index}].reference`, 100),
    service: getTrimmedString(service.service, `services[${index}].service`, 200),
    quantity: getDecimalString(service.quantity, `services[${index}].quantity`),
    unitPrice: getDecimalString(service.unitPrice, `services[${index}].unitPrice`),
    discountPercent: getDecimalString(service.discountPercent, `services[${index}].discountPercent`, 0, 100),
    taxPercent: getDecimalString(service.taxPercent, `services[${index}].taxPercent`, 0, 100),
  };
}

function parseInvoiceInput(value: unknown): InvoicePayload {
  const payload = getRecord(value, 'request body');
  const rawServices = payload.services;

  if (!Array.isArray(rawServices)) {
    throw new HttpError(400, 'services must be an array');
  }

  return {
    id: getOptionalUuidValue(payload.id, 'Invoice id') ?? undefined,
    savedClientId: getOptionalUuidValue(payload.savedClientId, 'savedClientId'),
    clientCompanyName: getTrimmedString(payload.clientCompanyName, 'clientCompanyName', 200),
    clientEmail: getEmail(payload.clientEmail, 'clientEmail'),
    clientPhone: getTrimmedString(payload.clientPhone, 'clientPhone', 50),
    clientStreet: getTrimmedString(payload.clientStreet, 'clientStreet', 200),
    clientHouseNumber: getTrimmedString(payload.clientHouseNumber, 'clientHouseNumber', 100),
    clientCity: getTrimmedString(payload.clientCity, 'clientCity', 120),
    clientPostalCode: getTrimmedString(payload.clientPostalCode, 'clientPostalCode', 20),
    invoiceNo: getTrimmedString(payload.invoiceNo, 'invoiceNo', 100),
    issueDate: getDateString(payload.issueDate, 'issueDate'),
    dueDate: getDateString(payload.dueDate, 'dueDate'),
    paymentTerms: getTrimmedString(payload.paymentTerms, 'paymentTerms', 100),
    theme: getInvoiceThemeValue(payload.theme, 'theme'),
    notes: getOptionalTrimmedString(payload.notes, 'notes', 5_000),
    authorizedSignature: getTrimmedString(payload.authorizedSignature, 'authorizedSignature', 120),
    services: rawServices.map((service, index) => parseServiceInput(service, index)),
  };
}

function getSessionIdFromAccessToken(authorization: string) {
  const token = authorization.replace(/^Bearer\s+/i, '').trim();
  const [, payloadSegment] = token.split('.');
  if (!payloadSegment) {
    return null;
  }

  try {
    const normalized = payloadSegment.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='));
    const payload = JSON.parse(decoded) as Record<string, unknown>;
    return typeof payload.session_id === 'string' ? payload.session_id : null;
  } catch {
    return null;
  }
}

function canEditCompany(isGlobalAdmin: boolean, membershipRole: CompanyRole | null) {
  return isGlobalAdmin || membershipRole === 'owner' || membershipRole === 'admin';
}

function canManageCompanyMembers(isGlobalAdmin: boolean, membershipRole: CompanyRole | null) {
  return isGlobalAdmin || membershipRole === 'owner' || membershipRole === 'admin';
}

function canManageCompanyInvoices(isGlobalAdmin: boolean, membershipRole: CompanyRole | null) {
  return isGlobalAdmin || membershipRole === 'owner' || membershipRole === 'admin';
}

function getCompanyPermissions(isGlobalAdmin: boolean, membershipRole: CompanyRole | null) {
  return {
    canEditCompany: canEditCompany(isGlobalAdmin, membershipRole),
    canManageMembers: canManageCompanyMembers(isGlobalAdmin, membershipRole),
    canAddMembers: isGlobalAdmin,
  };
}

function getCompanyRoleRank(role: CompanyRole) {
  if (role === 'owner') return 0;
  if (role === 'admin') return 1;
  return 2;
}

function getMembershipMutationPermissions({
  actorIsGlobalAdmin,
  actorRole,
  targetRole,
  ownerCount,
}: {
  actorIsGlobalAdmin: boolean;
  actorRole: CompanyRole | null;
  targetRole: CompanyRole;
  ownerCount: number;
}): CompanyMemberPermissions {
  if (!canManageCompanyMembers(actorIsGlobalAdmin, actorRole)) {
    return { canChangeRole: false, canRemove: false };
  }

  if (!actorIsGlobalAdmin && actorRole === 'admin' && targetRole === 'owner') {
    return { canChangeRole: false, canRemove: false };
  }

  const isLastOwner = targetRole === 'owner' && ownerCount <= 1;
  return {
    canChangeRole: !isLastOwner,
    canRemove: !isLastOwner,
  };
}

async function withTimeout<T>(work: Promise<T>, message: string) {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new HttpError(500, message)), HEALTH_CHECK_TIMEOUT_MS),
  );

  return await Promise.race([work, timeout]);
}

function normalizePathname(pathname: string) {
  if (!pathname || pathname === '/') {
    return '/';
  }

  return pathname.replace(/\/+$/, '') || '/';
}

async function getRequestTarget(req: Request) {
  const url = new URL(req.url);
  const rawPath = url.searchParams.get('path')?.trim();
  if (rawPath) {
    return new URL(rawPath, 'https://app-api.local');
  }

  return url;
}

async function readJsonBody(req: Request) {
  const bodyText = await req.text();
  if (!bodyText.trim()) {
    return {};
  }

  try {
    return JSON.parse(bodyText) as unknown;
  } catch {
    throw new HttpError(400, 'Invalid JSON payload');
  }
}

async function requireSession(req: Request): Promise<SessionRecord> {
  const { authorization, user } = await requireAuthUser(req);
  const profile = await syncAppUser(user);
  return {
    user: {
      id: profile.id,
      role: profile.role,
    },
    sessionId: getSessionIdFromAccessToken(authorization),
  };
}

function isAdminSession(session: SessionRecord) {
  return session.user.role === 'admin';
}

function mapCompanyRecord(row: Record<string, unknown>): CompanyRecord {
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    email: String(row.email ?? ''),
    phone: String(row.phone ?? ''),
    poBox: row.po_box ? String(row.po_box) : null,
    streetAddress: String(row.street_address ?? ''),
    standNumber: row.stand_number ? String(row.stand_number) : null,
    documentLogoUrl: row.document_logo_url ? String(row.document_logo_url) : null,
    documentLogoKey: row.document_logo_key ? String(row.document_logo_key) : null,
    bankName: String(row.bank_name ?? ''),
    accountHolder: String(row.account_holder ?? ''),
    accountNumber: String(row.account_number ?? ''),
    accountType: String(row.account_type ?? ''),
    branchCode: String(row.branch_code ?? ''),
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? ''),
    createdByUserId: row.created_by_user_id ? String(row.created_by_user_id) : null,
  };
}

async function setUserActiveCompany(userId: string, companyId: string | null) {
  const admin = getAdminClient();
  const { error } = await admin
    .from('user')
    .update({
      active_company_id: companyId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);

  if (error) {
    throw new HttpError(500, error.message);
  }
}

async function queryCompanyAccessContext(userId: string): Promise<CompanyAccessContext> {
  const admin = getAdminClient();
  const { data: currentUser, error: currentUserError } = await admin
    .from('user')
    .select('role, active_company_id')
    .eq('id', userId)
    .maybeSingle();

  if (currentUserError) {
    throw new HttpError(500, currentUserError.message);
  }

  if (!currentUser) {
    throw new HttpError(404, 'User profile not found');
  }

  const { data: membershipRows, error: membershipsError } = await admin
    .from('company_memberships')
    .select('id, role, company_id')
    .eq('user_id', userId);

  if (membershipsError) {
    throw new HttpError(500, membershipsError.message);
  }

  const companyIds = Array.from(
    new Set((membershipRows ?? []).map((membership) => String(membership.company_id))),
  );

  const companyById = new Map<string, CompanyRecord>();
  if (companyIds.length > 0) {
    const { data: companyRows, error: companiesError } = await admin
      .from('companies')
      .select('*')
      .in('id', companyIds);

    if (companiesError) {
      throw new HttpError(500, companiesError.message);
    }

    for (const companyRow of companyRows ?? []) {
      const company = mapCompanyRecord(companyRow as Record<string, unknown>);
      companyById.set(company.id, company);
    }
  }

  const memberships = (membershipRows ?? [])
    .map((membershipRow) => {
      const companyId = String(membershipRow.company_id);
      const company = companyById.get(companyId);
      if (!company) {
        return null;
      }

      return {
        id: String(membershipRow.id),
        role: getCompanyRole(membershipRow.role, 'role'),
        companyId,
        company,
      } satisfies CompanyAccessMembership;
    })
    .filter((membership): membership is CompanyAccessMembership => Boolean(membership))
    .sort((left, right) => left.company.name.localeCompare(right.company.name));

  const memberCounts = new Map<string, number>();
  if (companyIds.length > 0) {
    const { data: memberCountRows, error: memberCountsError } = await admin
      .from('company_memberships')
      .select('company_id')
      .in('company_id', companyIds);

    if (memberCountsError) {
      throw new HttpError(500, memberCountsError.message);
    }

    for (const row of memberCountRows ?? []) {
      const companyId = String(row.company_id);
      memberCounts.set(companyId, (memberCounts.get(companyId) ?? 0) + 1);
    }
  }

  const activeMembership =
    memberships.find((membership) => membership.companyId === currentUser.active_company_id) ??
    memberships[0] ??
    null;
  const nextActiveCompanyId = activeMembership?.companyId ?? null;

  if ((currentUser.active_company_id ?? null) !== nextActiveCompanyId) {
    await setUserActiveCompany(userId, nextActiveCompanyId);
  }

  return {
    userId,
    isGlobalAdmin: (currentUser.role ?? 'user') === 'admin',
    memberships,
    memberCounts,
    activeMembership,
  };
}

async function requireActiveCompanyAccess(userId: string) {
  const access = await queryCompanyAccessContext(userId);
  if (!access.activeMembership) {
    throw new HttpError(409, 'Create a company to continue');
  }

  return access;
}

function serializeCompanySummary(
  membership: CompanyAccessMembership,
  memberCounts: Map<string, number>,
) {
  return {
    id: membership.company.id,
    name: membership.company.name,
    documentLogoUrl: membership.company.documentLogoUrl ?? null,
    membershipRole: membership.role,
    memberCount: memberCounts.get(membership.companyId) ?? 0,
    createdAt: membership.company.createdAt,
    updatedAt: membership.company.updatedAt,
  };
}

function serializeActiveCompany(
  membership: CompanyAccessMembership,
  memberCounts: Map<string, number>,
  isGlobalAdmin: boolean,
) {
  return {
    ...serializeCompanySummary(membership, memberCounts),
    email: membership.company.email,
    phone: membership.company.phone,
    poBox: membership.company.poBox ?? '',
    streetAddress: membership.company.streetAddress,
    standNumber: membership.company.standNumber ?? '',
    bankName: membership.company.bankName,
    accountHolder: membership.company.accountHolder,
    accountNumber: membership.company.accountNumber,
    accountType: membership.company.accountType,
    branchCode: membership.company.branchCode,
    permissions: getCompanyPermissions(isGlobalAdmin, membership.role),
  };
}

function serializeStandaloneCompany(
  company: CompanyRecord,
  memberCount: number,
  isGlobalAdmin: boolean,
  membershipRole: CompanyRole | null,
) {
  return {
    id: company.id,
    name: company.name,
    documentLogoUrl: company.documentLogoUrl ?? null,
    membershipRole: membershipRole ?? 'admin',
    memberCount,
    createdAt: company.createdAt,
    updatedAt: company.updatedAt,
    email: company.email,
    phone: company.phone,
    poBox: company.poBox ?? '',
    streetAddress: company.streetAddress,
    standNumber: company.standNumber ?? '',
    bankName: company.bankName,
    accountHolder: company.accountHolder,
    accountNumber: company.accountNumber,
    accountType: company.accountType,
    branchCode: company.branchCode,
    permissions: getCompanyPermissions(isGlobalAdmin, membershipRole),
  };
}

async function buildCompaniesResponse(userId: string) {
  const admin = getAdminClient();
  const access = await queryCompanyAccessContext(userId);
  const response = {
    companies: access.memberships.map((membership) =>
      serializeCompanySummary(membership, access.memberCounts),
    ),
    activeCompany: access.activeMembership
      ? serializeActiveCompany(access.activeMembership, access.memberCounts, access.isGlobalAdmin)
      : null,
    isGlobalAdmin: access.isGlobalAdmin,
  } as {
    companies: ReturnType<typeof serializeCompanySummary>[];
    activeCompany: ReturnType<typeof serializeActiveCompany> | null;
    isGlobalAdmin: boolean;
    allCompanies?: Array<{
      id: string;
      name: string;
      documentLogoUrl: string | null;
      memberCount: number;
      createdAt: string;
      updatedAt: string;
      createdByName: string | null;
    }>;
  };

  if (!access.isGlobalAdmin) {
    return response;
  }

  const [{ data: allCompanyRows, error: allCompaniesError }, { data: allMembershipRows, error: allMembershipsError }] =
    await Promise.all([
      admin
        .from('companies')
        .select('*')
        .order('updated_at', { ascending: false })
        .order('created_at', { ascending: false }),
      admin.from('company_memberships').select('company_id'),
    ]);

  if (allCompaniesError) {
    throw new HttpError(500, allCompaniesError.message);
  }

  if (allMembershipsError) {
    throw new HttpError(500, allMembershipsError.message);
  }

  const creatorIds = Array.from(
    new Set(
      (allCompanyRows ?? [])
        .map((companyRow) => companyRow.created_by_user_id)
        .filter((creatorId): creatorId is string => typeof creatorId === 'string' && creatorId.length > 0),
    ),
  );
  const creatorNameById = new Map<string, string | null>();

  if (creatorIds.length > 0) {
    const { data: creatorRows, error: creatorsError } = await admin
      .from('user')
      .select('id, name')
      .in('id', creatorIds);

    if (creatorsError) {
      throw new HttpError(500, creatorsError.message);
    }

    for (const creatorRow of creatorRows ?? []) {
      creatorNameById.set(String(creatorRow.id), creatorRow.name ? String(creatorRow.name) : null);
    }
  }

  const globalMemberCounts = new Map<string, number>();
  for (const membershipRow of allMembershipRows ?? []) {
    const companyId = String(membershipRow.company_id);
    globalMemberCounts.set(companyId, (globalMemberCounts.get(companyId) ?? 0) + 1);
  }

  response.allCompanies = (allCompanyRows ?? []).map((companyRow) => {
    const company = mapCompanyRecord(companyRow as Record<string, unknown>);
    return {
      id: company.id,
      name: company.name,
      documentLogoUrl: company.documentLogoUrl ?? null,
      memberCount: globalMemberCounts.get(company.id) ?? 0,
      createdAt: company.createdAt,
      updatedAt: company.updatedAt,
      createdByName: company.createdByUserId ? creatorNameById.get(company.createdByUserId) ?? null : null,
    };
  });

  return response;
}

async function getCompanyMembershipActionContext(
  userId: string,
  companyId: string,
  membershipId: string,
) {
  const admin = getAdminClient();
  const access = await queryCompanyAccessContext(userId);
  const viewerMembership =
    access.memberships.find((membership) => membership.companyId === companyId) ?? null;

  if (!access.isGlobalAdmin && !viewerMembership) {
    throw new HttpError(403, 'You do not have access to this company');
  }

  const { data: membershipRows, error: membershipsError } = await admin
    .from('company_memberships')
    .select('id, user_id, role')
    .eq('company_id', companyId);

  if (membershipsError) {
    throw new HttpError(500, membershipsError.message);
  }

  const targetMembership = (membershipRows ?? []).find(
    (membership) => String(membership.id) === membershipId,
  );
  if (!targetMembership) {
    throw new HttpError(404, 'Membership not found');
  }

  const ownerCount = (membershipRows ?? []).filter((membership) => membership.role === 'owner').length;
  const permissions = getMembershipMutationPermissions({
    actorIsGlobalAdmin: access.isGlobalAdmin,
    actorRole: viewerMembership?.role ?? null,
    targetRole: getCompanyRole(targetMembership.role, 'role'),
    ownerCount,
  });

  return {
    access,
    viewerMembership,
    targetMembership: {
      id: String(targetMembership.id),
      userId: String(targetMembership.user_id),
      role: getCompanyRole(targetMembership.role, 'role'),
    },
    permissions,
  };
}

async function getCompanyDetailResponse(userId: string, companyId: string) {
  const admin = getAdminClient();
  const access = await queryCompanyAccessContext(userId);
  const viewerMembership =
    access.memberships.find((membership) => membership.companyId === companyId) ?? null;

  if (!access.isGlobalAdmin && !viewerMembership) {
    throw new HttpError(403, 'You do not have access to this company');
  }

  let companyRecord = viewerMembership?.company ?? null;
  if (!companyRecord) {
    const { data: companyRow, error: companyError } = await admin
      .from('companies')
      .select('*')
      .eq('id', companyId)
      .maybeSingle();

    if (companyError) {
      throw new HttpError(500, companyError.message);
    }

    if (!companyRow) {
      throw new HttpError(404, 'Company not found');
    }

    companyRecord = mapCompanyRecord(companyRow as Record<string, unknown>);
  }

  const { data: membershipRows, error: membershipsError } = await admin
    .from('company_memberships')
    .select('id, user_id, role, created_at')
    .eq('company_id', companyId);

  if (membershipsError) {
    throw new HttpError(500, membershipsError.message);
  }

  const userIds = Array.from(
    new Set((membershipRows ?? []).map((membership) => String(membership.user_id))),
  );
  const { data: userRows, error: usersError } = userIds.length > 0
    ? await admin.from('user').select('id, name, email, image').in('id', userIds)
    : { data: [], error: null };

  if (usersError) {
    throw new HttpError(500, usersError.message);
  }

  const userById = new Map(
    (userRows ?? []).map((userRow) => [String(userRow.id), userRow] as const),
  );

  const ownerCount = (membershipRows ?? []).filter((membership) => membership.role === 'owner').length;
  const actorRole = viewerMembership?.role ?? null;
  const memberCount = (membershipRows ?? []).length;

  const members = (membershipRows ?? [])
    .map((membershipRow) => {
      const memberUser = userById.get(String(membershipRow.user_id));
      if (!memberUser) {
        return null;
      }

      const membershipRole = getCompanyRole(membershipRow.role, 'role');
      const permissions = getMembershipMutationPermissions({
        actorIsGlobalAdmin: access.isGlobalAdmin,
        actorRole,
        targetRole: membershipRole,
        ownerCount,
      });

      return {
        id: String(membershipRow.id),
        userId: String(membershipRow.user_id),
        name: String(memberUser.name ?? ''),
        email: String(memberUser.email ?? ''),
        image: memberUser.image ? String(memberUser.image) : null,
        membershipRole,
        joinedAt: String(membershipRow.created_at ?? ''),
        isCurrentUser: String(membershipRow.user_id) === userId,
        canChangeRole: permissions.canChangeRole,
        canRemove: permissions.canRemove,
      };
    })
    .filter((member): member is NonNullable<typeof member> => Boolean(member))
    .sort((left, right) => {
      const roleComparison =
        getCompanyRoleRank(left.membershipRole) - getCompanyRoleRank(right.membershipRole);
      if (roleComparison !== 0) {
        return roleComparison;
      }

      return left.name.localeCompare(right.name);
    });

  return {
    company: serializeStandaloneCompany(companyRecord, memberCount, access.isGlobalAdmin, actorRole),
    members,
  };
}

async function deleteImageFromStorage(objectPath: string) {
  const admin = getAdminClient();
  const { error } = await admin.storage.from(APP_STORAGE_BUCKET).remove([objectPath]);

  if (error && !/not found/i.test(error.message)) {
    throw new HttpError(500, error.message);
  }
}

async function removeUserLogo(userId: string, logoKind: 'site' | 'document') {
  const admin = getAdminClient();
  const { data: currentUser, error: currentUserError } = await admin
    .from('user')
    .select('site_logo_key, document_logo_key')
    .eq('id', userId)
    .maybeSingle();

  if (currentUserError) {
    throw new HttpError(500, currentUserError.message);
  }

  const { error: updateError } = await admin
    .from('user')
    .update(
      logoKind === 'site'
        ? { site_logo_key: null, site_logo_url: null, updated_at: new Date().toISOString() }
        : { document_logo_key: null, document_logo_url: null, updated_at: new Date().toISOString() },
    )
    .eq('id', userId);

  if (updateError) {
    throw new HttpError(500, updateError.message);
  }

  const objectPath =
    logoKind === 'site' ? currentUser?.site_logo_key : currentUser?.document_logo_key;
  if (objectPath) {
    try {
      await deleteImageFromStorage(String(objectPath));
    } catch (error) {
      console.error('Failed to delete logo from Supabase Storage', error);
    }
  }
}

async function removeCompanyDocumentLogo(companyId: string) {
  const admin = getAdminClient();
  const { data: currentCompany, error: companyError } = await admin
    .from('companies')
    .select('document_logo_key')
    .eq('id', companyId)
    .maybeSingle();

  if (companyError) {
    throw new HttpError(500, companyError.message);
  }

  const { error: updateError } = await admin
    .from('companies')
    .update({
      document_logo_key: null,
      document_logo_url: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', companyId);

  if (updateError) {
    throw new HttpError(500, updateError.message);
  }

  if (currentCompany?.document_logo_key) {
    try {
      await deleteImageFromStorage(String(currentCompany.document_logo_key));
    } catch (error) {
      console.error('Failed to delete company logo from Supabase Storage', error);
    }
  }
}

async function listAuthSessions(userId: string): Promise<SessionListItem[]> {
  const admin = getAdminClient();
  const { data, error } = await admin.rpc('app_list_auth_sessions', {
    target_user_id: userId,
  });

  if (error) {
    throw new HttpError(500, error.message);
  }

  return (data ?? [])
    .map((row) => ({
      id: String(row.id),
      createdAt: serializeTimestamp(row.created_at ? String(row.created_at) : null),
      updatedAt: serializeTimestamp(
        row.refreshed_at
          ? String(row.refreshed_at)
          : row.updated_at
            ? String(row.updated_at)
            : row.created_at
              ? String(row.created_at)
              : null,
      ),
      expiresAt: serializeTimestamp(row.not_after ? String(row.not_after) : null),
      userAgent: row.user_agent ? String(row.user_agent) : null,
      ipAddress: row.ip ? String(row.ip) : null,
    }))
    .sort((left, right) => {
      const leftTime = new Date(left.updatedAt ?? left.createdAt ?? 0).getTime();
      const rightTime = new Date(right.updatedAt ?? right.createdAt ?? 0).getTime();
      return rightTime - leftTime;
    });
}

async function deleteAuthSession(userId: string, sessionId: string) {
  const admin = getAdminClient();
  const { data, error } = await admin.rpc('app_delete_auth_session', {
    target_user_id: userId,
    target_session_id: sessionId,
  });

  if (error) {
    throw new HttpError(500, error.message);
  }

  return Boolean(data);
}

async function deleteOtherAuthSessions(userId: string, currentSessionId: string | null) {
  if (!currentSessionId) {
    return;
  }

  const admin = getAdminClient();
  const { error } = await admin.rpc('app_delete_other_auth_sessions', {
    target_user_id: userId,
    current_session_id: currentSessionId,
  });

  if (error) {
    throw new HttpError(500, error.message);
  }
}

async function deleteAllAuthSessions(userId: string) {
  const admin = getAdminClient();
  const { error } = await admin.rpc('app_delete_all_auth_sessions', {
    target_user_id: userId,
  });

  if (error) {
    throw new HttpError(500, error.message);
  }
}

async function deleteUserAccount(targetUserId: string) {
  const admin = getAdminClient();
  const { data: targetUser, error: targetUserError } = await admin
    .from('user')
    .select('id, site_logo_key, document_logo_key, company_logo_key')
    .eq('id', targetUserId)
    .maybeSingle();

  if (targetUserError) {
    throw new HttpError(500, targetUserError.message);
  }

  if (!targetUser) {
    throw new HttpError(404, 'User not found');
  }

  await deleteAllAuthSessions(targetUserId);

  for (const storageKey of [
    targetUser.site_logo_key,
    targetUser.document_logo_key,
    targetUser.company_logo_key,
  ]) {
    if (!storageKey) {
      continue;
    }

    try {
      await deleteImageFromStorage(String(storageKey));
    } catch (error) {
      console.error('Failed to delete user-owned storage object', error);
    }
  }

  const { error: deleteAuthError } = await admin.auth.admin.deleteUser(targetUserId);
  if (deleteAuthError) {
    throw new HttpError(500, deleteAuthError.message);
  }

  const { error: deleteProfileError } = await admin.from('user').delete().eq('id', targetUserId);
  if (deleteProfileError) {
    throw new HttpError(500, deleteProfileError.message);
  }
}

function getInvoiceAccessScope(access: CompanyAccessContext) {
  if (!access.activeMembership) {
    throw new HttpError(409, 'Create a company to continue');
  }

  return {
    companyId: access.activeMembership.companyId,
    userId: access.userId,
    membershipRole: access.activeMembership.role,
    canManageInvoices: canManageCompanyInvoices(access.isGlobalAdmin, access.activeMembership.role),
  };
}

async function resolveDashboardInvoiceScope(access: CompanyAccessContext, requestedRoleFilter: unknown) {
  const admin = getAdminClient();
  const invoiceAccess = getInvoiceAccessScope(access);
  const appliedRoleFilter = getDashboardInvoiceRoleFilter(
    requestedRoleFilter,
    invoiceAccess.membershipRole,
  );

  if (!invoiceAccess.canManageInvoices || appliedRoleFilter === invoiceAccess.membershipRole) {
    return {
      appliedRoleFilter,
      userIds: [invoiceAccess.userId],
    };
  }

  const { data: membershipRows, error: membershipsError } = await admin
    .from('company_memberships')
    .select('user_id')
    .eq('company_id', invoiceAccess.companyId)
    .eq('role', appliedRoleFilter);

  if (membershipsError) {
    throw new HttpError(500, membershipsError.message);
  }

  const userIds = Array.from(
    new Set(
      (membershipRows ?? [])
        .map((membership) => (membership.user_id ? String(membership.user_id) : null))
        .filter((userId): userId is string => Boolean(userId)),
    ),
  );

  return {
    appliedRoleFilter,
    userIds,
  };
}

function calculateServiceNetTotal(service: Record<string, unknown>) {
  const quantity = Number(service.quantity ?? 0);
  const unitPrice = Number(service.unit_price ?? 0);
  const discountPercent = Number(service.discount_percent ?? 0);
  const taxPercent = Number(service.tax_percent ?? 0);
  const subtotal = quantity * unitPrice;
  const discountAmount = subtotal * (discountPercent / 100);
  const afterDiscount = subtotal - discountAmount;
  const taxAmount = afterDiscount * (taxPercent / 100);
  return afterDiscount + taxAmount;
}

function parseInvoiceIds(value: unknown, field: string) {
  const rawValues = Array.isArray(value)
    ? value.flatMap((entry) => (typeof entry === 'string' ? entry.split(',') : []))
    : typeof value === 'string'
      ? value.split(',')
      : [];

  const invoiceIds = Array.from(
    new Set(
      rawValues
        .map((entry) => entry.trim())
        .filter(Boolean)
        .map((entry) => requireUuid(entry, field)),
    ),
  );

  if (invoiceIds.length === 0) {
    throw new HttpError(400, `${field} must include at least one invoice id`);
  }

  if (invoiceIds.length > 50) {
    throw new HttpError(400, `${field} may include at most 50 invoice ids at a time`);
  }

  return invoiceIds;
}

async function fetchInvoicesWithRelations(companyId: string, invoiceIds: string[]) {
  const admin = getAdminClient();
  const [{ data: invoiceRows, error: invoicesError }, { data: serviceRows, error: servicesError }, { data: companyRow, error: companyError }] =
    await Promise.all([
      admin.from('invoices').select('*').eq('company_id', companyId).in('id', invoiceIds),
      admin.from('services').select('*').in('invoice_id', invoiceIds),
      admin.from('companies').select('*').eq('id', companyId).maybeSingle(),
    ]);

  if (invoicesError) {
    throw new HttpError(500, invoicesError.message);
  }

  if (servicesError) {
    throw new HttpError(500, servicesError.message);
  }

  if (companyError) {
    throw new HttpError(500, companyError.message);
  }

  if (!companyRow) {
    throw new HttpError(404, 'Company not found');
  }

  const company = mapCompanyRecord(companyRow as Record<string, unknown>);
  const servicesByInvoiceId = new Map<string, Record<string, unknown>[]>();
  for (const serviceRow of serviceRows ?? []) {
    const invoiceId = String(serviceRow.invoice_id);
    const nextRows = servicesByInvoiceId.get(invoiceId) ?? [];
    nextRows.push(serviceRow as Record<string, unknown>);
    servicesByInvoiceId.set(invoiceId, nextRows);
  }

  const invoiceById = new Map(
    (invoiceRows ?? []).map((invoiceRow) => [String(invoiceRow.id), invoiceRow as Record<string, unknown>] as const),
  );

  const orderedInvoices = invoiceIds.map((invoiceId) => {
    const invoiceRow = invoiceById.get(invoiceId);
    if (!invoiceRow) {
      return null;
    }

    return serializeInvoiceRecord(invoiceRow, company, servicesByInvoiceId.get(invoiceId) ?? []);
  });

  if (orderedInvoices.some((invoice) => !invoice)) {
    throw new HttpError(404, 'One or more invoices could not be found');
  }

  return orderedInvoices as ReturnType<typeof serializeInvoiceRecord>[];
}

function serializeInvoiceRecord(
  invoice: Record<string, unknown>,
  company: CompanyRecord | null,
  services: Record<string, unknown>[],
) {
  return {
    id: String(invoice.id),
    userId: invoice.user_id ? String(invoice.user_id) : null,
    companyId: invoice.company_id ? String(invoice.company_id) : null,
    savedClientId: invoice.saved_client_id ? String(invoice.saved_client_id) : null,
    verificationToken: String(invoice.verification_token ?? ''),
    clientCompanyName: String(invoice.client_company_name ?? ''),
    clientEmail: String(invoice.client_email ?? ''),
    clientPhone: String(invoice.client_phone ?? ''),
    clientStreet: String(invoice.client_street ?? ''),
    clientHouseNumber: String(invoice.client_house_number ?? ''),
    clientCity: String(invoice.client_city ?? ''),
    clientPostalCode: String(invoice.client_postal_code ?? ''),
    invoiceNo: String(invoice.invoice_no ?? ''),
    issueDate: String(invoice.issue_date ?? ''),
    dueDate: String(invoice.due_date ?? ''),
    paymentTerms: String(invoice.payment_terms ?? ''),
    theme: String(invoice.theme ?? 'legacy-indigo'),
    notes: invoice.notes ? String(invoice.notes) : null,
    authorizedSignature: String(invoice.authorized_signature ?? ''),
    createdAt: String(invoice.created_at ?? ''),
    updatedAt: String(invoice.updated_at ?? ''),
    services: services
      .map((service) => ({
        id: String(service.id),
        invoiceId: String(service.invoice_id ?? ''),
        date: String(service.date ?? ''),
        sender: String(service.sender ?? ''),
        receiver: String(service.receiver ?? ''),
        reference: String(service.reference ?? ''),
        service: String(service.service ?? ''),
        quantity: String(service.quantity ?? '0'),
        unitPrice: String(service.unit_price ?? '0'),
        discountPercent: String(service.discount_percent ?? '0'),
        taxPercent: String(service.tax_percent ?? '0'),
      }))
      .sort((left, right) => left.date.localeCompare(right.date)),
    ownerLogoUrl: company?.documentLogoUrl ?? null,
    companyDocumentLogoUrl: company?.documentLogoUrl ?? null,
    issuerName: company?.name ?? null,
    issuerEmail: company?.email ?? null,
    issuerPhone: company?.phone ?? null,
    issuerPoBox: company?.poBox ?? null,
    issuerStreetAddress: company?.streetAddress ?? null,
    issuerStandNumber: company?.standNumber ?? null,
    bankName: company?.bankName ?? null,
    bankAccountHolder: company?.accountHolder ?? null,
    bankAccountNumber: company?.accountNumber ?? null,
    bankAccountType: company?.accountType ?? null,
    bankBranchCode: company?.branchCode ?? null,
  };
}

function getMissingRequiredEnvVars() {
  const requiredEnvVarNames = [
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
  ] as const;

  return requiredEnvVarNames.filter((name) => {
    const value = Deno.env.get(name);
    return !value || !value.trim();
  });
}

function getPublicOriginHealthState(req: Request) {
  const forwardedHost = req.headers.get('x-forwarded-host')?.trim() ?? '';
  const forwardedProto = req.headers.get('x-forwarded-proto')?.trim() ?? '';
  const originHeader = req.headers.get('origin')?.trim() ?? '';

  const publicOrigin = forwardedHost
    ? `${forwardedProto || 'https'}://${forwardedHost}`
    : originHeader || null;

  return publicOrigin
    ? { ok: true, publicOrigin, message: undefined }
    : { ok: false, publicOrigin: null, message: 'Public origin could not be resolved from request headers' };
}

function getHealthStatus(checks: Array<'pass' | 'fail'>) {
  return checks.every((status) => status === 'pass') ? 'ok' : 'degraded';
}

async function getDatabaseHealthState() {
  const startedAt = Date.now();

  try {
    const admin = getAdminClient();
    const { error } = await withTimeout(
      admin.from('user').select('id', { count: 'exact', head: true }),
      'Database check timed out',
    );

    if (error) {
      throw new HttpError(500, error.message);
    }

    return {
      ok: true,
      latencyMs: Date.now() - startedAt,
      message: undefined,
    };
  } catch (error) {
    return {
      ok: false,
      latencyMs: Date.now() - startedAt,
      message: error instanceof Error ? error.message : 'Database check failed',
    };
  }
}

async function getStorageHealthState() {
  try {
    const admin = getAdminClient();
    const { data, error } = await withTimeout(
      admin.storage.getBucket(APP_STORAGE_BUCKET),
      'Storage check timed out',
    );

    if (error) {
      return {
        ok: false,
        exists: false,
        bucket: null,
        errorMessage: error.message,
      };
    }

    return {
      ok: Boolean(data),
      exists: Boolean(data),
      bucket: data,
      errorMessage: undefined,
    };
  } catch (error) {
    return {
      ok: false,
      exists: false,
      bucket: null,
      errorMessage: error instanceof Error ? error.message : 'Storage check failed',
    };
  }
}

async function handleHealth(req: Request) {
  const missingRequiredEnvVars = getMissingRequiredEnvVars();
  const [databaseState, storageState] = await Promise.all([
    getDatabaseHealthState(),
    getStorageHealthState(),
  ]);
  const publicOriginState = getPublicOriginHealthState(req);
  const requiredEnvOk = missingRequiredEnvVars.length === 0;
  const configurationStatus = requiredEnvOk ? 'pass' : 'fail';
  const applicationStatus = publicOriginState.ok ? 'pass' : 'fail';
  const databaseStatus = databaseState.ok ? 'pass' : 'fail';
  const storageStatus = storageState.ok ? 'pass' : 'fail';
  const requestId = req.headers.get('x-request-id')?.trim() ?? crypto.randomUUID();

  const health = {
    status: getHealthStatus([
      configurationStatus,
      applicationStatus,
      databaseStatus,
      storageStatus,
    ]),
    timestamp: new Date().toISOString(),
    summary:
      requiredEnvOk && publicOriginState.ok && databaseState.ok && storageState.ok
        ? 'All core platform checks passed.'
        : 'One or more platform checks failed. Inspect the individual checks for details.',
    service: {
      name: 'mt-invoices',
      environment: Deno.env.get('VERCEL_ENV')?.trim() || Deno.env.get('NODE_ENV')?.trim() || 'development',
      runtime: 'supabase-edge',
      region: Deno.env.get('SB_REGION')?.trim() || Deno.env.get('VERCEL_REGION')?.trim() || null,
      deploymentUrl: publicOriginState.publicOrigin,
      uptimeSeconds: Math.round(performance.now() / 1000),
      requestId,
    },
    checks: {
      configuration: {
        status: configurationStatus,
        ok: requiredEnvOk,
        checked: ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'],
        missing: missingRequiredEnvVars,
      },
      application: {
        status: applicationStatus,
        ok: publicOriginState.ok,
        publicOrigin: publicOriginState.publicOrigin,
        ...(publicOriginState.message ? { message: publicOriginState.message } : {}),
      },
      database: {
        status: databaseStatus,
        ok: databaseState.ok,
        latencyMs: databaseState.latencyMs,
        ...(databaseState.message ? { message: databaseState.message } : {}),
      },
      storage: {
        status: storageStatus,
        ok: storageState.ok,
        bucket: APP_STORAGE_BUCKET,
        exists: storageState.exists,
        public: storageState.bucket?.public ?? null,
        fileSizeLimit: storageState.bucket?.file_size_limit ?? null,
        ...(storageState.errorMessage ? { message: storageState.errorMessage } : {}),
      },
    },
  };

  return jsonResponse(health.status === 'ok' ? 200 : 503, health);
}

async function handleBranding() {
  try {
    const admin = getAdminClient();
    const { data, error } = await admin
      .from('user')
      .select('site_logo_url, updated_at, created_at')
      .eq('role', 'admin')
      .not('site_logo_url', 'is', null)
      .order('updated_at', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) {
      throw error;
    }

    return jsonResponse(200, {
      siteLogoUrl: data?.[0]?.site_logo_url ? String(data[0].site_logo_url) : null,
    });
  } catch (error) {
    console.error('Failed to fetch branding', error);
    return jsonResponse(200, { siteLogoUrl: null });
  }
}

async function handleVerifyInvoice(token: string) {
  const admin = getAdminClient();
  const verificationToken = requireUuid(token, 'Verification token');
  const { data: invoice, error } = await admin
    .from('invoices')
    .select('client_company_name, due_date, invoice_no, issue_date, payment_terms, verification_token')
    .eq('verification_token', verificationToken)
    .maybeSingle();

  if (error) {
    throw new HttpError(500, error.message);
  }

  if (!invoice) {
    throw new HttpError(404, 'Invoice could not be verified');
  }

  return jsonResponse(200, {
    verified: true,
    invoiceNo: String(invoice.invoice_no ?? ''),
    clientCompanyName: String(invoice.client_company_name ?? ''),
    issueDate: String(invoice.issue_date ?? ''),
    dueDate: String(invoice.due_date ?? ''),
    paymentTerms: String(invoice.payment_terms ?? ''),
    verificationId: String(invoice.verification_token ?? ''),
  });
}

async function handleListCompanies(session: SessionRecord) {
  return jsonResponse(200, await buildCompaniesResponse(session.user.id));
}

async function handleCreateCompany(req: Request, session: SessionRecord) {
  if (!isAdminSession(session)) {
    throw new HttpError(403, 'Only admin users can create companies');
  }

  const admin = getAdminClient();
  const payload = parseCompanyInput(await readJsonBody(req));
  const access = await queryCompanyAccessContext(session.user.id);
  const { data: currentUser, error: currentUserError } = await admin
    .from('user')
    .select('document_logo_url, document_logo_key')
    .eq('id', session.user.id)
    .maybeSingle();

  if (currentUserError) {
    throw new HttpError(500, currentUserError.message);
  }

  if (!currentUser) {
    throw new HttpError(404, 'User profile not found');
  }

  const shouldSeedLegacyData = access.memberships.length === 0;
  const companyId = crypto.randomUUID();
  const membershipId = crypto.randomUUID();
  const now = new Date().toISOString();

  const { error: companyInsertError } = await admin.from('companies').insert({
    id: companyId,
    name: payload.name,
    email: payload.email,
    phone: payload.phone,
    po_box: payload.poBox || null,
    street_address: payload.streetAddress,
    stand_number: payload.standNumber || null,
    document_logo_url: shouldSeedLegacyData ? currentUser.document_logo_url ?? null : null,
    document_logo_key: shouldSeedLegacyData ? currentUser.document_logo_key ?? null : null,
    bank_name: payload.bankName,
    account_holder: payload.accountHolder,
    account_number: payload.accountNumber,
    account_type: payload.accountType,
    branch_code: payload.branchCode,
    created_by_user_id: session.user.id,
    created_at: now,
    updated_at: now,
  });

  if (companyInsertError) {
    throw new HttpError(500, companyInsertError.message);
  }

  const { error: membershipInsertError } = await admin.from('company_memberships').insert({
    id: membershipId,
    company_id: companyId,
    user_id: session.user.id,
    role: 'owner',
    created_at: now,
    updated_at: now,
  });

  if (membershipInsertError) {
    throw new HttpError(500, membershipInsertError.message);
  }

  await setUserActiveCompany(session.user.id, companyId);

  if (shouldSeedLegacyData) {
    const { error: invoicesUpdateError } = await admin
      .from('invoices')
      .update({
        company_id: companyId,
        updated_at: now,
      })
      .eq('user_id', session.user.id)
      .is('company_id', null);

    if (invoicesUpdateError) {
      throw new HttpError(500, invoicesUpdateError.message);
    }
  }

  return jsonResponse(201, await buildCompaniesResponse(session.user.id));
}

async function handleSetActiveCompany(req: Request, session: SessionRecord) {
  const payload = getRecord(await readJsonBody(req), 'request body');
  const companyId = requireUuid(getTrimmedString(payload.companyId, 'companyId', 36), 'companyId');
  const access = await queryCompanyAccessContext(session.user.id);
  const canAccessCompany = access.memberships.some((membership) => membership.companyId === companyId);

  if (!canAccessCompany) {
    throw new HttpError(403, 'You do not have access to this company');
  }

  await setUserActiveCompany(session.user.id, companyId);
  return jsonResponse(200, await buildCompaniesResponse(session.user.id));
}

async function handleGetCompany(session: SessionRecord, companyId: string) {
  return jsonResponse(200, await getCompanyDetailResponse(session.user.id, requireUuid(companyId, 'Company id')));
}

async function handleUpdateCompany(req: Request, session: SessionRecord, companyId: string) {
  const admin = getAdminClient();
  const resolvedCompanyId = requireUuid(companyId, 'Company id');
  const payload = parseCompanyInput(await readJsonBody(req));
  const access = await queryCompanyAccessContext(session.user.id);
  const viewerMembership =
    access.memberships.find((membership) => membership.companyId === resolvedCompanyId) ?? null;

  if (!access.isGlobalAdmin && !viewerMembership) {
    throw new HttpError(403, 'You do not have access to this company');
  }

  if (!canEditCompany(access.isGlobalAdmin, viewerMembership?.role ?? null)) {
    throw new HttpError(403, 'Only company owners or admins can update company details');
  }

  const { data: existingCompany, error: existingCompanyError } = await admin
    .from('companies')
    .select('id')
    .eq('id', resolvedCompanyId)
    .maybeSingle();

  if (existingCompanyError) {
    throw new HttpError(500, existingCompanyError.message);
  }

  if (!existingCompany) {
    throw new HttpError(404, 'Company not found');
  }

  const { error: updateError } = await admin
    .from('companies')
    .update({
      name: payload.name,
      email: payload.email,
      phone: payload.phone,
      po_box: payload.poBox || null,
      street_address: payload.streetAddress,
      stand_number: payload.standNumber || null,
      bank_name: payload.bankName,
      account_holder: payload.accountHolder,
      account_number: payload.accountNumber,
      account_type: payload.accountType,
      branch_code: payload.branchCode,
      updated_at: new Date().toISOString(),
    })
    .eq('id', resolvedCompanyId);

  if (updateError) {
    throw new HttpError(500, updateError.message);
  }

  return jsonResponse(200, await getCompanyDetailResponse(session.user.id, resolvedCompanyId));
}

async function handleAddCompanyMember(req: Request, session: SessionRecord, companyId: string) {
  if (!isAdminSession(session)) {
    throw new HttpError(403, 'Only workspace admins can add users to companies');
  }

  const admin = getAdminClient();
  const resolvedCompanyId = requireUuid(companyId, 'Company id');
  const payload = getRecord(await readJsonBody(req), 'request body');
  const targetUserId = getTrimmedString(payload.userId, 'userId', 120);
  const role = getCompanyRole(payload.role, 'role', 'member');

  const [{ data: companyRecord, error: companyError }, { data: targetUser, error: targetUserError }, { data: existingMembership, error: existingMembershipError }] =
    await Promise.all([
      admin.from('companies').select('id').eq('id', resolvedCompanyId).maybeSingle(),
      admin.from('user').select('id, active_company_id').eq('id', targetUserId).maybeSingle(),
      admin
        .from('company_memberships')
        .select('id')
        .eq('company_id', resolvedCompanyId)
        .eq('user_id', targetUserId)
        .maybeSingle(),
    ]);

  if (companyError) throw new HttpError(500, companyError.message);
  if (targetUserError) throw new HttpError(500, targetUserError.message);
  if (existingMembershipError) throw new HttpError(500, existingMembershipError.message);

  if (!companyRecord) {
    throw new HttpError(404, 'Company not found');
  }

  if (!targetUser) {
    throw new HttpError(404, 'User not found');
  }

  if (existingMembership) {
    throw new HttpError(409, 'This user is already a member of the selected company');
  }

  const { error: insertError } = await admin.from('company_memberships').insert({
    id: crypto.randomUUID(),
    company_id: resolvedCompanyId,
    user_id: targetUserId,
    role,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  if (insertError) {
    throw new HttpError(500, insertError.message);
  }

  if (!targetUser.active_company_id) {
    await setUserActiveCompany(targetUserId, resolvedCompanyId);
  }

  return jsonResponse(201, await getCompanyDetailResponse(session.user.id, resolvedCompanyId));
}

async function handleUpdateCompanyMembership(
  req: Request,
  session: SessionRecord,
  companyId: string,
  membershipId: string,
) {
  const admin = getAdminClient();
  const resolvedCompanyId = requireUuid(companyId, 'Company id');
  const resolvedMembershipId = requireUuid(membershipId, 'Membership id');
  const payload = getRecord(await readJsonBody(req), 'request body');
  const role = getCompanyRole(payload.role, 'role');
  const context = await getCompanyMembershipActionContext(
    session.user.id,
    resolvedCompanyId,
    resolvedMembershipId,
  );

  if (!context.permissions.canChangeRole) {
    throw new HttpError(403, "You cannot change this member's role");
  }

  if (context.targetMembership.role === role) {
    return jsonResponse(200, await getCompanyDetailResponse(session.user.id, resolvedCompanyId));
  }

  const { error } = await admin
    .from('company_memberships')
    .update({
      role,
      updated_at: new Date().toISOString(),
    })
    .eq('id', resolvedMembershipId);

  if (error) {
    throw new HttpError(500, error.message);
  }

  return jsonResponse(200, await getCompanyDetailResponse(session.user.id, resolvedCompanyId));
}

async function handleDeleteCompanyMembership(
  session: SessionRecord,
  companyId: string,
  membershipId: string,
) {
  const admin = getAdminClient();
  const resolvedCompanyId = requireUuid(companyId, 'Company id');
  const resolvedMembershipId = requireUuid(membershipId, 'Membership id');
  const context = await getCompanyMembershipActionContext(
    session.user.id,
    resolvedCompanyId,
    resolvedMembershipId,
  );

  if (!context.permissions.canRemove) {
    throw new HttpError(403, 'You cannot remove this member');
  }

  const { error: deleteError } = await admin
    .from('company_memberships')
    .delete()
    .eq('id', resolvedMembershipId);

  if (deleteError) {
    throw new HttpError(500, deleteError.message);
  }

  const { data: nextMemberships, error: nextMembershipsError } = await admin
    .from('company_memberships')
    .select('company_id, created_at')
    .eq('user_id', context.targetMembership.userId)
    .order('created_at', { ascending: true })
    .limit(1);

  if (nextMembershipsError) {
    throw new HttpError(500, nextMembershipsError.message);
  }

  await setUserActiveCompany(
    context.targetMembership.userId,
    nextMemberships?.[0]?.company_id ? String(nextMemberships[0].company_id) : null,
  );

  return jsonResponse(200, await getCompanyDetailResponse(session.user.id, resolvedCompanyId));
}

async function handleDeleteCompanyLogo(session: SessionRecord, companyId: string) {
  const resolvedCompanyId = requireUuid(companyId, 'Company id');
  const access = await queryCompanyAccessContext(session.user.id);
  const viewerMembership =
    access.memberships.find((membership) => membership.companyId === resolvedCompanyId) ?? null;

  if (!access.isGlobalAdmin && !viewerMembership) {
    throw new HttpError(403, 'You do not have access to this company');
  }

  if (!canEditCompany(access.isGlobalAdmin, viewerMembership?.role ?? null)) {
    throw new HttpError(403, 'Only company owners or admins can remove the company logo');
  }

  await removeCompanyDocumentLogo(resolvedCompanyId);
  return emptyResponse();
}

async function handleListUsers(session: SessionRecord) {
  if (!isAdminSession(session)) {
    throw new HttpError(403, 'Only admins can view all users');
  }

  const admin = getAdminClient();
  const [{ data: allUsers, error: usersError }, { data: invoiceRows, error: invoicesError }, { data: authSessionRows, error: authSessionsError }] =
    await Promise.all([
      admin
        .from('user')
        .select('id, name, email, email_verified, image, last_seen_at, created_at, updated_at, role, banned, ban_reason, ban_expires')
        .order('created_at', { ascending: false }),
      admin.from('invoices').select('user_id').not('user_id', 'is', null),
      admin.rpc('app_list_auth_session_counts'),
    ]);

  if (usersError) throw new HttpError(500, usersError.message);
  if (invoicesError) throw new HttpError(500, invoicesError.message);
  if (authSessionsError) throw new HttpError(500, authSessionsError.message);

  const invoiceCountMap = new Map<string, number>();
  for (const invoiceRow of invoiceRows ?? []) {
    const userId = invoiceRow.user_id ? String(invoiceRow.user_id) : null;
    if (!userId) continue;
    invoiceCountMap.set(userId, (invoiceCountMap.get(userId) ?? 0) + 1);
  }

  const sessionCountMap = new Map<string, number>();
  for (const authSessionRow of authSessionRows ?? []) {
    const userId = authSessionRow.user_id ? String(authSessionRow.user_id) : null;
    if (!userId) continue;
    sessionCountMap.set(
      userId,
      typeof authSessionRow.active_sessions === 'number'
        ? authSessionRow.active_sessions
        : Number(authSessionRow.active_sessions ?? 0),
    );
  }

  const users = (allUsers ?? [])
    .map((currentUser) => ({
      id: String(currentUser.id),
      name: String(currentUser.name ?? ''),
      email: String(currentUser.email ?? ''),
      emailVerified: Boolean(currentUser.email_verified),
      image: currentUser.image ? String(currentUser.image) : null,
      createdAt: String(currentUser.created_at ?? ''),
      updatedAt: String(currentUser.updated_at ?? ''),
      role: currentUser.role ? String(currentUser.role) : 'user',
      banned: currentUser.banned == null ? null : Boolean(currentUser.banned),
      banReason: currentUser.ban_reason ? String(currentUser.ban_reason) : null,
      banExpires: currentUser.ban_expires ? String(currentUser.ban_expires) : null,
      invoiceCount: invoiceCountMap.get(String(currentUser.id)) ?? 0,
      activeSessions: sessionCountMap.get(String(currentUser.id)) ?? 0,
      lastSeenAt: currentUser.last_seen_at ? String(currentUser.last_seen_at) : null,
      isCurrentUser: String(currentUser.id) === session.user.id,
    }))
    .sort((left, right) => {
      if (left.isCurrentUser !== right.isCurrentUser) {
        return left.isCurrentUser ? -1 : 1;
      }

      if (left.role !== right.role) {
        return left.role === 'admin' ? -1 : 1;
      }

      return left.name.localeCompare(right.name);
    });

  return jsonResponse(200, users);
}

async function handleDeleteUser(session: SessionRecord, userId: string) {
  if (!isAdminSession(session)) {
    throw new HttpError(403, 'Only admins can delete users');
  }

  const admin = getAdminClient();
  const targetUserId = getTrimmedString(userId, 'User id', 120);
  if (targetUserId === session.user.id) {
    throw new HttpError(409, 'You cannot delete your own account');
  }

  const { data: targetUser, error: targetUserError } = await admin
    .from('user')
    .select('id, role')
    .eq('id', targetUserId)
    .maybeSingle();

  if (targetUserError) {
    throw new HttpError(500, targetUserError.message);
  }

  if (!targetUser) {
    throw new HttpError(404, 'User not found');
  }

  if ((targetUser.role ?? 'user') === 'admin') {
    const { data: adminRows, error: adminCountError } = await admin
      .from('user')
      .select('id')
      .eq('role', 'admin');

    if (adminCountError) {
      throw new HttpError(500, adminCountError.message);
    }

    if ((adminRows?.length ?? 0) <= 1) {
      throw new HttpError(409, 'You cannot delete the last administrator');
    }
  }

  await deleteUserAccount(targetUserId);
  return emptyResponse();
}

async function handleSettingsSummary(session: SessionRecord) {
  const admin = getAdminClient();
  const access = await queryCompanyAccessContext(session.user.id);
  const activeCompanyDetail = access.activeMembership
    ? await getCompanyDetailResponse(session.user.id, access.activeMembership.companyId)
    : null;

  const [{ data: profile, error: profileError }, authSessions] = await Promise.all([
    admin
      .from('user')
      .select('id, name, email, site_logo_url, image, email_verified, role, last_seen_at, created_at, updated_at')
      .eq('id', session.user.id)
      .maybeSingle(),
    listAuthSessions(session.user.id),
  ]);

  if (profileError) {
    throw new HttpError(500, profileError.message);
  }

  if (!profile) {
    throw new HttpError(404, 'User profile not found');
  }

  return jsonResponse(200, {
    profile: {
      id: String(profile.id),
      name: String(profile.name ?? ''),
      email: String(profile.email ?? ''),
      image: profile.image ? String(profile.image) : null,
      emailVerified: Boolean(profile.email_verified),
      role: profile.role ? String(profile.role) : 'user',
      createdAt: String(profile.created_at ?? ''),
      updatedAt: String(profile.updated_at ?? ''),
    },
    branding: {
      siteLogoUrl: profile.site_logo_url ? String(profile.site_logo_url) : null,
    },
    security: {
      activeSessions: authSessions.length,
      lastSeenAt: profile.last_seen_at ? String(profile.last_seen_at) : null,
    },
    permissions: {
      canManageSiteBranding: access.isGlobalAdmin,
    },
    activeCompany: activeCompanyDetail?.company ?? null,
    companyMembers: activeCompanyDetail?.members ?? [],
  });
}

async function handleSettingsSessions(session: SessionRecord) {
  const authSessions = await listAuthSessions(session.user.id);
  return jsonResponse(200, {
    currentSessionId: session.sessionId ?? null,
    sessions: authSessions.map((authSession) => ({
      id: authSession.id,
      createdAt: authSession.createdAt,
      updatedAt: authSession.updatedAt ?? authSession.createdAt,
      userId: session.user.id,
      expiresAt: authSession.expiresAt,
      token: authSession.id,
      ipAddress: authSession.ipAddress,
      userAgent: authSession.userAgent,
    })),
  });
}

async function handleDeleteOtherSessions(session: SessionRecord) {
  await deleteOtherAuthSessions(session.user.id, session.sessionId);
  return emptyResponse();
}

async function handleDeleteSession(session: SessionRecord, sessionId: string) {
  const resolvedSessionId = requireUuid(sessionId, 'Session id');
  const deleted = await deleteAuthSession(session.user.id, resolvedSessionId);

  if (!deleted) {
    throw new HttpError(404, 'Session not found');
  }

  return emptyResponse();
}

async function handleDashboard(session: SessionRecord, target: URL) {
  const admin = getAdminClient();
  const access = await requireActiveCompanyAccess(session.user.id);
  const scope = await resolveDashboardInvoiceScope(access, target.searchParams.get('roleFilter'));

  if (scope.userIds.length === 0) {
    return jsonResponse(200, {
      appliedRoleFilter: scope.appliedRoleFilter,
      totalInvoices: 0,
      uniqueClients: 0,
      totalRevenue: 0,
      recentInvoices: [],
    });
  }

  const { data: invoiceRows, error: invoicesError } = await admin
    .from('invoices')
    .select('id, invoice_no, client_company_name, issue_date, updated_at, created_at, user_id')
    .eq('company_id', access.activeMembership!.companyId)
    .in('user_id', scope.userIds)
    .order('updated_at', { ascending: false })
    .order('created_at', { ascending: false });

  if (invoicesError) {
    throw new HttpError(500, invoicesError.message);
  }

  const invoiceIds = (invoiceRows ?? []).map((invoiceRow) => String(invoiceRow.id));
  const { data: serviceRows, error: servicesError } = invoiceIds.length > 0
    ? await admin.from('services').select('invoice_id, quantity, unit_price, discount_percent, tax_percent').in('invoice_id', invoiceIds)
    : { data: [], error: null };

  if (servicesError) {
    throw new HttpError(500, servicesError.message);
  }

  const totalsByInvoiceId = new Map<string, number>();
  let totalRevenue = 0;
  for (const serviceRow of serviceRows ?? []) {
    const invoiceId = String(serviceRow.invoice_id);
    const netTotal = calculateServiceNetTotal(serviceRow as Record<string, unknown>);
    totalsByInvoiceId.set(invoiceId, (totalsByInvoiceId.get(invoiceId) ?? 0) + netTotal);
    totalRevenue += netTotal;
  }

  const uniqueClients = new Set(
    (invoiceRows ?? [])
      .map((invoiceRow) => String(invoiceRow.client_company_name ?? '').trim())
      .filter(Boolean),
  ).size;

  const recentInvoices = (invoiceRows ?? []).slice(0, 5).map((invoiceRow) => ({
    id: String(invoiceRow.id),
    invoiceNo: String(invoiceRow.invoice_no ?? ''),
    clientCompanyName: String(invoiceRow.client_company_name ?? ''),
    issueDate: String(invoiceRow.issue_date ?? ''),
    totalAmount: totalsByInvoiceId.get(String(invoiceRow.id)) ?? 0,
  }));

  return jsonResponse(200, {
    appliedRoleFilter: scope.appliedRoleFilter,
    totalInvoices: (invoiceRows?.length ?? 0),
    uniqueClients,
    totalRevenue,
    recentInvoices,
  });
}

async function handleDeleteSettingsLogo(session: SessionRecord, kind: string) {
  if (kind !== 'site') {
    throw new HttpError(400, 'Logo kind must be site');
  }

  if (!isAdminSession(session)) {
    throw new HttpError(403, 'Only workspace admins can manage the site logo');
  }

  await removeUserLogo(session.user.id, 'site');
  return emptyResponse();
}

async function handleDeleteCompanyLogoFromSettings(session: SessionRecord) {
  const access = await requireActiveCompanyAccess(session.user.id);
  if (!canEditCompany(access.isGlobalAdmin, access.activeMembership!.role)) {
    throw new HttpError(403, 'Only company owners or admins can remove the company logo');
  }

  await removeCompanyDocumentLogo(access.activeMembership!.companyId);
  return emptyResponse();
}

async function handleListInvoices(session: SessionRecord, target: URL) {
  const admin = getAdminClient();
  const access = await requireActiveCompanyAccess(session.user.id);
  const scope = await resolveDashboardInvoiceScope(access, target.searchParams.get('roleFilter'));

  if (scope.userIds.length === 0) {
    return jsonResponse(200, {
      appliedRoleFilter: scope.appliedRoleFilter,
      invoices: [],
    });
  }

  const { data: invoiceRows, error } = await admin
    .from('invoices')
    .select('id, invoice_no, client_company_name, issue_date, due_date, user_id')
    .eq('company_id', access.activeMembership!.companyId)
    .in('user_id', scope.userIds)
    .order('updated_at', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    throw new HttpError(500, error.message);
  }

  return jsonResponse(200, {
    appliedRoleFilter: scope.appliedRoleFilter,
    invoices: (invoiceRows ?? []).map((invoiceRow) => ({
      id: String(invoiceRow.id),
      invoiceNo: String(invoiceRow.invoice_no ?? ''),
      clientCompanyName: String(invoiceRow.client_company_name ?? ''),
      issueDate: String(invoiceRow.issue_date ?? ''),
      dueDate: String(invoiceRow.due_date ?? ''),
    })),
  });
}

async function handleInvoiceExport(session: SessionRecord, target: URL) {
  const admin = getAdminClient();
  const access = await requireActiveCompanyAccess(session.user.id);
  const invoiceAccess = getInvoiceAccessScope(access);
  const invoiceIds = parseInvoiceIds(target.searchParams.get('ids'), 'ids');

  let invoiceQuery = admin
    .from('invoices')
    .select('id')
    .eq('company_id', invoiceAccess.companyId)
    .in('id', invoiceIds);

  if (!invoiceAccess.canManageInvoices) {
    invoiceQuery = invoiceQuery.eq('user_id', invoiceAccess.userId);
  }

  const { data: matchingInvoices, error } = await invoiceQuery;
  if (error) {
    throw new HttpError(500, error.message);
  }

  if ((matchingInvoices?.length ?? 0) !== invoiceIds.length) {
    throw new HttpError(404, 'One or more invoices could not be found');
  }

  return jsonResponse(200, await fetchInvoicesWithRelations(invoiceAccess.companyId, invoiceIds));
}

async function handleGetInvoice(session: SessionRecord, invoiceId: string) {
  const admin = getAdminClient();
  const access = await requireActiveCompanyAccess(session.user.id);
  const invoiceAccess = getInvoiceAccessScope(access);
  const resolvedInvoiceId = requireUuid(invoiceId, 'Invoice id');

  let invoiceQuery = admin
    .from('invoices')
    .select('*')
    .eq('id', resolvedInvoiceId)
    .eq('company_id', invoiceAccess.companyId)
    .maybeSingle();

  if (!invoiceAccess.canManageInvoices) {
    invoiceQuery = admin
      .from('invoices')
      .select('*')
      .eq('id', resolvedInvoiceId)
      .eq('company_id', invoiceAccess.companyId)
      .eq('user_id', invoiceAccess.userId)
      .maybeSingle();
  }

  const { data: invoiceRow, error: invoiceError } = await invoiceQuery;
  if (invoiceError) {
    throw new HttpError(500, invoiceError.message);
  }

  if (!invoiceRow) {
    throw new HttpError(404, 'Invoice not found');
  }

  const [serializedInvoice] = await fetchInvoicesWithRelations(invoiceAccess.companyId, [resolvedInvoiceId]);
  return jsonResponse(200, serializedInvoice);
}

async function handleSaveInvoice(req: Request, session: SessionRecord) {
  const admin = getAdminClient();
  const access = await requireActiveCompanyAccess(session.user.id);
  const invoiceAccess = getInvoiceAccessScope(access);
  const parsedInvoice = parseInvoiceInput(await readJsonBody(req));
  const invoiceId = parsedInvoice.id ?? crypto.randomUUID();

  let verificationToken = crypto.randomUUID();
  let ownerId = session.user.id;
  let companyId = access.activeMembership!.companyId;
  let savedClientId = parsedInvoice.savedClientId ?? null;

  if (parsedInvoice.id) {
    let existingInvoiceQuery = admin
      .from('invoices')
      .select('user_id, company_id, saved_client_id, verification_token')
      .eq('id', invoiceId)
      .eq('company_id', companyId)
      .maybeSingle();

    if (!invoiceAccess.canManageInvoices) {
      existingInvoiceQuery = admin
        .from('invoices')
        .select('user_id, company_id, saved_client_id, verification_token')
        .eq('id', invoiceId)
        .eq('company_id', companyId)
        .eq('user_id', invoiceAccess.userId)
        .maybeSingle();
    }

    const { data: existingInvoice, error: existingInvoiceError } = await existingInvoiceQuery;
    if (existingInvoiceError) {
      throw new HttpError(500, existingInvoiceError.message);
    }

    if (!existingInvoice) {
      throw new HttpError(404, 'Invoice not found');
    }

    verificationToken = existingInvoice.verification_token
      ? String(existingInvoice.verification_token)
      : verificationToken;
    ownerId = existingInvoice.user_id ? String(existingInvoice.user_id) : session.user.id;
    companyId = existingInvoice.company_id ? String(existingInvoice.company_id) : companyId;
    savedClientId = parsedInvoice.savedClientId ?? null;
  }

  if (savedClientId) {
    const { data: savedClient, error: savedClientError } = await admin
      .from('saved_clients')
      .select('id')
      .eq('id', savedClientId)
      .eq('company_id', access.activeMembership!.companyId)
      .maybeSingle();

    if (savedClientError) {
      throw new HttpError(500, savedClientError.message);
    }

    if (!savedClient) {
      throw new HttpError(404, 'Saved client not found');
    }
  }

  const now = new Date().toISOString();
  const invoiceValues = {
    id: invoiceId,
    user_id: ownerId,
    company_id: companyId,
    saved_client_id: savedClientId,
    verification_token: verificationToken,
    client_company_name: parsedInvoice.clientCompanyName,
    client_email: parsedInvoice.clientEmail,
    client_phone: parsedInvoice.clientPhone,
    client_street: parsedInvoice.clientStreet,
    client_house_number: parsedInvoice.clientHouseNumber,
    client_city: parsedInvoice.clientCity,
    client_postal_code: parsedInvoice.clientPostalCode,
    invoice_no: parsedInvoice.invoiceNo,
    issue_date: parsedInvoice.issueDate,
    due_date: parsedInvoice.dueDate,
    payment_terms: parsedInvoice.paymentTerms,
    theme: parsedInvoice.theme,
    notes: parsedInvoice.notes,
    authorized_signature: parsedInvoice.authorizedSignature,
    updated_at: now,
  };

  if (parsedInvoice.id) {
    const { error: updateError } = await admin.from('invoices').update(invoiceValues).eq('id', invoiceId);
    if (updateError) {
      throw new HttpError(500, updateError.message);
    }

    const { error: deleteServicesError } = await admin.from('services').delete().eq('invoice_id', invoiceId);
    if (deleteServicesError) {
      throw new HttpError(500, deleteServicesError.message);
    }
  } else {
    const { error: insertError } = await admin.from('invoices').insert({
      ...invoiceValues,
      created_at: now,
    });
    if (insertError) {
      throw new HttpError(500, insertError.message);
    }
  }

  if (parsedInvoice.services.length > 0) {
    const { error: insertServicesError } = await admin.from('services').insert(
      parsedInvoice.services.map((service) => ({
        id: crypto.randomUUID(),
        invoice_id: invoiceId,
        date: service.date,
        sender: service.sender,
        receiver: service.receiver,
        reference: service.reference,
        service: service.service,
        quantity: service.quantity,
        unit_price: service.unitPrice,
        discount_percent: service.discountPercent,
        tax_percent: service.taxPercent,
      })),
    );

    if (insertServicesError) {
      throw new HttpError(500, insertServicesError.message);
    }
  }

  if (savedClientId) {
    const { error: savedClientUpdateError } = await admin
      .from('saved_clients')
      .update({
        client_company_name: parsedInvoice.clientCompanyName,
        client_email: parsedInvoice.clientEmail,
        client_phone: parsedInvoice.clientPhone,
        client_street: parsedInvoice.clientStreet,
        client_house_number: parsedInvoice.clientHouseNumber,
        client_city: parsedInvoice.clientCity,
        client_postal_code: parsedInvoice.clientPostalCode,
        last_used_at: now,
        updated_at: now,
      })
      .eq('id', savedClientId)
      .eq('company_id', access.activeMembership!.companyId);

    if (savedClientUpdateError) {
      throw new HttpError(500, savedClientUpdateError.message);
    }
  }

  const [savedInvoice] = await fetchInvoicesWithRelations(companyId, [invoiceId]);
  return jsonResponse(parsedInvoice.id ? 200 : 201, savedInvoice);
}

async function handleDeleteInvoice(session: SessionRecord, invoiceId: string) {
  const admin = getAdminClient();
  const access = await requireActiveCompanyAccess(session.user.id);
  const invoiceAccess = getInvoiceAccessScope(access);
  const resolvedInvoiceId = requireUuid(invoiceId, 'Invoice id');

  let deleteQuery = admin
    .from('invoices')
    .delete()
    .eq('id', resolvedInvoiceId)
    .eq('company_id', invoiceAccess.companyId)
    .select('id');

  if (!invoiceAccess.canManageInvoices) {
    deleteQuery = admin
      .from('invoices')
      .delete()
      .eq('id', resolvedInvoiceId)
      .eq('company_id', invoiceAccess.companyId)
      .eq('user_id', invoiceAccess.userId)
      .select('id');
  }

  const { data, error } = await deleteQuery;
  if (error) {
    throw new HttpError(500, error.message);
  }

  if ((data?.length ?? 0) === 0) {
    throw new HttpError(404, 'Invoice not found');
  }

  return emptyResponse();
}

async function handleListClients(session: SessionRecord) {
  const admin = getAdminClient();
  const access = await requireActiveCompanyAccess(session.user.id);
  const companyId = access.activeMembership!.companyId;

  const [{ data: clientRows, error: clientsError }, { data: invoiceRows, error: invoicesError }] =
    await Promise.all([
      admin.from('saved_clients').select('*').eq('company_id', companyId),
      admin
        .from('invoices')
        .select('saved_client_id, updated_at')
        .eq('company_id', companyId)
        .not('saved_client_id', 'is', null),
    ]);

  if (clientsError) {
    throw new HttpError(500, clientsError.message);
  }

  if (invoicesError) {
    throw new HttpError(500, invoicesError.message);
  }

  const invoiceCounts = new Map<string, number>();
  const lastInvoiceAtByClientId = new Map<string, string | null>();
  for (const invoiceRow of invoiceRows ?? []) {
    const savedClientId = invoiceRow.saved_client_id ? String(invoiceRow.saved_client_id) : null;
    if (!savedClientId) continue;

    invoiceCounts.set(savedClientId, (invoiceCounts.get(savedClientId) ?? 0) + 1);

    const lastInvoiceAt = invoiceRow.updated_at ? String(invoiceRow.updated_at) : null;
    const currentLastInvoiceAt = lastInvoiceAtByClientId.get(savedClientId);
    if (!currentLastInvoiceAt || (lastInvoiceAt && lastInvoiceAt > currentLastInvoiceAt)) {
      lastInvoiceAtByClientId.set(savedClientId, lastInvoiceAt);
    }
  }

  const clients = (clientRows ?? [])
    .map((clientRow) => ({
      id: String(clientRow.id),
      clientCompanyName: String(clientRow.client_company_name ?? ''),
      clientEmail: String(clientRow.client_email ?? ''),
      clientPhone: String(clientRow.client_phone ?? ''),
      clientStreet: String(clientRow.client_street ?? ''),
      clientHouseNumber: String(clientRow.client_house_number ?? ''),
      clientCity: String(clientRow.client_city ?? ''),
      clientPostalCode: String(clientRow.client_postal_code ?? ''),
      invoiceCount: invoiceCounts.get(String(clientRow.id)) ?? 0,
      lastInvoiceAt: lastInvoiceAtByClientId.get(String(clientRow.id)) ?? null,
      createdAt: String(clientRow.created_at ?? ''),
      updatedAt: String(clientRow.updated_at ?? ''),
      lastUsedAt: clientRow.last_used_at ? String(clientRow.last_used_at) : null,
    }))
    .sort((left, right) => {
      if (right.invoiceCount !== left.invoiceCount) {
        return right.invoiceCount - left.invoiceCount;
      }

      if ((right.lastInvoiceAt ?? '') !== (left.lastInvoiceAt ?? '')) {
        return (right.lastInvoiceAt ?? '').localeCompare(left.lastInvoiceAt ?? '');
      }

      if ((right.lastUsedAt ?? '') !== (left.lastUsedAt ?? '')) {
        return (right.lastUsedAt ?? '').localeCompare(left.lastUsedAt ?? '');
      }

      const nameComparison = left.clientCompanyName.localeCompare(right.clientCompanyName);
      if (nameComparison !== 0) {
        return nameComparison;
      }

      return (right.updatedAt ?? '').localeCompare(left.updatedAt ?? '');
    });

  return jsonResponse(200, clients);
}

async function handleCreateOrUpdateClient(req: Request, session: SessionRecord) {
  const admin = getAdminClient();
  const access = await requireActiveCompanyAccess(session.user.id);
  const payload = parseSavedClientInput(await readJsonBody(req));
  const now = new Date().toISOString();
  const clientId = payload.id ?? crypto.randomUUID();

  if (payload.id) {
    const { data: updatedClientRows, error: updateError } = await admin
      .from('saved_clients')
      .update({
        client_company_name: payload.clientCompanyName,
        client_email: payload.clientEmail,
        client_phone: payload.clientPhone,
        client_street: payload.clientStreet,
        client_house_number: payload.clientHouseNumber,
        client_city: payload.clientCity,
        client_postal_code: payload.clientPostalCode,
        last_used_at: now,
        updated_at: now,
      })
      .eq('id', clientId)
      .eq('company_id', access.activeMembership!.companyId)
      .select('*');

    if (updateError) {
      throw new HttpError(500, updateError.message);
    }

    const updatedClient = updatedClientRows?.[0];
    if (!updatedClient) {
      throw new HttpError(404, 'Saved client not found');
    }

    return jsonResponse(200, {
      id: String(updatedClient.id),
      clientCompanyName: String(updatedClient.client_company_name ?? ''),
      clientEmail: String(updatedClient.client_email ?? ''),
      clientPhone: String(updatedClient.client_phone ?? ''),
      clientStreet: String(updatedClient.client_street ?? ''),
      clientHouseNumber: String(updatedClient.client_house_number ?? ''),
      clientCity: String(updatedClient.client_city ?? ''),
      clientPostalCode: String(updatedClient.client_postal_code ?? ''),
      createdAt: String(updatedClient.created_at ?? ''),
      updatedAt: String(updatedClient.updated_at ?? ''),
      lastUsedAt: updatedClient.last_used_at ? String(updatedClient.last_used_at) : null,
      invoiceCount: 0,
      lastInvoiceAt: null,
    });
  }

  const { data: createdClientRows, error: insertError } = await admin
    .from('saved_clients')
    .insert({
      id: clientId,
      company_id: access.activeMembership!.companyId,
      created_by_user_id: session.user.id,
      client_company_name: payload.clientCompanyName,
      client_email: payload.clientEmail,
      client_phone: payload.clientPhone,
      client_street: payload.clientStreet,
      client_house_number: payload.clientHouseNumber,
      client_city: payload.clientCity,
      client_postal_code: payload.clientPostalCode,
      last_used_at: now,
      created_at: now,
      updated_at: now,
    })
    .select('*');

  if (insertError) {
    throw new HttpError(500, insertError.message);
  }

  const createdClient = createdClientRows?.[0];
  if (!createdClient) {
    throw new HttpError(500, 'Failed to create saved client');
  }

  return jsonResponse(201, {
    id: String(createdClient.id),
    clientCompanyName: String(createdClient.client_company_name ?? ''),
    clientEmail: String(createdClient.client_email ?? ''),
    clientPhone: String(createdClient.client_phone ?? ''),
    clientStreet: String(createdClient.client_street ?? ''),
    clientHouseNumber: String(createdClient.client_house_number ?? ''),
    clientCity: String(createdClient.client_city ?? ''),
    clientPostalCode: String(createdClient.client_postal_code ?? ''),
    createdAt: String(createdClient.created_at ?? ''),
    updatedAt: String(createdClient.updated_at ?? ''),
    lastUsedAt: createdClient.last_used_at ? String(createdClient.last_used_at) : null,
    invoiceCount: 0,
    lastInvoiceAt: null,
  });
}

async function handlePatchClient(req: Request, session: SessionRecord, clientId: string) {
  const admin = getAdminClient();
  const access = await requireActiveCompanyAccess(session.user.id);
  const resolvedClientId = requireUuid(clientId, 'Client id');
  const payload = parseSavedClientInput(await readJsonBody(req));
  const now = new Date().toISOString();

  const { data: updatedClientRows, error: updateError } = await admin
    .from('saved_clients')
    .update({
      client_company_name: payload.clientCompanyName,
      client_email: payload.clientEmail,
      client_phone: payload.clientPhone,
      client_street: payload.clientStreet,
      client_house_number: payload.clientHouseNumber,
      client_city: payload.clientCity,
      client_postal_code: payload.clientPostalCode,
      updated_at: now,
    })
    .eq('id', resolvedClientId)
    .eq('company_id', access.activeMembership!.companyId)
    .select('*');

  if (updateError) {
    throw new HttpError(500, updateError.message);
  }

  const updatedClient = updatedClientRows?.[0];
  if (!updatedClient) {
    throw new HttpError(404, 'Saved client not found');
  }

  const { error: invoicesUpdateError } = await admin
    .from('invoices')
    .update({
      client_company_name: payload.clientCompanyName,
      client_email: payload.clientEmail,
      client_phone: payload.clientPhone,
      client_street: payload.clientStreet,
      client_house_number: payload.clientHouseNumber,
      client_city: payload.clientCity,
      client_postal_code: payload.clientPostalCode,
      updated_at: now,
    })
    .eq('saved_client_id', resolvedClientId)
    .eq('company_id', access.activeMembership!.companyId);

  if (invoicesUpdateError) {
    throw new HttpError(500, invoicesUpdateError.message);
  }

  return jsonResponse(200, {
    id: String(updatedClient.id),
    clientCompanyName: String(updatedClient.client_company_name ?? ''),
    clientEmail: String(updatedClient.client_email ?? ''),
    clientPhone: String(updatedClient.client_phone ?? ''),
    clientStreet: String(updatedClient.client_street ?? ''),
    clientHouseNumber: String(updatedClient.client_house_number ?? ''),
    clientCity: String(updatedClient.client_city ?? ''),
    clientPostalCode: String(updatedClient.client_postal_code ?? ''),
    createdAt: String(updatedClient.created_at ?? ''),
    updatedAt: String(updatedClient.updated_at ?? ''),
    lastUsedAt: updatedClient.last_used_at ? String(updatedClient.last_used_at) : null,
    invoiceCount: 0,
    lastInvoiceAt: null,
  });
}

async function handleDeleteClient(session: SessionRecord, clientId: string) {
  const admin = getAdminClient();
  const access = await requireActiveCompanyAccess(session.user.id);
  const resolvedClientId = requireUuid(clientId, 'Client id');

  const { data, error } = await admin
    .from('saved_clients')
    .delete()
    .eq('id', resolvedClientId)
    .eq('company_id', access.activeMembership!.companyId)
    .select('id');

  if (error) {
    throw new HttpError(500, error.message);
  }

  if ((data?.length ?? 0) === 0) {
    throw new HttpError(404, 'Saved client not found');
  }

  return emptyResponse();
}

async function routeRequest(req: Request) {
  const target = await getRequestTarget(req);
  const pathname = normalizePathname(target.pathname.replace(/^\/api/, '') || '/');
  const method = req.method.toUpperCase();

  if (method === 'OPTIONS') {
    return emptyResponse();
  }

  if (method === 'GET' && pathname === '/health') {
    return await handleHealth(req);
  }

  if (method === 'GET' && pathname === '/branding') {
    return await handleBranding();
  }

  const verifyInvoiceMatch = pathname.match(/^\/verify-invoice\/([^/]+)$/);
  if (method === 'GET' && verifyInvoiceMatch) {
    return await handleVerifyInvoice(verifyInvoiceMatch[1]);
  }

  const session = await requireSession(req);

  if (method === 'GET' && pathname === '/companies') {
    return await handleListCompanies(session);
  }

  if (method === 'POST' && pathname === '/companies') {
    return await handleCreateCompany(req, session);
  }

  if (method === 'POST' && pathname === '/companies/active') {
    return await handleSetActiveCompany(req, session);
  }

  const companyMatch = pathname.match(/^\/companies\/([^/]+)$/);
  if (companyMatch) {
    if (method === 'GET') {
      return await handleGetCompany(session, companyMatch[1]);
    }

    if (method === 'PATCH') {
      return await handleUpdateCompany(req, session, companyMatch[1]);
    }
  }

  const companyMembersMatch = pathname.match(/^\/companies\/([^/]+)\/members$/);
  if (companyMembersMatch && method === 'POST') {
    return await handleAddCompanyMember(req, session, companyMembersMatch[1]);
  }

  const companyMembershipMatch = pathname.match(/^\/companies\/([^/]+)\/members\/([^/]+)$/);
  if (companyMembershipMatch) {
    if (method === 'PATCH') {
      return await handleUpdateCompanyMembership(
        req,
        session,
        companyMembershipMatch[1],
        companyMembershipMatch[2],
      );
    }

    if (method === 'DELETE') {
      return await handleDeleteCompanyMembership(
        session,
        companyMembershipMatch[1],
        companyMembershipMatch[2],
      );
    }
  }

  const companyLogoMatch = pathname.match(/^\/companies\/([^/]+)\/logo$/);
  if (companyLogoMatch && method === 'DELETE') {
    return await handleDeleteCompanyLogo(session, companyLogoMatch[1]);
  }

  if (method === 'GET' && pathname === '/users') {
    return await handleListUsers(session);
  }

  const userMatch = pathname.match(/^\/users\/([^/]+)$/);
  if (userMatch && method === 'DELETE') {
    return await handleDeleteUser(session, userMatch[1]);
  }

  if (method === 'GET' && pathname === '/settings/summary') {
    return await handleSettingsSummary(session);
  }

  if (method === 'GET' && pathname === '/settings/sessions') {
    return await handleSettingsSessions(session);
  }

  if (method === 'DELETE' && pathname === '/settings/sessions/others') {
    return await handleDeleteOtherSessions(session);
  }

  const settingsSessionMatch = pathname.match(/^\/settings\/sessions\/([^/]+)$/);
  if (settingsSessionMatch && method === 'DELETE') {
    return await handleDeleteSession(session, settingsSessionMatch[1]);
  }

  const settingsLogoMatch = pathname.match(/^\/settings\/logos\/([^/]+)$/);
  if (settingsLogoMatch && method === 'DELETE') {
    return await handleDeleteSettingsLogo(session, settingsLogoMatch[1]);
  }

  if (method === 'DELETE' && pathname === '/settings/logo') {
    return await handleDeleteCompanyLogoFromSettings(session);
  }

  if (method === 'GET' && pathname === '/dashboard') {
    return await handleDashboard(session, target);
  }

  if (method === 'GET' && pathname === '/clients') {
    return await handleListClients(session);
  }

  if (method === 'POST' && pathname === '/clients') {
    return await handleCreateOrUpdateClient(req, session);
  }

  const clientMatch = pathname.match(/^\/clients\/([^/]+)$/);
  if (clientMatch) {
    if (method === 'PATCH') {
      return await handlePatchClient(req, session, clientMatch[1]);
    }

    if (method === 'DELETE') {
      return await handleDeleteClient(session, clientMatch[1]);
    }
  }

  if (method === 'GET' && pathname === '/invoices') {
    return await handleListInvoices(session, target);
  }

  if (method === 'GET' && pathname === '/invoices/export') {
    return await handleInvoiceExport(session, target);
  }

  if (method === 'GET' && pathname === '/invoices/export/render') {
    return await handleInvoiceExport(session, target);
  }

  if (method === 'POST' && pathname === '/invoices') {
    return await handleSaveInvoice(req, session);
  }

  const invoiceMatch = pathname.match(/^\/invoices\/([^/]+)$/);
  if (invoiceMatch) {
    if (method === 'GET') {
      return await handleGetInvoice(session, invoiceMatch[1]);
    }

    if (method === 'DELETE') {
      return await handleDeleteInvoice(session, invoiceMatch[1]);
    }
  }

  throw new HttpError(404, 'Not found');
}

Deno.serve(async (req) => {
  try {
    return await routeRequest(req);
  } catch (error) {
    if (error instanceof HttpError) {
      return jsonResponse(error.status, { error: error.message });
    }

    console.error('Unhandled app-api error', error);
    return jsonResponse(500, { error: 'Internal server error' });
  }
});
