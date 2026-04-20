ALTER TABLE "user"
ADD COLUMN IF NOT EXISTS "company_logo_url" text;

--> statement-breakpoint
ALTER TABLE "user"
ADD COLUMN IF NOT EXISTS "company_logo_key" text;

--> statement-breakpoint
ALTER TABLE "user"
ADD COLUMN IF NOT EXISTS "site_logo_url" text;

--> statement-breakpoint
ALTER TABLE "user"
ADD COLUMN IF NOT EXISTS "site_logo_key" text;

--> statement-breakpoint
ALTER TABLE "user"
ADD COLUMN IF NOT EXISTS "document_logo_url" text;

--> statement-breakpoint
ALTER TABLE "user"
ADD COLUMN IF NOT EXISTS "document_logo_key" text;

--> statement-breakpoint
ALTER TABLE "user"
ADD COLUMN IF NOT EXISTS "active_company_id" text;

--> statement-breakpoint
UPDATE "user"
SET
  "site_logo_url" = COALESCE("site_logo_url", "company_logo_url"),
  "site_logo_key" = COALESCE("site_logo_key", "company_logo_key"),
  "document_logo_url" = COALESCE("document_logo_url", "company_logo_url"),
  "document_logo_key" = COALESCE("document_logo_key", "company_logo_key")
WHERE
  "company_logo_url" IS NOT NULL
  OR "company_logo_key" IS NOT NULL;

--> statement-breakpoint
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
);

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "companies_created_by_user_id_idx" ON "companies" ("created_by_user_id");

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "company_memberships" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "role" text NOT NULL DEFAULT 'member',
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "company_memberships_company_id_idx" ON "company_memberships" ("company_id");

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "company_memberships_user_id_idx" ON "company_memberships" ("user_id");

--> statement-breakpoint
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

--> statement-breakpoint
ALTER TABLE "invoices"
ADD COLUMN IF NOT EXISTS "company_id" uuid REFERENCES "companies"("id") ON DELETE SET NULL;

--> statement-breakpoint
ALTER TABLE "invoices"
ADD COLUMN IF NOT EXISTS "theme" text DEFAULT 'legacy-indigo';

--> statement-breakpoint
UPDATE "invoices"
SET "theme" = 'legacy-indigo'
WHERE "theme" IS NULL OR trim("theme") = '';

--> statement-breakpoint
ALTER TABLE "invoices"
ALTER COLUMN "theme" SET NOT NULL;

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoices_company_id_idx" ON "invoices" ("company_id");

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoices_company_updated_at_idx"
ON "invoices" ("company_id", "updated_at" DESC, "created_at" DESC);

--> statement-breakpoint
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
);

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_invitations_email_idx" ON "user_invitations" ("email");

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_invitations_inviter_user_id_idx" ON "user_invitations" ("inviter_user_id");

--> statement-breakpoint
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
