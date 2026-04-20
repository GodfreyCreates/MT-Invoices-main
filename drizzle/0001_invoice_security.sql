ALTER TABLE "invoices"
ADD COLUMN IF NOT EXISTS "user_id" text REFERENCES "user"("id") ON DELETE SET NULL;

--> statement-breakpoint
ALTER TABLE "invoices"
ADD COLUMN IF NOT EXISTS "verification_token" uuid DEFAULT gen_random_uuid();

--> statement-breakpoint
WITH only_user AS (
  SELECT id
  FROM "user"
  ORDER BY created_at ASC
  LIMIT 1
)
UPDATE "invoices"
SET "user_id" = (SELECT id FROM only_user)
WHERE "user_id" IS NULL
  AND (SELECT COUNT(*) FROM "user") = 1;

--> statement-breakpoint
UPDATE "invoices"
SET "verification_token" = gen_random_uuid()
WHERE "verification_token" IS NULL;

--> statement-breakpoint
ALTER TABLE "invoices"
ALTER COLUMN "verification_token" SET NOT NULL;

--> statement-breakpoint
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

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoices_user_id_idx" ON "invoices" ("user_id");
