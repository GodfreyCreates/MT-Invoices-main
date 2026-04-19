import express, { type Express, type Request, type Response } from "express";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import { isIP } from "node:net";
import path from "node:path";
import { and, asc, count, desc, eq, gt, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { fromNodeHeaders, toNodeHandler } from "better-auth/node";
import type { Page } from "puppeteer";
import { createRouteHandler as createUploadthingRouteHandler } from "uploadthing/express";
import { db } from "./src/db";
import { ensureDatabaseSchema } from "./src/db/bootstrap";
import { session as authSessions, user as authUsers } from "./src/db/auth-schema";
import { sendUserInvitationEmail } from "./src/email";
import { auth } from "./src/lib/auth";
import type {
  ActiveCompanySummary,
  AdminCompanySummary,
  CompaniesResponse,
  CompanyDetailResponse,
  CompanyMember,
  CompanyRole,
  CompanySummary,
} from "./src/lib/company";
import { DEFAULT_INVOICE_THEME, isInvoiceThemeId } from "./src/lib/invoice-themes";
import { getAuthSecret, getBaseUrl } from "./src/lib/server-env";
import { companies, companyMemberships, invoices, services, userInvitations } from "./src/db/schema";
import { uploadRouter, utapi } from "./src/uploadthing";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;
const INVITATION_EXPIRY_DAYS = 7;
const CANONICAL_CLIENT_IP_HEADER = "x-client-ip";
const INVOICE_EXPORT_TOKEN_TTL_MS = 5 * 60_000;
const INVOICE_EXPORT_TOKEN_VERSION = 1;
const STRONG_PROXY_IP_HEADERS = [
  "cf-connecting-ip",
  "fly-client-ip",
  "true-client-ip",
  "fastly-client-ip",
] as const;
const FALLBACK_PROXY_IP_HEADERS = ["x-real-ip", "x-forwarded-for"] as const;

type Uuid = `${string}-${string}-${string}-${string}-${string}`;
type JsonRecord = Record<string, unknown>;
type SessionRecord = {
  user: {
    id: string;
    role?: string | null;
  };
};
type CreateAppOptions = {
  serveClientApp?: boolean;
};
type InvoiceExportTokenPayload = {
  version: typeof INVOICE_EXPORT_TOKEN_VERSION;
  companyId: Uuid;
  invoiceIds: Uuid[];
  exp: number;
};
type SanitizedServiceInput = {
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
type SanitizedInvoiceInput = {
  id?: Uuid;
  invoice: {
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
  };
  services: SanitizedServiceInput[];
};
type InviteUserRole = "admin" | "user";
type CompanyMembershipRole = CompanyRole;
type SanitizedCompanyInput = {
  name: string;
  email: string;
  phone: string;
  poBox: string | null;
  streetAddress: string;
  standNumber: string | null;
  bankName: string;
  accountHolder: string;
  accountNumber: string;
  accountType: string;
  branchCode: string;
};
type CompanyAccessMembership = {
  id: string;
  role: CompanyMembershipRole;
  companyId: string;
  company: {
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
    createdAt: Date;
    updatedAt: Date;
    createdByUserId: string | null;
  };
};
type CompanyAccessContext = {
  userId: string;
  isGlobalAdmin: boolean;
  memberships: CompanyAccessMembership[];
  memberCounts: Map<string, number>;
  activeMembership: CompanyAccessMembership | null;
};

class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function isUuid(value: string) {
  return UUID_PATTERN.test(value);
}

function createUuid(): Uuid {
  return randomUUID() as Uuid;
}

function requireUuid(value: string | undefined, field: string) {
  if (!value || !isUuid(value)) {
    throw new HttpError(400, `${field} must be a valid UUID`);
  }

  return value as Uuid;
}

function isAdminSession(session: SessionRecord) {
  return session.user.role === "admin";
}

function getRecord(value: unknown, field: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpError(400, `${field} must be an object`);
  }

  return value as JsonRecord;
}

function getTrimmedString(
  value: unknown,
  field: string,
  options: { allowEmpty?: boolean; maxLength?: number; required?: boolean } = {},
) {
  const { allowEmpty = false, maxLength = 500, required = true } = options;

  if (value == null || value === "") {
    if (!required) {
      return "";
    }
    throw new HttpError(400, `${field} is required`);
  }

  if (typeof value !== "string") {
    throw new HttpError(400, `${field} must be a string`);
  }

  const trimmedValue = value.trim();
  if (!allowEmpty && !trimmedValue) {
    throw new HttpError(400, `${field} is required`);
  }

  if (trimmedValue.length > maxLength) {
    throw new HttpError(400, `${field} is too long`);
  }

  return trimmedValue;
}

function getOptionalString(value: unknown, field: string, maxLength = 2000) {
  if (value == null || value === "") {
    return null;
  }

  return getTrimmedString(value, field, { maxLength });
}

function getDateString(value: unknown, field: string) {
  const dateValue = getTrimmedString(value, field, { maxLength: 10 });
  if (!DATE_PATTERN.test(dateValue)) {
    throw new HttpError(400, `${field} must use YYYY-MM-DD format`);
  }

  return dateValue;
}

function getEmail(value: unknown, field: string) {
  const email = getTrimmedString(value, field, { maxLength: 320 }).toLowerCase();
  if (!EMAIL_PATTERN.test(email)) {
    throw new HttpError(400, `${field} must be a valid email address`);
  }

  return email;
}

function getInviteRole(value: unknown, field: string): InviteUserRole {
  if (value == null || value === "") {
    return "user";
  }

  if (typeof value !== "string") {
    throw new HttpError(400, `${field} must be a string`);
  }

  const normalizedRole = value.trim().toLowerCase();
  if (normalizedRole !== "admin" && normalizedRole !== "user") {
    throw new HttpError(400, `${field} must be either admin or user`);
  }

  return normalizedRole;
}

function isCompanyRole(value: string): value is CompanyMembershipRole {
  return value === "owner" || value === "admin" || value === "member";
}

function getCompanyRole(
  value: unknown,
  field: string,
  options: { defaultValue?: CompanyMembershipRole } = {},
): CompanyMembershipRole {
  const { defaultValue } = options;

  if (value == null || value === "") {
    if (defaultValue) {
      return defaultValue;
    }

    throw new HttpError(400, `${field} is required`);
  }

  if (typeof value !== "string") {
    throw new HttpError(400, `${field} must be a string`);
  }

  const normalizedRole = value.trim().toLowerCase();
  if (!isCompanyRole(normalizedRole)) {
    throw new HttpError(400, `${field} must be owner, admin, or member`);
  }

  return normalizedRole;
}

function parseCompanyInput(value: unknown): SanitizedCompanyInput {
  const payload = getRecord(value, "request body");

  return {
    name: getTrimmedString(payload.name, "name", { maxLength: 160 }),
    email: getEmail(payload.email, "email"),
    phone: getTrimmedString(payload.phone, "phone", { maxLength: 80 }),
    poBox: getOptionalString(payload.poBox, "poBox", 80),
    streetAddress: getTrimmedString(payload.streetAddress, "streetAddress", { maxLength: 240 }),
    standNumber: getOptionalString(payload.standNumber, "standNumber", 80),
    bankName: getTrimmedString(payload.bankName, "bankName", { maxLength: 160 }),
    accountHolder: getTrimmedString(payload.accountHolder, "accountHolder", { maxLength: 160 }),
    accountNumber: getTrimmedString(payload.accountNumber, "accountNumber", { maxLength: 80 }),
    accountType: getTrimmedString(payload.accountType, "accountType", { maxLength: 80 }),
    branchCode: getTrimmedString(payload.branchCode, "branchCode", { maxLength: 40 }),
  };
}

function getInvoiceThemeValue(value: unknown, field: string) {
  if (value == null || value === "") {
    return DEFAULT_INVOICE_THEME;
  }

  if (typeof value !== "string") {
    throw new HttpError(400, `${field} must be a string`);
  }

  const normalizedTheme = value.trim();
  if (!isInvoiceThemeId(normalizedTheme)) {
    throw new HttpError(400, `${field} must be a supported invoice theme`);
  }

  return normalizedTheme;
}

function getHeaderValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value.join(",");
  }

  return value;
}

function normalizeIpAddress(value: string | undefined | null) {
  if (!value) {
    return null;
  }

  let normalizedValue = value.split(",")[0]?.trim();
  if (!normalizedValue) {
    return null;
  }

  if (normalizedValue.startsWith("[") && normalizedValue.includes("]")) {
    normalizedValue = normalizedValue.slice(1, normalizedValue.indexOf("]"));
  }

  if (normalizedValue.startsWith("::ffff:")) {
    normalizedValue = normalizedValue.slice(7);
  }

  if (normalizedValue === "::1") {
    normalizedValue = "127.0.0.1";
  }

  return isIP(normalizedValue) ? normalizedValue : null;
}

function hasProxyContext(req: Request) {
  return Boolean(
    getHeaderValue(req.headers["x-forwarded-host"]) ||
      getHeaderValue(req.headers["x-forwarded-proto"]) ||
      getHeaderValue(req.headers.via),
  );
}

function getFirstValidHeaderIp(
  headers: Request["headers"],
  headerNames: readonly string[],
) {
  for (const headerName of headerNames) {
    const candidate = normalizeIpAddress(getHeaderValue(headers[headerName]));
    if (candidate) {
      return candidate;
    }
  }

  return null;
}

function getSocketIp(req: Request) {
  return normalizeIpAddress(req.socket.remoteAddress) ?? normalizeIpAddress(req.ip);
}

function resolveClientIp(req: Request) {
  const preferredProxyIp = getFirstValidHeaderIp(req.headers, STRONG_PROXY_IP_HEADERS);
  if (preferredProxyIp) {
    return preferredProxyIp;
  }

  if (hasProxyContext(req)) {
    const forwardedIp = getFirstValidHeaderIp(req.headers, FALLBACK_PROXY_IP_HEADERS);
    if (forwardedIp) {
      return forwardedIp;
    }
  }

  return getSocketIp(req) ?? "127.0.0.1";
}

function canEditCompany(
  isGlobalAdmin: boolean,
  membershipRole: CompanyMembershipRole | null,
) {
  return isGlobalAdmin || membershipRole === "owner" || membershipRole === "admin";
}

function canManageCompanyMembers(
  isGlobalAdmin: boolean,
  membershipRole: CompanyMembershipRole | null,
) {
  return isGlobalAdmin || membershipRole === "owner" || membershipRole === "admin";
}

function canAddCompanyMembers(isGlobalAdmin: boolean) {
  return isGlobalAdmin;
}

function getCompanyRoleRank(role: CompanyMembershipRole) {
  if (role === "owner") {
    return 0;
  }

  if (role === "admin") {
    return 1;
  }

  return 2;
}

function getMembershipMutationPermissions({
  actorIsGlobalAdmin,
  actorRole,
  targetRole,
  ownerCount,
}: {
  actorIsGlobalAdmin: boolean;
  actorRole: CompanyMembershipRole | null;
  targetRole: CompanyMembershipRole;
  ownerCount: number;
}) {
  if (!canManageCompanyMembers(actorIsGlobalAdmin, actorRole)) {
    return {
      canChangeRole: false,
      canRemove: false,
    };
  }

  if (!actorIsGlobalAdmin && actorRole === "admin" && targetRole === "owner") {
    return {
      canChangeRole: false,
      canRemove: false,
    };
  }

  const isLastOwner = targetRole === "owner" && ownerCount <= 1;

  return {
    canChangeRole: !isLastOwner,
    canRemove: !isLastOwner,
  };
}

function getCompanyPermissions(
  isGlobalAdmin: boolean,
  membershipRole: CompanyMembershipRole | null,
) {
  return {
    canEditCompany: canEditCompany(isGlobalAdmin, membershipRole),
    canManageMembers: canManageCompanyMembers(isGlobalAdmin, membershipRole),
    canAddMembers: canAddCompanyMembers(isGlobalAdmin),
  };
}

function serializeCompanySummary(
  membership: CompanyAccessMembership,
  memberCount: number,
): CompanySummary {
  return {
    id: membership.company.id,
    name: membership.company.name,
    documentLogoUrl: membership.company.documentLogoUrl ?? null,
    membershipRole: membership.role,
    memberCount,
    createdAt: membership.company.createdAt.toISOString(),
    updatedAt: membership.company.updatedAt.toISOString(),
  };
}

function serializeActiveCompany(
  membership: CompanyAccessMembership,
  memberCount: number,
  isGlobalAdmin: boolean,
): ActiveCompanySummary {
  return {
    ...serializeCompanySummary(membership, memberCount),
    email: membership.company.email,
    phone: membership.company.phone,
    poBox: membership.company.poBox ?? "",
    streetAddress: membership.company.streetAddress,
    standNumber: membership.company.standNumber ?? "",
    bankName: membership.company.bankName,
    accountHolder: membership.company.accountHolder,
    accountNumber: membership.company.accountNumber,
    accountType: membership.company.accountType,
    branchCode: membership.company.branchCode,
    permissions: getCompanyPermissions(isGlobalAdmin, membership.role),
  };
}

function serializeStandaloneCompany(
  company: CompanyAccessMembership["company"],
  memberCount: number,
  isGlobalAdmin: boolean,
  membershipRole: CompanyMembershipRole | null,
): ActiveCompanySummary {
  return {
    id: company.id,
    name: company.name,
    documentLogoUrl: company.documentLogoUrl ?? null,
    membershipRole: membershipRole ?? "admin",
    memberCount,
    createdAt: company.createdAt.toISOString(),
    updatedAt: company.updatedAt.toISOString(),
    email: company.email,
    phone: company.phone,
    poBox: company.poBox ?? "",
    streetAddress: company.streetAddress,
    standNumber: company.standNumber ?? "",
    bankName: company.bankName,
    accountHolder: company.accountHolder,
    accountNumber: company.accountNumber,
    accountType: company.accountType,
    branchCode: company.branchCode,
    permissions: getCompanyPermissions(isGlobalAdmin, membershipRole),
  };
}

async function getCompanyAccessContext(userId: string): Promise<CompanyAccessContext> {
  const [currentUser] = await db
    .select({
      role: authUsers.role,
      activeCompanyId: authUsers.activeCompanyId,
    })
    .from(authUsers)
    .where(eq(authUsers.id, userId))
    .limit(1);

  if (!currentUser) {
    throw new HttpError(404, "User profile not found");
  }

  const memberships = await db.query.companyMemberships.findMany({
    where: eq(companyMemberships.userId, userId),
    with: {
      company: true,
    },
  });

  const sortedMemberships = memberships
    .map(
      (membership): CompanyAccessMembership => ({
        ...membership,
        role: membership.role as CompanyMembershipRole,
      }),
    )
    .sort((left, right) => left.company.name.localeCompare(right.company.name));

  const companyIds = sortedMemberships.map((membership) => membership.companyId);
  const memberCounts =
    companyIds.length > 0
      ? await db
          .select({
            companyId: companyMemberships.companyId,
            memberCount: count(),
          })
          .from(companyMemberships)
          .where(inArray(companyMemberships.companyId, companyIds))
          .groupBy(companyMemberships.companyId)
      : [];

  const memberCountMap = new Map(
    memberCounts.map((row) => [row.companyId, Number(row.memberCount)]),
  );

  const activeMembership =
    sortedMemberships.find((membership) => membership.companyId === currentUser.activeCompanyId) ??
    sortedMemberships[0] ??
    null;

  const nextActiveCompanyId = activeMembership?.companyId ?? null;
  if (currentUser.activeCompanyId !== nextActiveCompanyId) {
    await db
      .update(authUsers)
      .set({
        activeCompanyId: nextActiveCompanyId,
        updatedAt: new Date(),
      })
      .where(eq(authUsers.id, userId));
  }

  return {
    userId,
    isGlobalAdmin: currentUser.role === "admin",
    memberships: sortedMemberships,
    memberCounts: memberCountMap,
    activeMembership,
  };
}

async function getRequiredActiveCompanyContext(userId: string) {
  const access = await getCompanyAccessContext(userId);
  if (!access.activeMembership) {
    throw new HttpError(409, "Create a company to continue");
  }

  return access;
}

async function buildCompaniesResponse(userId: string): Promise<CompaniesResponse> {
  const access = await getCompanyAccessContext(userId);

  const companiesResponse: CompaniesResponse = {
    companies: access.memberships.map((membership) =>
      serializeCompanySummary(
        membership,
        access.memberCounts.get(membership.companyId) ?? 0,
      ),
    ),
    activeCompany: access.activeMembership
      ? serializeActiveCompany(
          access.activeMembership,
          access.memberCounts.get(access.activeMembership.companyId) ?? 0,
          access.isGlobalAdmin,
        )
      : null,
    isGlobalAdmin: access.isGlobalAdmin,
  };

  if (access.isGlobalAdmin) {
    const allCompanies = await db.query.companies.findMany({
      with: {
        createdBy: {
          columns: {
            name: true,
          },
        },
        memberships: {
          columns: {
            id: true,
          },
        },
      },
      orderBy: [desc(companies.updatedAt), desc(companies.createdAt)],
    });

    companiesResponse.allCompanies = allCompanies.map((company): AdminCompanySummary => ({
      id: company.id,
      name: company.name,
      documentLogoUrl: company.documentLogoUrl ?? null,
      memberCount: company.memberships.length,
      createdAt: company.createdAt.toISOString(),
      updatedAt: company.updatedAt.toISOString(),
      createdByName: company.createdBy?.name ?? null,
    }));
  }

  return companiesResponse;
}

async function getCompanyMembershipActionContext(
  userId: string,
  companyId: string,
  membershipId: string,
) {
  const access = await getCompanyAccessContext(userId);
  const viewerMembership =
    access.memberships.find((membership) => membership.companyId === companyId) ?? null;

  if (!access.isGlobalAdmin && !viewerMembership) {
    throw new HttpError(403, "You do not have access to this company");
  }

  const memberships = await db
    .select({
      id: companyMemberships.id,
      userId: companyMemberships.userId,
      role: companyMemberships.role,
    })
    .from(companyMemberships)
    .where(eq(companyMemberships.companyId, companyId));

  const targetMembership = memberships.find((membership) => membership.id === membershipId);
  if (!targetMembership) {
    throw new HttpError(404, "Membership not found");
  }

  const ownerCount = memberships.filter((membership) => membership.role === "owner").length;
  const permissions = getMembershipMutationPermissions({
    actorIsGlobalAdmin: access.isGlobalAdmin,
    actorRole: viewerMembership?.role ?? null,
    targetRole: targetMembership.role as CompanyMembershipRole,
    ownerCount,
  });

  return {
    access,
    viewerMembership,
    targetMembership: {
      ...targetMembership,
      role: targetMembership.role as CompanyMembershipRole,
    },
    ownerCount,
    permissions,
  };
}

async function getCompanyDetailResponse(
  userId: string,
  companyId: string,
): Promise<CompanyDetailResponse> {
  const access = await getCompanyAccessContext(userId);
  const viewerMembership =
    access.memberships.find((membership) => membership.companyId === companyId) ?? null;

  if (!access.isGlobalAdmin && !viewerMembership) {
    throw new HttpError(403, "You do not have access to this company");
  }

  const companyRecord =
    viewerMembership?.company ??
    (await db.query.companies.findFirst({
      where: eq(companies.id, companyId),
    }));

  if (!companyRecord) {
    throw new HttpError(404, "Company not found");
  }

  const memberships = await db.query.companyMemberships.findMany({
    where: eq(companyMemberships.companyId, companyId),
    with: {
      user: {
        columns: {
          id: true,
          name: true,
          email: true,
          image: true,
        },
      },
    },
  });

  const ownerCount = memberships.filter((membership) => membership.role === "owner").length;
  const memberCount = memberships.length;
  const actorRole = viewerMembership?.role ?? null;

  const members = memberships
    .sort((left, right) => {
      const roleComparison =
        getCompanyRoleRank(left.role as CompanyMembershipRole) -
        getCompanyRoleRank(right.role as CompanyMembershipRole);
      if (roleComparison !== 0) {
        return roleComparison;
      }

      return left.user.name.localeCompare(right.user.name);
    })
    .map((membership): CompanyMember => {
      const permissions = getMembershipMutationPermissions({
        actorIsGlobalAdmin: access.isGlobalAdmin,
        actorRole,
        targetRole: membership.role as CompanyMembershipRole,
        ownerCount,
      });

      return {
        id: membership.id,
        userId: membership.userId,
        name: membership.user.name,
        email: membership.user.email,
        image: membership.user.image,
        membershipRole: membership.role as CompanyMembershipRole,
        joinedAt: membership.createdAt.toISOString(),
        isCurrentUser: membership.userId === userId,
        canChangeRole: permissions.canChangeRole,
        canRemove: permissions.canRemove,
      };
    });

  return {
    company: serializeStandaloneCompany(
      companyRecord,
      memberCount,
      access.isGlobalAdmin,
      actorRole,
    ),
    members,
  };
}

async function setUserActiveCompany(userId: string, companyId: string | null) {
  await db
    .update(authUsers)
    .set({
      activeCompanyId: companyId,
      updatedAt: new Date(),
    })
    .where(eq(authUsers.id, userId));
}

function applyAuthRequestMetadata(req: Request) {
  req.headers[CANONICAL_CLIENT_IP_HEADER] = resolveClientIp(req);

  const userAgent = getHeaderValue(req.headers["user-agent"])?.trim();
  if (!userAgent) {
    req.headers["user-agent"] = "Unknown device";
  }
}

function serializeInvoiceRecord<
  TInvoice extends {
    company?: {
      id: string;
      name: string;
      email: string;
      phone: string;
      poBox: string | null;
      streetAddress: string;
      standNumber: string | null;
      documentLogoUrl: string | null;
      bankName: string;
      accountHolder: string;
      accountNumber: string;
      accountType: string;
      branchCode: string;
    } | null;
  },
>(invoice: TInvoice) {
  const { company, ...rest } = invoice;

  return {
    ...rest,
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

async function getSerializedInvoicesForExport(companyId: string, invoiceIds: string[]) {
  const records = await db.query.invoices.findMany({
    where: and(eq(invoices.companyId, companyId), inArray(invoices.id, invoiceIds)),
    with: {
      company: {
        columns: {
          id: true,
          name: true,
          email: true,
          phone: true,
          poBox: true,
          streetAddress: true,
          standNumber: true,
          documentLogoUrl: true,
          bankName: true,
          accountHolder: true,
          accountNumber: true,
          accountType: true,
          branchCode: true,
        },
      },
      services: true,
    },
  });

  const serializedInvoices = records.map((invoice) => serializeInvoiceRecord(invoice));
  const invoicesById = new Map(
    serializedInvoices.map((invoice) => [invoice.id, invoice] as const),
  );
  const orderedInvoices = invoiceIds
    .map((invoiceId) => invoicesById.get(invoiceId))
    .filter((invoice): invoice is (typeof serializedInvoices)[number] => Boolean(invoice));

  if (orderedInvoices.length !== invoiceIds.length) {
    throw new HttpError(404, "One or more invoices could not be found");
  }

  return orderedInvoices;
}

function getDecimalString(
  value: unknown,
  field: string,
  options: { max?: number; min?: number } = {},
) {
  const { max = Number.MAX_SAFE_INTEGER, min = 0 } = options;

  const numericValue =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
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

function parseServiceInput(value: unknown, index: number): SanitizedServiceInput {
  const service = getRecord(value, `services[${index}]`);

  return {
    date: getDateString(service.date, `services[${index}].date`),
    sender: getTrimmedString(service.sender, `services[${index}].sender`, { maxLength: 200 }),
    receiver: getTrimmedString(service.receiver, `services[${index}].receiver`, { maxLength: 200 }),
    reference: getTrimmedString(service.reference, `services[${index}].reference`, { maxLength: 100 }),
    service: getTrimmedString(service.service, `services[${index}].service`, { maxLength: 200 }),
    quantity: getDecimalString(service.quantity, `services[${index}].quantity`),
    unitPrice: getDecimalString(service.unitPrice, `services[${index}].unitPrice`),
    discountPercent: getDecimalString(service.discountPercent, `services[${index}].discountPercent`, { max: 100 }),
    taxPercent: getDecimalString(service.taxPercent, `services[${index}].taxPercent`, { max: 100 }),
  };
}

function parseInvoiceInput(value: unknown): SanitizedInvoiceInput {
  const payload = getRecord(value, "request body");
  const rawServices = payload.services;

  if (!Array.isArray(rawServices)) {
    throw new HttpError(400, "services must be an array");
  }

  const rawId = payload.id;
  const id =
    typeof rawId === "string" && rawId.trim()
      ? requireUuid(rawId.trim(), "Invoice id")
      : undefined;

  return {
    id,
    invoice: {
      clientCompanyName: getTrimmedString(payload.clientCompanyName, "clientCompanyName", { maxLength: 200 }),
      clientEmail: getEmail(payload.clientEmail, "clientEmail"),
      clientPhone: getTrimmedString(payload.clientPhone, "clientPhone", { maxLength: 50 }),
      clientStreet: getTrimmedString(payload.clientStreet, "clientStreet", { maxLength: 200 }),
      clientHouseNumber: getTrimmedString(payload.clientHouseNumber, "clientHouseNumber", { maxLength: 100 }),
      clientCity: getTrimmedString(payload.clientCity, "clientCity", { maxLength: 120 }),
      clientPostalCode: getTrimmedString(payload.clientPostalCode, "clientPostalCode", { maxLength: 20 }),
      invoiceNo: getTrimmedString(payload.invoiceNo, "invoiceNo", { maxLength: 100 }),
      issueDate: getDateString(payload.issueDate, "issueDate"),
      dueDate: getDateString(payload.dueDate, "dueDate"),
      paymentTerms: getTrimmedString(payload.paymentTerms, "paymentTerms", { maxLength: 100 }),
      theme: getInvoiceThemeValue(payload.theme, "theme"),
      notes: getOptionalString(payload.notes, "notes"),
      authorizedSignature: getTrimmedString(payload.authorizedSignature, "authorizedSignature", { maxLength: 120 }),
    },
    services: rawServices.map((service, index) => parseServiceInput(service, index)),
  };
}

function buildInvoiceListWhere(companyId: string) {
  return eq(invoices.companyId, companyId);
}

function buildInvoiceIdWhere(companyId: string, invoiceId: string) {
  return and(eq(invoices.id, invoiceId), eq(invoices.companyId, companyId));
}

function getInvoiceRevenueSql() {
  return sql<number>`
    coalesce(
      sum(
        (
          cast(${services.quantity} as numeric) * cast(${services.unitPrice} as numeric)
        ) * (
          1 - cast(${services.discountPercent} as numeric) / 100
        ) * (
          1 + cast(${services.taxPercent} as numeric) / 100
        )
      ),
      0
    )
  `;
}

function parseInvoiceIds(value: unknown, field: string) {
  const rawValues = Array.isArray(value)
    ? value.flatMap((entry) => (typeof entry === "string" ? entry.split(",") : []))
    : typeof value === "string"
      ? value.split(",")
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

function signInvoiceExportPayload(encodedPayload: string) {
  return createHmac("sha256", getAuthSecret()).update(encodedPayload).digest("base64url");
}

function createInvoiceExportToken(companyId: string, invoiceIds: string[]) {
  const payload: InvoiceExportTokenPayload = {
    version: INVOICE_EXPORT_TOKEN_VERSION,
    companyId: requireUuid(companyId, "companyId"),
    invoiceIds: parseInvoiceIds(invoiceIds, "invoiceIds"),
    exp: Date.now() + INVOICE_EXPORT_TOKEN_TTL_MS,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");

  return `${encodedPayload}.${signInvoiceExportPayload(encodedPayload)}`;
}

function verifyInvoiceExportToken(value: unknown): InvoiceExportTokenPayload {
  const token = getTrimmedString(value, "exportToken", { maxLength: 10_000 });
  const [encodedPayload, signature, extraSegment] = token.split(".");

  if (!encodedPayload || !signature || extraSegment) {
    throw new HttpError(401, "Invalid invoice export token");
  }

  const expectedSignature = signInvoiceExportPayload(encodedPayload);
  const signatureBuffer = Buffer.from(signature, "base64url");
  const expectedSignatureBuffer = Buffer.from(expectedSignature, "base64url");

  if (
    signatureBuffer.length !== expectedSignatureBuffer.length ||
    !timingSafeEqual(signatureBuffer, expectedSignatureBuffer)
  ) {
    throw new HttpError(401, "Invalid invoice export token");
  }

  let payloadRecord: JsonRecord;

  try {
    const decodedPayload = Buffer.from(encodedPayload, "base64url").toString("utf8");
    payloadRecord = getRecord(JSON.parse(decodedPayload), "exportToken");
  } catch {
    throw new HttpError(401, "Invalid invoice export token");
  }

  if (payloadRecord.version !== INVOICE_EXPORT_TOKEN_VERSION) {
    throw new HttpError(401, "Invalid invoice export token");
  }

  const exp = typeof payloadRecord.exp === "number" ? payloadRecord.exp : Number.NaN;
  if (!Number.isFinite(exp)) {
    throw new HttpError(401, "Invalid invoice export token");
  }

  if (exp <= Date.now()) {
    throw new HttpError(401, "Invoice export link has expired");
  }

  return {
    version: INVOICE_EXPORT_TOKEN_VERSION,
    companyId: requireUuid(
      typeof payloadRecord.companyId === "string" ? payloadRecord.companyId : "",
      "companyId",
    ),
    invoiceIds: parseInvoiceIds(payloadRecord.invoiceIds, "invoiceIds"),
    exp,
  };
}

function sanitizeDownloadFilename(value: string, fallback: string) {
  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return fallback;
  }

  const sanitizedValue = trimmedValue
    .replace(/[<>:"/\\|?*\u0000-\u001F]+/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  return sanitizedValue || fallback;
}

function getRequestOrigin(req: Request) {
  const forwardedProtocol = getHeaderValue(req.headers["x-forwarded-proto"])
    ?.split(",")[0]
    ?.trim();
  const protocol = forwardedProtocol || req.protocol || new URL(getBaseUrl()).protocol.replace(":", "");
  const host = getHeaderValue(req.headers.host)?.trim();

  if (!host) {
    return getBaseUrl();
  }

  return `${protocol}://${host}`;
}

function getChromeExecutablePath() {
  const configuredExecutable =
    process.env.PUPPETEER_EXECUTABLE_PATH?.trim() || process.env.CHROME_BIN?.trim();

  if (configuredExecutable && fs.existsSync(configuredExecutable)) {
    return configuredExecutable;
  }

  const platformCandidates =
    process.platform === "win32"
      ? [
          "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
          "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
          "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
          "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
        ]
      : process.platform === "darwin"
        ? [
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
          ]
        : [
            "/usr/bin/google-chrome",
            "/usr/bin/google-chrome-stable",
            "/usr/bin/chromium-browser",
            "/usr/bin/chromium",
            "/snap/bin/chromium",
            "/usr/bin/microsoft-edge",
          ];

  return platformCandidates.find((candidate) => fs.existsSync(candidate));
}

async function applyRequestCookiesToPage(page: Page, origin: string, cookieHeader?: string) {
  if (!cookieHeader?.trim()) {
    return;
  }

  const cookies = cookieHeader
    .split(";")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const separatorIndex = entry.indexOf("=");
      if (separatorIndex <= 0) {
        return null;
      }

      const name = entry.slice(0, separatorIndex).trim();
      const value = entry.slice(separatorIndex + 1).trim();

      // CDP rejects cookies with empty name/value or names containing whitespace/control chars
      if (!name || /[\s\x00-\x1f\x7f]/.test(name)) {
        return null;
      }

      return { name, value, url: origin };
    })
    .filter((cookie): cookie is { name: string; value: string; url: string } => Boolean(cookie));

  // Set cookies individually so one invalid entry doesn't abort the rest
  for (const cookie of cookies) {
    try {
      await page.setCookie(cookie);
    } catch {
      // Skip cookies rejected by CDP (e.g. invalid encoding)
    }
  }
}

async function waitForPdfDocument(page: Page) {
  await page.waitForSelector('[data-pdf-ready="true"], [data-pdf-error="true"]', {
    timeout: 30_000,
  });

  const errorMessage = await page
    .$eval('[data-pdf-error="true"]', (element) => element.textContent?.trim() || "PDF render failed")
    .catch(() => null);

  if (errorMessage) {
    throw new Error(errorMessage);
  }

  await page
    .waitForNetworkIdle({
      idleTime: 500,
      timeout: 5_000,
    })
    .catch(() => undefined);
}

async function renderPdfFromRoute(req: Request, routePath: string) {
  const origin = getRequestOrigin(req);
  const targetUrl = new URL(routePath, origin).toString();
  const executablePath = getChromeExecutablePath();
  const { default: puppeteer } = await import("puppeteer");
  const browser = await puppeteer.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();

    try {
      await page.setViewport({
        width: 1440,
        height: 1024,
        deviceScaleFactor: 1,
      });
      await applyRequestCookiesToPage(page, origin, req.headers.cookie);
      await page.emulateMediaType("print");

      const response = await page.goto(targetUrl, {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
      });

      if (response && !response.ok()) {
        throw new Error(`Print route returned ${response.status()} ${response.statusText()}`);
      }

      await waitForPdfDocument(page);

      const pdfBytes = await page.pdf({
        format: "A4",
        printBackground: true,
        preferCSSPageSize: true,
        margin: {
          top: "0",
          right: "0",
          bottom: "0",
          left: "0",
        },
      });

      return Buffer.from(pdfBytes);
    } finally {
      await page.close();
    }
  } finally {
    await browser.close();
  }
}

function getInvitationLink(token: string) {
  return `${getBaseUrl()}/invite/${token}`;
}

async function getInvitationByToken(token: string) {
  const invitations = await db
    .select()
    .from(userInvitations)
    .where(eq(userInvitations.token, token))
    .limit(1);

  return invitations[0] ?? null;
}

function assertInvitationIsOpen(invitation: {
  acceptedAt: Date | null;
  revokedAt: Date | null;
  expiresAt: Date;
}) {
  if (invitation.acceptedAt) {
    throw new HttpError(409, "This invitation has already been used");
  }

  if (invitation.revokedAt) {
    throw new HttpError(410, "This invitation is no longer active");
  }

  if (new Date(invitation.expiresAt).getTime() <= Date.now()) {
    throw new HttpError(410, "This invitation has expired");
  }
}

async function getAuthenticatedSession(req: Request, res: Response) {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });

    if (!session) {
      res.status(401).json({ error: "Unauthorized" });
      return null;
    }

    return session as SessionRecord;
  } catch (error) {
    console.error("Failed to resolve session", error);
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
}

async function getOptionalSession(req: Request) {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });

    return (session as SessionRecord | null) ?? null;
  } catch (error) {
    console.error("Failed to resolve session", error);
    return null;
  }
}

function handleRouteError(res: Response, error: unknown, defaultMessage: string) {
  if (error instanceof HttpError) {
    res.status(error.status).json({ error: error.message });
    return;
  }

  console.error(defaultMessage, error);
  res.status(500).json({ error: defaultMessage });
}

async function removeUserLogo(userId: string, logoKind: "site" | "document") {
  const [currentUser] = await db
    .select({
      siteLogoKey: authUsers.siteLogoKey,
      documentLogoKey: authUsers.documentLogoKey,
    })
    .from(authUsers)
    .where(eq(authUsers.id, userId))
    .limit(1);

  await db
    .update(authUsers)
    .set({
      ...(logoKind === "site"
        ? {
            siteLogoKey: null,
            siteLogoUrl: null,
          }
        : {
            documentLogoKey: null,
            documentLogoUrl: null,
          }),
      updatedAt: new Date(),
    })
    .where(eq(authUsers.id, userId));

  const logoKeyToDelete =
    logoKind === "site" ? currentUser?.siteLogoKey : currentUser?.documentLogoKey;

  if (logoKeyToDelete) {
    try {
      await utapi.deleteFiles(logoKeyToDelete);
    } catch (error) {
      console.error("Failed to delete logo from UploadThing", error);
    }
  }
}

async function removeCompanyDocumentLogo(companyId: string) {
  const [currentCompany] = await db
    .select({
      documentLogoKey: companies.documentLogoKey,
    })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);

  await db
    .update(companies)
    .set({
      documentLogoKey: null,
      documentLogoUrl: null,
      updatedAt: new Date(),
    })
    .where(eq(companies.id, companyId));

  if (currentCompany?.documentLogoKey) {
    try {
      await utapi.deleteFiles(currentCompany.documentLogoKey);
    } catch (error) {
      console.error("Failed to delete company logo from UploadThing", error);
    }
  }
}

export async function createApp(options: CreateAppOptions = {}): Promise<Express> {
  await ensureDatabaseSchema();

  const app = express();

  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));

  app.use("/api/uploadthing", createUploadthingRouteHandler({ router: uploadRouter }));

  const authHandler = toNodeHandler(auth);

  app.all("/api/auth/*", (req, res) => {
    applyAuthRequestMetadata(req);
    return authHandler(req, res);
  });

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.post("/api/invitations", async (req, res) => {
    const session = await getAuthenticatedSession(req, res);
    if (!session) {
      return;
    }

    if (!isAdminSession(session)) {
      res.status(403).json({ error: "Only admins can send invitations" });
      return;
    }

    try {
      const payload = getRecord(req.body, "request body");
      const email = getEmail(payload.email, "email");
      const role = getInviteRole(payload.role, "role");

      const [inviter, existingUser] = await Promise.all([
        db
          .select({
            name: authUsers.name,
          })
          .from(authUsers)
          .where(eq(authUsers.id, session.user.id))
          .limit(1),
        db
          .select({ id: authUsers.id })
          .from(authUsers)
          .where(eq(authUsers.email, email))
          .limit(1),
      ]);

      if (existingUser[0]) {
        throw new HttpError(409, "A user with this email already exists");
      }

      const now = new Date();
      const expiresAt = new Date(now.getTime() + INVITATION_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
      const token = createUuid();

      // Neon HTTP does not support transactions, so we revoke any open invite first
      // and then create the replacement invite in a second query.
      await db
        .update(userInvitations)
        .set({
          revokedAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(userInvitations.email, email),
            isNull(userInvitations.acceptedAt),
            isNull(userInvitations.revokedAt),
            gt(userInvitations.expiresAt, now),
          ),
        );

      await db.insert(userInvitations).values({
        email,
        role,
        token,
        inviterUserId: session.user.id,
        expiresAt,
        createdAt: now,
        updatedAt: now,
      });

      await sendUserInvitationEmail({
        email,
        inviterName: inviter[0]?.name ?? "MT Legacy Admin",
        invitationUrl: getInvitationLink(token),
      });

      res.status(201).json({
        email,
        role,
        invitationUrl: getInvitationLink(token),
        expiresAt,
      });
    } catch (error) {
      handleRouteError(res, error, "Failed to send invitation");
    }
  });

  app.get("/api/invitations/:token", async (req, res) => {
    try {
      const token = requireUuid(req.params.token, "Invitation token");
      const invitation = await getInvitationByToken(token);

      if (!invitation) {
        res.status(404).json({ error: "Invitation not found" });
        return;
      }

      assertInvitationIsOpen(invitation);

      res.json({
        email: invitation.email,
        role: invitation.role,
        expiresAt: invitation.expiresAt,
      });
    } catch (error) {
      handleRouteError(res, error, "Failed to load invitation");
    }
  });

  app.post("/api/invitations/:token/accept", async (req, res) => {
    try {
      const token = requireUuid(req.params.token, "Invitation token");
      const payload = getRecord(req.body, "request body");
      const name = getTrimmedString(payload.name, "name", { maxLength: 120 });
      const password = getTrimmedString(payload.password, "password", { maxLength: 128 });

      if (password.length < MIN_PASSWORD_LENGTH) {
        throw new HttpError(400, `Password must be at least ${MIN_PASSWORD_LENGTH} characters long`);
      }

      const invitation = await getInvitationByToken(token);
      if (!invitation) {
        throw new HttpError(404, "Invitation not found");
      }

      assertInvitationIsOpen(invitation);

      const existingUser = await db
        .select({ id: authUsers.id })
        .from(authUsers)
        .where(eq(authUsers.email, invitation.email))
        .limit(1);

      if (existingUser[0]) {
        throw new HttpError(409, "An account for this email already exists");
      }

      const invitationRole = getInviteRole(invitation.role, "invitation role");

      const created = await auth.api.createUser({
        body: {
          email: invitation.email,
          password,
          name,
          role: invitationRole,
          data: {
            emailVerified: true,
          },
        },
      });

      await db
        .update(authUsers)
        .set({
          emailVerified: true,
          updatedAt: new Date(),
        })
        .where(eq(authUsers.id, created.user.id));

      await db
        .update(userInvitations)
        .set({
          acceptedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(userInvitations.id, invitation.id));

      res.status(201).json({
        email: invitation.email,
        user: created.user,
      });
    } catch (error) {
      handleRouteError(res, error, "Failed to accept invitation");
    }
  });

  app.get("/api/verify-invoice/:token", async (req, res) => {
    try {
      const token = requireUuid(req.params.token, "Verification token");
      const invoice = await db.query.invoices.findFirst({
        where: eq(invoices.verificationToken, token),
        columns: {
          clientCompanyName: true,
          dueDate: true,
          invoiceNo: true,
          issueDate: true,
          paymentTerms: true,
          verificationToken: true,
        },
      });

      if (!invoice) {
        res.status(404).json({ error: "Invoice could not be verified" });
        return;
      }

      res.json({
        verified: true,
        invoiceNo: invoice.invoiceNo,
        clientCompanyName: invoice.clientCompanyName,
        issueDate: invoice.issueDate,
        dueDate: invoice.dueDate,
        paymentTerms: invoice.paymentTerms,
        verificationId: invoice.verificationToken,
      });
    } catch (error) {
      handleRouteError(res, error, "Failed to verify invoice");
    }
  });

  app.get("/api/companies", async (req, res) => {
    const session = await getAuthenticatedSession(req, res);
    if (!session) {
      return;
    }

    try {
      res.json(await buildCompaniesResponse(session.user.id));
    } catch (error) {
      handleRouteError(res, error, "Failed to fetch companies");
    }
  });

  app.post("/api/companies", async (req, res) => {
    const session = await getAuthenticatedSession(req, res);
    if (!session) {
      return;
    }

    try {
      const payload = parseCompanyInput(req.body);
      const access = await getCompanyAccessContext(session.user.id);
      const [currentUser] = await db
        .select({
          documentLogoUrl: authUsers.documentLogoUrl,
          documentLogoKey: authUsers.documentLogoKey,
        })
        .from(authUsers)
        .where(eq(authUsers.id, session.user.id))
        .limit(1);

      if (!currentUser) {
        throw new HttpError(404, "User profile not found");
      }

      const shouldSeedLegacyData = access.memberships.length === 0;
      const companyId = createUuid();
      const membershipId = createUuid();
      const now = new Date();

      await db.batch([
        db.insert(companies).values({
          id: companyId,
          ...payload,
          documentLogoUrl: shouldSeedLegacyData ? currentUser.documentLogoUrl ?? null : null,
          documentLogoKey: shouldSeedLegacyData ? currentUser.documentLogoKey ?? null : null,
          createdByUserId: session.user.id,
          createdAt: now,
          updatedAt: now,
        }),
        db.insert(companyMemberships).values({
          id: membershipId,
          companyId,
          userId: session.user.id,
          role: "owner",
          createdAt: now,
          updatedAt: now,
        }),
        db
          .update(authUsers)
          .set({
            activeCompanyId: companyId,
            updatedAt: now,
          })
          .where(eq(authUsers.id, session.user.id)),
      ]);

      if (shouldSeedLegacyData) {
        await db
          .update(invoices)
          .set({
            companyId,
            updatedAt: now,
          })
          .where(and(eq(invoices.userId, session.user.id), isNull(invoices.companyId)));
      }

      res.status(201).json(await buildCompaniesResponse(session.user.id));
    } catch (error) {
      handleRouteError(res, error, "Failed to create company");
    }
  });

  app.post("/api/companies/active", async (req, res) => {
    const session = await getAuthenticatedSession(req, res);
    if (!session) {
      return;
    }

    try {
      const payload = getRecord(req.body, "request body");
      const companyId = requireUuid(
        getTrimmedString(payload.companyId, "companyId", { maxLength: 36 }),
        "companyId",
      );
      const access = await getCompanyAccessContext(session.user.id);
      const canAccessCompany = access.memberships.some((membership) => membership.companyId === companyId);

      if (!canAccessCompany) {
        throw new HttpError(403, "You do not have access to this company");
      }

      await setUserActiveCompany(session.user.id, companyId);
      res.json(await buildCompaniesResponse(session.user.id));
    } catch (error) {
      handleRouteError(res, error, "Failed to switch company");
    }
  });

  app.get("/api/companies/:id", async (req, res) => {
    const session = await getAuthenticatedSession(req, res);
    if (!session) {
      return;
    }

    try {
      const companyId = requireUuid(req.params.id, "Company id");
      res.json(await getCompanyDetailResponse(session.user.id, companyId));
    } catch (error) {
      handleRouteError(res, error, "Failed to fetch company details");
    }
  });

  app.patch("/api/companies/:id", async (req, res) => {
    const session = await getAuthenticatedSession(req, res);
    if (!session) {
      return;
    }

    try {
      const companyId = requireUuid(req.params.id, "Company id");
      const payload = parseCompanyInput(req.body);
      const access = await getCompanyAccessContext(session.user.id);
      const viewerMembership =
        access.memberships.find((membership) => membership.companyId === companyId) ?? null;

      if (!access.isGlobalAdmin && !viewerMembership) {
        throw new HttpError(403, "You do not have access to this company");
      }

      if (!canEditCompany(access.isGlobalAdmin, viewerMembership?.role ?? null)) {
        throw new HttpError(403, "Only company owners or admins can update company details");
      }

      const updatedCompany = await db
        .update(companies)
        .set({
          ...payload,
          updatedAt: new Date(),
        })
        .where(eq(companies.id, companyId))
        .returning({ id: companies.id });

      if (updatedCompany.length === 0) {
        throw new HttpError(404, "Company not found");
      }

      res.json(await getCompanyDetailResponse(session.user.id, companyId));
    } catch (error) {
      handleRouteError(res, error, "Failed to update company");
    }
  });

  app.post("/api/companies/:id/members", async (req, res) => {
    const session = await getAuthenticatedSession(req, res);
    if (!session) {
      return;
    }

    if (!isAdminSession(session)) {
      res.status(403).json({ error: "Only workspace admins can add users to companies" });
      return;
    }

    try {
      const companyId = requireUuid(req.params.id, "Company id");
      const payload = getRecord(req.body, "request body");
      const targetUserId = getTrimmedString(payload.userId, "userId", { maxLength: 120 });
      const role = getCompanyRole(payload.role, "role", { defaultValue: "member" });

      const [companyRecord, targetUser, existingMembership] = await Promise.all([
        db
          .select({ id: companies.id })
          .from(companies)
          .where(eq(companies.id, companyId))
          .limit(1),
        db
          .select({
            id: authUsers.id,
            activeCompanyId: authUsers.activeCompanyId,
          })
          .from(authUsers)
          .where(eq(authUsers.id, targetUserId))
          .limit(1),
        db
          .select({ id: companyMemberships.id })
          .from(companyMemberships)
          .where(and(eq(companyMemberships.companyId, companyId), eq(companyMemberships.userId, targetUserId)))
          .limit(1),
      ]);

      if (!companyRecord[0]) {
        throw new HttpError(404, "Company not found");
      }

      if (!targetUser[0]) {
        throw new HttpError(404, "User not found");
      }

      if (existingMembership[0]) {
        throw new HttpError(409, "This user is already a member of the selected company");
      }

      await db.insert(companyMemberships).values({
        id: createUuid(),
        companyId,
        userId: targetUserId,
        role,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      if (!targetUser[0].activeCompanyId) {
        await setUserActiveCompany(targetUserId, companyId);
      }

      res.status(201).json(await getCompanyDetailResponse(session.user.id, companyId));
    } catch (error) {
      handleRouteError(res, error, "Failed to add company member");
    }
  });

  app.patch("/api/companies/:id/members/:membershipId", async (req, res) => {
    const session = await getAuthenticatedSession(req, res);
    if (!session) {
      return;
    }

    try {
      const companyId = requireUuid(req.params.id, "Company id");
      const membershipId = requireUuid(req.params.membershipId, "Membership id");
      const payload = getRecord(req.body, "request body");
      const role = getCompanyRole(payload.role, "role");
      const context = await getCompanyMembershipActionContext(
        session.user.id,
        companyId,
        membershipId,
      );

      if (!context.permissions.canChangeRole) {
        throw new HttpError(403, "You cannot change this member's role");
      }

      if (context.targetMembership.role === role) {
        res.json(await getCompanyDetailResponse(session.user.id, companyId));
        return;
      }

      await db
        .update(companyMemberships)
        .set({
          role,
          updatedAt: new Date(),
        })
        .where(eq(companyMemberships.id, membershipId));

      res.json(await getCompanyDetailResponse(session.user.id, companyId));
    } catch (error) {
      handleRouteError(res, error, "Failed to update company membership");
    }
  });

  app.delete("/api/companies/:id/members/:membershipId", async (req, res) => {
    const session = await getAuthenticatedSession(req, res);
    if (!session) {
      return;
    }

    try {
      const companyId = requireUuid(req.params.id, "Company id");
      const membershipId = requireUuid(req.params.membershipId, "Membership id");
      const context = await getCompanyMembershipActionContext(
        session.user.id,
        companyId,
        membershipId,
      );

      if (!context.permissions.canRemove) {
        throw new HttpError(403, "You cannot remove this member");
      }

      await db.delete(companyMemberships).where(eq(companyMemberships.id, membershipId));

      const [nextMembership] = await db
        .select({ companyId: companyMemberships.companyId })
        .from(companyMemberships)
        .where(eq(companyMemberships.userId, context.targetMembership.userId))
        .orderBy(asc(companyMemberships.createdAt))
        .limit(1);

      await setUserActiveCompany(
        context.targetMembership.userId,
        nextMembership?.companyId ?? null,
      );

      res.json(await getCompanyDetailResponse(session.user.id, companyId));
    } catch (error) {
      handleRouteError(res, error, "Failed to remove company member");
    }
  });

  app.delete("/api/companies/:id/logo", async (req, res) => {
    const session = await getAuthenticatedSession(req, res);
    if (!session) {
      return;
    }

    try {
      const companyId = requireUuid(req.params.id, "Company id");
      const access = await getCompanyAccessContext(session.user.id);
      const viewerMembership =
        access.memberships.find((membership) => membership.companyId === companyId) ?? null;

      if (!access.isGlobalAdmin && !viewerMembership) {
        throw new HttpError(403, "You do not have access to this company");
      }

      if (!canEditCompany(access.isGlobalAdmin, viewerMembership?.role ?? null)) {
        throw new HttpError(403, "Only company owners or admins can remove the company logo");
      }

      await removeCompanyDocumentLogo(companyId);
      res.status(204).end();
    } catch (error) {
      handleRouteError(res, error, "Failed to remove company logo");
    }
  });

  app.get("/api/users", async (req, res) => {
    const session = await getAuthenticatedSession(req, res);
    if (!session) {
      return;
    }

    if (!isAdminSession(session)) {
      res.status(403).json({ error: "Only admins can view all users" });
      return;
    }

    try {
      const [allUsers, invoiceCounts, sessionStats] = await Promise.all([
        db
          .select({
            id: authUsers.id,
            name: authUsers.name,
            email: authUsers.email,
            emailVerified: authUsers.emailVerified,
            image: authUsers.image,
            createdAt: authUsers.createdAt,
            updatedAt: authUsers.updatedAt,
            role: authUsers.role,
            banned: authUsers.banned,
            banReason: authUsers.banReason,
            banExpires: authUsers.banExpires,
          })
          .from(authUsers)
          .orderBy(desc(authUsers.createdAt)),
        db
          .select({
            userId: invoices.userId,
            invoiceCount: count(),
          })
          .from(invoices)
          .where(isNotNull(invoices.userId))
          .groupBy(invoices.userId),
        db
          .select({
            userId: authSessions.userId,
            activeSessions: count(),
            lastSeenAt: sql<Date | null>`max(${authSessions.updatedAt})`,
          })
          .from(authSessions)
          .groupBy(authSessions.userId),
      ]);

      const invoiceCountMap = new Map(
        invoiceCounts.map((row) => [row.userId, Number(row.invoiceCount)]),
      );
      const sessionStatMap = new Map(
        sessionStats.map((row) => [
          row.userId,
          {
            activeSessions: Number(row.activeSessions),
            lastSeenAt: row.lastSeenAt,
          },
        ]),
      );

      const users = allUsers
        .map((currentUser) => {
          const sessionData = sessionStatMap.get(currentUser.id);

          return {
            ...currentUser,
            role: currentUser.role ?? "user",
            invoiceCount: invoiceCountMap.get(currentUser.id) ?? 0,
            activeSessions: sessionData?.activeSessions ?? 0,
            lastSeenAt: sessionData?.lastSeenAt ?? null,
            isCurrentUser: currentUser.id === session.user.id,
          };
        })
        .sort((left, right) => {
          if (left.isCurrentUser !== right.isCurrentUser) {
            return left.isCurrentUser ? -1 : 1;
          }

          if (left.role !== right.role) {
            return left.role === "admin" ? -1 : 1;
          }

          return left.name.localeCompare(right.name);
        });

      res.json(users);
    } catch (error) {
      handleRouteError(res, error, "Failed to fetch users");
    }
  });

  app.get("/api/branding", async (_req, res) => {
    try {
      const [brandingProfile] = await db
        .select({
          siteLogoUrl: authUsers.siteLogoUrl,
        })
        .from(authUsers)
        .where(
          and(
            eq(authUsers.role, "admin"),
            isNotNull(authUsers.siteLogoUrl),
          ),
        )
        .orderBy(desc(authUsers.updatedAt), desc(authUsers.createdAt))
        .limit(1);

      res.json({
        siteLogoUrl: brandingProfile?.siteLogoUrl ?? null,
      });
    } catch (error) {
      handleRouteError(res, error, "Failed to fetch branding");
    }
  });

  app.get("/api/settings/summary", async (req, res) => {
    const session = await getAuthenticatedSession(req, res);
    if (!session) {
      return;
    }

    try {
      const access = await getCompanyAccessContext(session.user.id);
      const activeCompanyDetail = access.activeMembership
        ? await getCompanyDetailResponse(session.user.id, access.activeMembership.companyId)
        : null;

      const [profile, sessionStats] = await Promise.all([
        db
          .select({
            id: authUsers.id,
            name: authUsers.name,
            email: authUsers.email,
            siteLogoUrl: authUsers.siteLogoUrl,
            image: authUsers.image,
            emailVerified: authUsers.emailVerified,
            role: authUsers.role,
            createdAt: authUsers.createdAt,
            updatedAt: authUsers.updatedAt,
          })
          .from(authUsers)
          .where(eq(authUsers.id, session.user.id))
          .limit(1),
        db
          .select({
            activeSessions: count(),
            lastSeenAt: sql<Date | null>`max(${authSessions.updatedAt})`,
          })
          .from(authSessions)
          .where(eq(authSessions.userId, session.user.id))
          .limit(1),
      ]);

      const currentProfile = profile[0];
      if (!currentProfile) {
        res.status(404).json({ error: "User profile not found" });
        return;
      }

      const sessionSummary = sessionStats[0] ?? { activeSessions: 0, lastSeenAt: null };

      res.json({
        profile: {
          id: currentProfile.id,
          name: currentProfile.name,
          email: currentProfile.email,
          image: currentProfile.image,
          emailVerified: currentProfile.emailVerified,
          role: currentProfile.role ?? "user",
          createdAt: currentProfile.createdAt,
          updatedAt: currentProfile.updatedAt,
        },
        branding: {
          siteLogoUrl: currentProfile.siteLogoUrl ?? null,
        },
        security: {
          activeSessions: Number(sessionSummary.activeSessions),
          lastSeenAt: sessionSummary.lastSeenAt,
        },
        permissions: {
          canManageSiteBranding: access.isGlobalAdmin,
        },
        activeCompany: activeCompanyDetail?.company ?? null,
        companyMembers: activeCompanyDetail?.members ?? [],
      });
    } catch (error) {
      handleRouteError(res, error, "Failed to fetch settings summary");
    }
  });

  app.get("/api/dashboard", async (req, res) => {
    const session = await getAuthenticatedSession(req, res);
    if (!session) {
      return;
    }

    try {
      const access = await getRequiredActiveCompanyContext(session.user.id);
      const companyId = access.activeMembership.companyId;

      const [invoiceSummaryRows, revenueRows, recentInvoiceRows] = await Promise.all([
        db
          .select({
            totalInvoices: count(),
            uniqueClients: sql<number>`count(distinct ${invoices.clientCompanyName})`,
          })
          .from(invoices)
          .where(eq(invoices.companyId, companyId))
          .limit(1),
        db
          .select({
            totalRevenue: getInvoiceRevenueSql(),
          })
          .from(invoices)
          .leftJoin(services, eq(services.invoiceId, invoices.id))
          .where(eq(invoices.companyId, companyId))
          .limit(1),
        db
          .select({
            id: invoices.id,
            invoiceNo: invoices.invoiceNo,
            clientCompanyName: invoices.clientCompanyName,
            issueDate: invoices.issueDate,
            totalAmount: getInvoiceRevenueSql(),
          })
          .from(invoices)
          .leftJoin(services, eq(services.invoiceId, invoices.id))
          .where(eq(invoices.companyId, companyId))
          .groupBy(
            invoices.id,
            invoices.invoiceNo,
            invoices.clientCompanyName,
            invoices.issueDate,
            invoices.updatedAt,
            invoices.createdAt,
          )
          .orderBy(desc(invoices.updatedAt), desc(invoices.createdAt))
          .limit(5),
      ]);

      const invoiceSummary = invoiceSummaryRows[0] ?? { totalInvoices: 0, uniqueClients: 0 };
      const revenueSummary = revenueRows[0] ?? { totalRevenue: 0 };

      res.json({
        totalInvoices: Number(invoiceSummary.totalInvoices ?? 0),
        uniqueClients: Number(invoiceSummary.uniqueClients ?? 0),
        totalRevenue: Number(revenueSummary.totalRevenue ?? 0),
        recentInvoices: recentInvoiceRows.map((invoice) => ({
          ...invoice,
          totalAmount: Number(invoice.totalAmount ?? 0),
        })),
      });
    } catch (error) {
      handleRouteError(res, error, "Failed to fetch dashboard data");
    }
  });

  app.delete("/api/settings/logos/:kind", async (req, res) => {
    const session = await getAuthenticatedSession(req, res);
    if (!session) {
      return;
    }

    try {
      if (req.params.kind !== "site") {
        throw new HttpError(400, "Logo kind must be site");
      }

      if (!isAdminSession(session)) {
        throw new HttpError(403, "Only workspace admins can manage the site logo");
      }

      await removeUserLogo(session.user.id, "site");
      res.status(204).end();
    } catch (error) {
      handleRouteError(res, error, "Failed to remove logo");
    }
  });

  app.delete("/api/settings/logo", async (req, res) => {
    const session = await getAuthenticatedSession(req, res);
    if (!session) {
      return;
    }

    try {
      const access = await getRequiredActiveCompanyContext(session.user.id);
      if (!canEditCompany(access.isGlobalAdmin, access.activeMembership.role)) {
        throw new HttpError(403, "Only company owners or admins can remove the company logo");
      }

      await removeCompanyDocumentLogo(access.activeMembership.companyId);
      res.status(204).end();
    } catch (error) {
      handleRouteError(res, error, "Failed to remove logo");
    }
  });

  app.get("/api/invoices", async (req, res) => {
    const session = await getAuthenticatedSession(req, res);
    if (!session) {
      return;
    }

    try {
      const access = await getRequiredActiveCompanyContext(session.user.id);
      const where = buildInvoiceListWhere(access.activeMembership.companyId);
      const allInvoices = await db.query.invoices.findMany({
        ...(where ? { where } : {}),
        columns: {
          id: true,
          invoiceNo: true,
          clientCompanyName: true,
          issueDate: true,
          dueDate: true,
        },
        orderBy: [desc(invoices.updatedAt), desc(invoices.createdAt)],
      });

      res.json(allInvoices);
    } catch (error) {
      handleRouteError(res, error, "Failed to fetch invoices");
    }
  });

  app.get("/api/invoices/export", async (req, res) => {
    const session = await getAuthenticatedSession(req, res);
    if (!session) {
      return;
    }

    try {
      const access = await getRequiredActiveCompanyContext(session.user.id);
      const invoiceIds = parseInvoiceIds(req.query.ids, "ids");
      const orderedInvoices = await getSerializedInvoicesForExport(
        access.activeMembership.companyId,
        invoiceIds,
      );
      res.json(orderedInvoices);
    } catch (error) {
      handleRouteError(res, error, "Failed to fetch invoices for PDF export");
    }
  });

  app.get("/api/invoices/export/render", async (req, res) => {
    try {
      const exportToken = verifyInvoiceExportToken(req.query.exportToken);
      const orderedInvoices = await getSerializedInvoicesForExport(
        exportToken.companyId,
        exportToken.invoiceIds,
      );
      res.json(orderedInvoices);
    } catch (error) {
      handleRouteError(res, error, "Failed to fetch invoices for PDF export");
    }
  });

  app.get("/api/invoices/pdf", async (req, res) => {
    const session = await getAuthenticatedSession(req, res);
    if (!session) {
      return;
    }

    try {
      const access = await getRequiredActiveCompanyContext(session.user.id);
      const invoiceIds = parseInvoiceIds(req.query.ids, "ids");
      const matchingInvoices = await db.query.invoices.findMany({
        where: and(
          eq(invoices.companyId, access.activeMembership.companyId),
          inArray(invoices.id, invoiceIds),
        ),
        columns: {
          id: true,
          invoiceNo: true,
        },
      });

      if (matchingInvoices.length !== invoiceIds.length) {
        res.status(404).json({ error: "One or more invoices could not be found" });
        return;
      }

      const exportToken = createInvoiceExportToken(access.activeMembership.companyId, invoiceIds);
      const pdfBuffer = await renderPdfFromRoute(
        req,
        `/print/invoices?ids=${encodeURIComponent(invoiceIds.join(","))}&exportToken=${encodeURIComponent(exportToken)}`,
      );
      const filename = sanitizeDownloadFilename(
        `Invoices_${new Date().toISOString().slice(0, 10)}.pdf`,
        "Invoices.pdf",
      );

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(pdfBuffer);
    } catch (error) {
      handleRouteError(res, error, "Failed to generate invoice PDFs");
    }
  });

  app.get("/api/invoices/:id/pdf", async (req, res) => {
    const session = await getAuthenticatedSession(req, res);
    if (!session) {
      return;
    }

    try {
      const access = await getRequiredActiveCompanyContext(session.user.id);
      const invoiceId = requireUuid(req.params.id, "Invoice id");
      const invoice = await db.query.invoices.findFirst({
        where: buildInvoiceIdWhere(access.activeMembership.companyId, invoiceId),
        columns: {
          id: true,
          invoiceNo: true,
        },
      });

      if (!invoice) {
        res.status(404).json({ error: "Invoice not found" });
        return;
      }

      const exportToken = createInvoiceExportToken(access.activeMembership.companyId, [invoice.id]);
      const pdfBuffer = await renderPdfFromRoute(
        req,
        `/print/invoice/${invoice.id}?exportToken=${encodeURIComponent(exportToken)}`,
      );
      const filename = sanitizeDownloadFilename(
        `Invoice_${invoice.invoiceNo || invoice.id}.pdf`,
        "Invoice.pdf",
      );

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(pdfBuffer);
    } catch (error) {
      handleRouteError(res, error, "Failed to generate invoice PDF");
    }
  });

  app.get("/api/invoices/:id", async (req, res) => {
    const session = await getAuthenticatedSession(req, res);
    if (!session) {
      return;
    }

    try {
      const access = await getRequiredActiveCompanyContext(session.user.id);
      const invoiceId = requireUuid(req.params.id, "Invoice id");
      const invoice = await db.query.invoices.findFirst({
        where: buildInvoiceIdWhere(access.activeMembership.companyId, invoiceId),
        with: {
          company: {
            columns: {
              id: true,
              name: true,
              email: true,
              phone: true,
              poBox: true,
              streetAddress: true,
              standNumber: true,
              documentLogoUrl: true,
              bankName: true,
              accountHolder: true,
              accountNumber: true,
              accountType: true,
              branchCode: true,
            },
          },
          services: true,
        },
      });

      if (!invoice) {
        res.status(404).json({ error: "Invoice not found" });
        return;
      }

      res.json(serializeInvoiceRecord(invoice));
    } catch (error) {
      handleRouteError(res, error, "Failed to fetch invoice");
    }
  });

  app.post("/api/invoices", async (req, res) => {
    const session = await getAuthenticatedSession(req, res);
    if (!session) {
      return;
    }

    try {
      const access = await getRequiredActiveCompanyContext(session.user.id);
      const parsedInvoice = parseInvoiceInput(req.body);
      const invoiceId = parsedInvoice.id ?? createUuid();

      let verificationToken = createUuid();
      let ownerId = session.user.id;
      let companyId = access.activeMembership.companyId;

      if (parsedInvoice.id) {
        const existingInvoice = await db.query.invoices.findFirst({
          where: buildInvoiceIdWhere(access.activeMembership.companyId, invoiceId),
          columns: {
            userId: true,
            companyId: true,
            verificationToken: true,
          },
        });

        if (!existingInvoice) {
          res.status(404).json({ error: "Invoice not found" });
          return;
        }

        verificationToken = (existingInvoice.verificationToken ?? createUuid()) as Uuid;
        ownerId = existingInvoice.userId ?? session.user.id;
        companyId = existingInvoice.companyId ?? access.activeMembership.companyId;
      }

      const serviceRows = parsedInvoice.services.map((service) => ({
        id: createUuid(),
        invoiceId,
        ...service,
      }));

      if (parsedInvoice.id) {
        await db.batch([
          db
            .update(invoices)
            .set({
              ...parsedInvoice.invoice,
              userId: ownerId,
              companyId,
              verificationToken,
              updatedAt: new Date(),
            })
            .where(buildInvoiceIdWhere(access.activeMembership.companyId, invoiceId)),
          db.delete(services).where(eq(services.invoiceId, invoiceId)),
          ...(serviceRows.length > 0 ? [db.insert(services).values(serviceRows)] : []),
        ]);
      } else {
        await db.batch([
          db.insert(invoices).values({
            id: invoiceId,
            userId: ownerId,
            companyId,
            verificationToken,
            ...parsedInvoice.invoice,
          }),
          ...(serviceRows.length > 0 ? [db.insert(services).values(serviceRows)] : []),
        ]);
      }

      const savedInvoice = await db.query.invoices.findFirst({
        where: buildInvoiceIdWhere(access.activeMembership.companyId, invoiceId),
        with: {
          company: {
            columns: {
              id: true,
              name: true,
              email: true,
              phone: true,
              poBox: true,
              streetAddress: true,
              standNumber: true,
              documentLogoUrl: true,
              bankName: true,
              accountHolder: true,
              accountNumber: true,
              accountType: true,
              branchCode: true,
            },
          },
          services: true,
        },
      });

      res.status(parsedInvoice.id ? 200 : 201).json(
        savedInvoice ? serializeInvoiceRecord(savedInvoice) : null,
      );
    } catch (error) {
      handleRouteError(res, error, "Failed to save invoice");
    }
  });

  app.delete("/api/invoices/:id", async (req, res) => {
    const session = await getAuthenticatedSession(req, res);
    if (!session) {
      return;
    }

    try {
      const access = await getRequiredActiveCompanyContext(session.user.id);
      const invoiceId = requireUuid(req.params.id, "Invoice id");
      const deletedInvoice = await db
        .delete(invoices)
        .where(buildInvoiceIdWhere(access.activeMembership.companyId, invoiceId))
        .returning({ id: invoices.id });

      if (deletedInvoice.length === 0) {
        res.status(404).json({ error: "Invoice not found" });
        return;
      }

      res.status(204).end();
    } catch (error) {
      handleRouteError(res, error, "Failed to delete invoice");
    }
  });

  app.use("/company/setup", async (req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      next();
      return;
    }

    const session = await getOptionalSession(req);
    if (!session) {
      next();
      return;
    }

    try {
      const access = await getCompanyAccessContext(session.user.id);
      if (access.memberships.length > 0) {
        res.redirect(302, "/");
        return;
      }
    } catch (error) {
      console.error("Failed to enforce company setup route", error);
      res.status(500).send("Failed to resolve company setup access");
      return;
    }

    next();
  });

  if (options.serveClientApp) {
    if (process.env.NODE_ENV !== "production") {
      const { createServer: createViteServer } = await import("vite");
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
    } else {
      const distPath = path.join(process.cwd(), "dist");
      app.use(express.static(distPath));
      app.get("*", (_req, res) => {
        res.sendFile(path.join(distPath, "index.html"));
      });
    }
  }

  return app;
}

async function startServer() {
  const app = await createApp({ serveClientApp: true });
  const port = Number(process.env.PORT ?? "3000");

  app.listen(port, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${port}`);
  });
}

if (!process.env.VERCEL) {
  startServer().catch((error) => {
    console.error("Failed to start server", error);
    process.exit(1);
  });
}
