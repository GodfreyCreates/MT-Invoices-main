import { eq } from "drizzle-orm";
import { fromNodeHeaders } from "better-auth/node";
import { createUploadthing, type FileRouter } from "uploadthing/express";
import { UTApi, UploadThingError } from "uploadthing/server";
import { db } from "./db";
import { user } from "./db/auth-schema";
import { auth } from "./lib/auth";

const f = createUploadthing();

export const utapi = new UTApi();

export const uploadRouter = {
  companyLogo: f({
    image: {
      maxFileCount: 1,
      maxFileSize: "4MB",
    },
  })
    .middleware(async ({ req }) => {
      const session = await auth.api.getSession({
        headers: fromNodeHeaders(req.headers),
      });

      if (!session?.user?.id) {
        throw new UploadThingError("Unauthorized");
      }

      const [currentUser] = await db
        .select({
          companyLogoKey: user.companyLogoKey,
        })
        .from(user)
        .where(eq(user.id, session.user.id))
        .limit(1);

      return {
        previousLogoKey: currentUser?.companyLogoKey ?? null,
        userId: session.user.id,
      };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      await db
        .update(user)
        .set({
          companyLogoKey: file.key,
          companyLogoUrl: file.ufsUrl,
          updatedAt: new Date(),
        })
        .where(eq(user.id, metadata.userId));

      if (metadata.previousLogoKey && metadata.previousLogoKey !== file.key) {
        try {
          await utapi.deleteFiles(metadata.previousLogoKey);
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
