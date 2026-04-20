import { eq } from "drizzle-orm";
import { fromNodeHeaders } from "better-auth/node";
import { createUploadthing, type FileRouter } from "uploadthing/express";
import { UTApi, UploadThingError } from "uploadthing/server";
import { z } from "zod";
import { db } from "./db";
import { user } from "./db/auth-schema";
import { companies, companyMemberships } from "./db/schema";
import { auth } from "./lib/auth";

const f = createUploadthing();

let utapiClient: UTApi | null = null;
let hasUploadThingInitFailed = false;

function getUtapiClient() {
  if (hasUploadThingInitFailed) {
    return null;
  }

  if (!utapiClient) {
    try {
      utapiClient = new UTApi();
    } catch (error) {
      hasUploadThingInitFailed = true;
      console.error("Failed to initialize UploadThing client", error);
      return null;
    }
  }

  return utapiClient;
}

export async function deleteUploadThingFiles(fileKey: string) {
  const client = getUtapiClient();
  if (!client) {
    return false;
  }

  await client.deleteFiles(fileKey);
  return true;
}

async function getSessionUser(req: { headers: unknown }) {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers as Record<string, string | string[] | undefined>),
  });

  if (!session?.user?.id) {
    throw new UploadThingError("Unauthorized");
  }

  return session.user.id;
}

async function getCompanyLogoAccess(
  req: { headers: unknown },
  targetCompanyId?: string | null,
) {
  const userId = await getSessionUser(req);

  const [currentUser] = await db
    .select({
      role: user.role,
      activeCompanyId: user.activeCompanyId,
    })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  if (!currentUser) {
    throw new UploadThingError("Unauthorized");
  }

  const memberships = await db
    .select({
      companyId: companyMemberships.companyId,
      role: companyMemberships.role,
    })
    .from(companyMemberships)
    .where(eq(companyMemberships.userId, userId));

  const selectedCompanyId = targetCompanyId ?? currentUser.activeCompanyId ?? null;
  const activeMembership =
    memberships.find((membership) => membership.companyId === selectedCompanyId) ??
    memberships.find((membership) => membership.companyId === currentUser.activeCompanyId) ??
    memberships[0] ??
    null;

  if (!activeMembership) {
    throw new UploadThingError("Create a company to continue");
  }

  if (targetCompanyId && currentUser.role !== "admin" && activeMembership.companyId !== targetCompanyId) {
    throw new UploadThingError("You do not have access to this company");
  }

  if (
    currentUser.role !== "admin" &&
    activeMembership.role !== "owner" &&
    activeMembership.role !== "admin"
  ) {
    throw new UploadThingError("Only company owners or admins can update the company logo");
  }

  const companyId = targetCompanyId ?? activeMembership.companyId;

  const [currentCompany] = await db
    .select({
      documentLogoKey: companies.documentLogoKey,
    })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);

  if (!currentCompany) {
    throw new UploadThingError("Company not found");
  }

  return {
    companyId,
    previousLogoKey: currentCompany?.documentLogoKey ?? null,
    userId,
  };
}

export const uploadRouter = {
  siteLogo: f({
    image: {
      maxFileCount: 1,
      maxFileSize: "4MB",
    },
  })
    .middleware(async ({ req }) => {
      const userId = await getSessionUser(req);
      const [currentUser] = await db
        .select({
          role: user.role,
          siteLogoKey: user.siteLogoKey,
        })
        .from(user)
        .where(eq(user.id, userId))
        .limit(1);

      if (currentUser?.role !== "admin") {
        throw new UploadThingError("Only workspace admins can update the site logo");
      }

      return {
        previousLogoKey: currentUser?.siteLogoKey ?? null,
        userId,
      };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      await db
        .update(user)
        .set({
          siteLogoKey: file.key,
          siteLogoUrl: file.ufsUrl,
          updatedAt: new Date(),
        })
        .where(eq(user.id, metadata.userId));

      if (metadata.previousLogoKey && metadata.previousLogoKey !== file.key) {
        try {
          await deleteUploadThingFiles(metadata.previousLogoKey);
        } catch (error) {
          console.error("Failed to remove previous logo from UploadThing", error);
        }
      }

      return {
        logoKey: file.key,
        logoUrl: file.ufsUrl,
      };
    }),
  companyDocumentLogo: f({
    image: {
      maxFileCount: 1,
      maxFileSize: "4MB",
    },
  })
    .input(
      z.object({
        companyId: z.string().uuid(),
      }),
    )
    .middleware(async ({ req, input }) => {
      return getCompanyLogoAccess(req, input.companyId);
    })
    .onUploadComplete(async ({ metadata, file }) => {
      await db
        .update(companies)
        .set({
          documentLogoKey: file.key,
          documentLogoUrl: file.ufsUrl,
          updatedAt: new Date(),
        })
        .where(eq(companies.id, metadata.companyId));

      if (metadata.previousLogoKey && metadata.previousLogoKey !== file.key) {
        try {
          await deleteUploadThingFiles(metadata.previousLogoKey);
        } catch (error) {
          console.error("Failed to remove previous logo from UploadThing", error);
        }
      }

      return {
        logoKey: file.key,
        logoUrl: file.ufsUrl,
      };
    }),
} satisfies FileRouter;

export type UploadRouter = typeof uploadRouter;
