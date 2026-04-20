ALTER TABLE "user_invitations"
ADD COLUMN IF NOT EXISTS "company_id" uuid REFERENCES "companies"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "user_invitations_company_id_idx"
ON "user_invitations" ("company_id");
