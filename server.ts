import express, { type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { isIP } from "node:net";
import path from "node:path";
import { and, count, desc, eq, isNotNull, sql } from "drizzle-orm";
import { fromNodeHeaders, toNodeHandler } from "better-auth/node";
import { createRouteHandler as createUploadthingRouteHandler } from "uploadthing/express";
import { createServer as createViteServer } from "vite";
import { db } from "./src/db";
import { ensureDatabaseSchema } from "./src/db/bootstrap";
import { session as authSessions, user as authUsers } from "./src/db/auth-schema";
import { auth } from "./src/lib/auth";
import { invoices, services } from "./src/db/schema";
import { uploadRouter, utapi } from "./src/uploadthing";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CANONICAL_CLIENT_IP_HEADER = "x-client-ip";
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
    notes: string | null;
    authorizedSignature: string;
  };
  services: SanitizedServiceInput[];
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

function applyAuthRequestMetadata(req: Request) {
  req.headers[CANONICAL_CLIENT_IP_HEADER] = resolveClientIp(req);

  const userAgent = getHeaderValue(req.headers["user-agent"])?.trim();
  if (!userAgent) {
    req.headers["user-agent"] = "Unknown device";
  }
}

function serializeInvoiceRecord<
  TInvoice extends {
    owner?: {
      companyLogoUrl: string | null;
    } | null;
  },
>(invoice: TInvoice) {
  const { owner, ...rest } = invoice;

  return {
    ...rest,
    ownerLogoUrl: owner?.companyLogoUrl ?? null,
  };
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
      notes: getOptionalString(payload.notes, "notes"),
      authorizedSignature: getTrimmedString(payload.authorizedSignature, "authorizedSignature", { maxLength: 120 }),
    },
    services: rawServices.map((service, index) => parseServiceInput(service, index)),
  };
}

function buildInvoiceListWhere(session: SessionRecord) {
  if (isAdminSession(session)) {
    return undefined;
  }

  return eq(invoices.userId, session.user.id);
}

function buildInvoiceIdWhere(session: SessionRecord, invoiceId: string) {
  if (isAdminSession(session)) {
    return eq(invoices.id, invoiceId);
  }

  return and(eq(invoices.id, invoiceId), eq(invoices.userId, session.user.id));
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

function handleRouteError(res: Response, error: unknown, defaultMessage: string) {
  if (error instanceof HttpError) {
    res.status(error.status).json({ error: error.message });
    return;
  }

  console.error(defaultMessage, error);
  res.status(500).json({ error: defaultMessage });
}

async function startServer() {
  await ensureDatabaseSchema();

  const app = express();
  const port = Number(process.env.PORT ?? "3000");

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

  app.get("/api/settings/summary", async (req, res) => {
    const session = await getAuthenticatedSession(req, res);
    if (!session) {
      return;
    }

    try {
      const [profile, sessionStats] = await Promise.all([
        db
          .select({
            id: authUsers.id,
            name: authUsers.name,
            email: authUsers.email,
            companyLogoUrl: authUsers.companyLogoUrl,
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
          ...currentProfile,
          role: currentProfile.role ?? "user",
        },
        branding: {
          logoUrl: currentProfile.companyLogoUrl ?? null,
        },
        security: {
          activeSessions: Number(sessionSummary.activeSessions),
          lastSeenAt: sessionSummary.lastSeenAt,
        },
      });
    } catch (error) {
      handleRouteError(res, error, "Failed to fetch settings summary");
    }
  });

  app.delete("/api/settings/logo", async (req, res) => {
    const session = await getAuthenticatedSession(req, res);
    if (!session) {
      return;
    }

    try {
      const [currentUser] = await db
        .select({
          companyLogoKey: authUsers.companyLogoKey,
        })
        .from(authUsers)
        .where(eq(authUsers.id, session.user.id))
        .limit(1);

      await db
        .update(authUsers)
        .set({
          companyLogoKey: null,
          companyLogoUrl: null,
          updatedAt: new Date(),
        })
        .where(eq(authUsers.id, session.user.id));

      if (currentUser?.companyLogoKey) {
        try {
          await utapi.deleteFiles(currentUser.companyLogoKey);
        } catch (error) {
          console.error("Failed to delete logo from UploadThing", error);
        }
      }

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
      const where = buildInvoiceListWhere(session);
      const allInvoices = await db.query.invoices.findMany({
        ...(where ? { where } : {}),
        with: {
          owner: {
            columns: {
              companyLogoUrl: true,
            },
          },
          services: true,
        },
      });

      res.json(allInvoices.map((invoice) => serializeInvoiceRecord(invoice)));
    } catch (error) {
      handleRouteError(res, error, "Failed to fetch invoices");
    }
  });

  app.get("/api/invoices/:id", async (req, res) => {
    const session = await getAuthenticatedSession(req, res);
    if (!session) {
      return;
    }

    try {
      const invoiceId = requireUuid(req.params.id, "Invoice id");
      const invoice = await db.query.invoices.findFirst({
        where: buildInvoiceIdWhere(session, invoiceId),
        with: {
          owner: {
            columns: {
              companyLogoUrl: true,
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
      const parsedInvoice = parseInvoiceInput(req.body);
      const invoiceId = parsedInvoice.id ?? createUuid();

      let verificationToken = createUuid();
      let ownerId = session.user.id;

      if (parsedInvoice.id) {
        const existingInvoice = await db.query.invoices.findFirst({
          where: buildInvoiceIdWhere(session, invoiceId),
          columns: {
            userId: true,
            verificationToken: true,
          },
        });

        if (!existingInvoice) {
          res.status(404).json({ error: "Invoice not found" });
          return;
        }

        verificationToken = (existingInvoice.verificationToken ?? createUuid()) as Uuid;
        ownerId = existingInvoice.userId ?? session.user.id;
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
              verificationToken,
              updatedAt: new Date(),
            })
            .where(buildInvoiceIdWhere(session, invoiceId)),
          db.delete(services).where(eq(services.invoiceId, invoiceId)),
          ...(serviceRows.length > 0 ? [db.insert(services).values(serviceRows)] : []),
        ]);
      } else {
        await db.batch([
          db.insert(invoices).values({
            id: invoiceId,
            userId: ownerId,
            verificationToken,
            ...parsedInvoice.invoice,
          }),
          ...(serviceRows.length > 0 ? [db.insert(services).values(serviceRows)] : []),
        ]);
      }

      const savedInvoice = await db.query.invoices.findFirst({
        where: buildInvoiceIdWhere(session, invoiceId),
        with: {
          owner: {
            columns: {
              companyLogoUrl: true,
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
      const invoiceId = requireUuid(req.params.id, "Invoice id");
      const deletedInvoice = await db
        .delete(invoices)
        .where(buildInvoiceIdWhere(session, invoiceId))
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

  if (process.env.NODE_ENV !== "production") {
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

  app.listen(port, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${port}`);
  });
}

startServer().catch((error) => {
  console.error("Failed to start server", error);
  process.exit(1);
});
