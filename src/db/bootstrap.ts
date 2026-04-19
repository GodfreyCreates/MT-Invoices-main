import { sql } from "drizzle-orm";
import { db } from ".";

const runtimeMigrationStatements = [
  `
    ALTER TABLE "user"
    ADD COLUMN IF NOT EXISTS "company_logo_url" text
  `,
  `
    ALTER TABLE "user"
    ADD COLUMN IF NOT EXISTS "company_logo_key" text
  `,
  `
    ALTER TABLE "user"
    ADD COLUMN IF NOT EXISTS "site_logo_url" text
  `,
  `
    ALTER TABLE "user"
    ADD COLUMN IF NOT EXISTS "site_logo_key" text
  `,
  `
    ALTER TABLE "user"
    ADD COLUMN IF NOT EXISTS "document_logo_url" text
  `,
  `
    ALTER TABLE "user"
    ADD COLUMN IF NOT EXISTS "document_logo_key" text
  `,
  `
    ALTER TABLE "user"
    ADD COLUMN IF NOT EXISTS "active_company_id" text
  `,
  `
    UPDATE "user"
    SET
      "site_logo_url" = COALESCE("site_logo_url", "company_logo_url"),
      "site_logo_key" = COALESCE("site_logo_key", "company_logo_key"),
      "document_logo_url" = COALESCE("document_logo_url", "company_logo_url"),
      "document_logo_key" = COALESCE("document_logo_key", "company_logo_key")
    WHERE
      "company_logo_url" IS NOT NULL
      OR "company_logo_key" IS NOT NULL
  `,
  `
    CREATE TABLE IF NOT EXISTS "companies" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "name" text NOT NULL,
      "email" text NOT NULL,
      "phone" text NOT NULL,
      "po_box" text,
      "street_address" text NOT NULL,
      "stand_number" text,
      "document_logo_url" text,
      "document_logo_key" text,
      "bank_name" text NOT NULL,
      "account_holder" text NOT NULL,
      "account_number" text NOT NULL,
      "account_type" text NOT NULL,
      "branch_code" text NOT NULL,
      "created_by_user_id" text REFERENCES "user"("id") ON DELETE SET NULL,
      "created_at" timestamp NOT NULL DEFAULT now(),
      "updated_at" timestamp NOT NULL DEFAULT now()
    )
  `,
  `
    CREATE INDEX IF NOT EXISTS "companies_created_by_user_id_idx" ON "companies" ("created_by_user_id")
  `,
  `
    CREATE TABLE IF NOT EXISTS "company_memberships" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
      "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
      "role" text NOT NULL DEFAULT 'member',
      "created_at" timestamp NOT NULL DEFAULT now(),
      "updated_at" timestamp NOT NULL DEFAULT now()
    )
  `,
  `
    CREATE INDEX IF NOT EXISTS "company_memberships_company_id_idx" ON "company_memberships" ("company_id")
  `,
  `
    CREATE INDEX IF NOT EXISTS "company_memberships_user_id_idx" ON "company_memberships" ("user_id")
  `,
  `
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'company_memberships_company_user_idx'
      ) THEN
        ALTER TABLE "company_memberships"
        ADD CONSTRAINT "company_memberships_company_user_idx" UNIQUE ("company_id", "user_id");
      END IF;
    END $$;
  `,
  `
    ALTER TABLE "invoices"
    ADD COLUMN IF NOT EXISTS "user_id" text REFERENCES "user"("id") ON DELETE SET NULL
  `,
  `
    ALTER TABLE "invoices"
    ADD COLUMN IF NOT EXISTS "company_id" uuid REFERENCES "companies"("id") ON DELETE SET NULL
  `,
  `
    ALTER TABLE "invoices"
    ADD COLUMN IF NOT EXISTS "verification_token" uuid DEFAULT gen_random_uuid()
  `,
  `
    ALTER TABLE "invoices"
    ADD COLUMN IF NOT EXISTS "theme" text DEFAULT 'legacy-indigo'
  `,
  `
    WITH only_user AS (
      SELECT id
      FROM "user"
      ORDER BY created_at ASC
      LIMIT 1
    )
    UPDATE "invoices"
    SET "user_id" = (SELECT id FROM only_user)
    WHERE "user_id" IS NULL
      AND (SELECT COUNT(*) FROM "user") = 1
  `,
  `
    UPDATE "invoices"
    SET "verification_token" = gen_random_uuid()
    WHERE "verification_token" IS NULL
  `,
  `
    UPDATE "invoices"
    SET "theme" = 'legacy-indigo'
    WHERE "theme" IS NULL OR trim("theme") = ''
  `,
  `
    ALTER TABLE "invoices"
    ALTER COLUMN "verification_token" SET NOT NULL
  `,
  `
    ALTER TABLE "invoices"
    ALTER COLUMN "theme" SET NOT NULL
  `,
  `
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'invoices_verification_token_idx'
      ) THEN
        ALTER TABLE "invoices"
        ADD CONSTRAINT "invoices_verification_token_idx" UNIQUE ("verification_token");
      END IF;
    END $$;
  `,
  `
    CREATE INDEX IF NOT EXISTS "invoices_user_id_idx" ON "invoices" ("user_id")
  `,
  `
    CREATE INDEX IF NOT EXISTS "invoices_company_id_idx" ON "invoices" ("company_id")
  `,
  `
    CREATE TABLE IF NOT EXISTS "user_invitations" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "email" text NOT NULL,
      "role" text NOT NULL DEFAULT 'user',
      "token" uuid NOT NULL DEFAULT gen_random_uuid(),
      "inviter_user_id" text REFERENCES "user"("id") ON DELETE SET NULL,
      "accepted_at" timestamp,
      "revoked_at" timestamp,
      "expires_at" timestamp NOT NULL,
      "created_at" timestamp NOT NULL DEFAULT now(),
      "updated_at" timestamp NOT NULL DEFAULT now()
    )
  `,
  `
    CREATE INDEX IF NOT EXISTS "user_invitations_email_idx" ON "user_invitations" ("email")
  `,
  `
    CREATE INDEX IF NOT EXISTS "user_invitations_inviter_user_id_idx" ON "user_invitations" ("inviter_user_id")
  `,
  `
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'user_invitations_token_idx'
      ) THEN
        ALTER TABLE "user_invitations"
        ADD CONSTRAINT "user_invitations_token_idx" UNIQUE ("token");
      END IF;
    END $$;
  `,
];

export async function ensureDatabaseSchema() {
  for (const statement of runtimeMigrationStatements) {
    await db.execute(sql.raw(statement));
  }
}
