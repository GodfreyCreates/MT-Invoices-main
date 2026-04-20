# Companies as a First-Class Workspace Model

## Summary
Move the app from user-owned invoice data to company-scoped workspaces.

- Every authenticated user must belong to at least one company before they can use dashboard, invoices, settings, or invoice creation.
- A user can belong to many companies, but works in one active company at a time through a header switcher.
- Invoices become shared within the active company and use that company’s issuer details, bank details, and document logo.
- Global MT Legacy branding stays global and admin-managed; company branding applies to invoice output only.

## Implementation Changes
### Data model
- Add a `companies` table for invoice issuer data:
  - `id`, `name`
  - `email`, `phone`
  - `poBox`, `streetAddress`, `standNumber`
  - `documentLogoUrl`, `documentLogoKey`
  - `bankName`, `accountHolder`, `accountNumber`, `accountType`, `branchCode`
  - `createdAt`, `updatedAt`, `createdByUserId`
- Add a `company_memberships` table for many-to-many membership:
  - `id`, `companyId`, `userId`
  - `role` = `owner | admin | member`
  - `createdAt`, `updatedAt`
- Add `activeCompanyId` to the auth `user` table as the persisted current-company preference.
- Add `companyId` to `invoices`.
- Keep the current invoice `userId` column as the creator reference in v1 rather than renaming it immediately.

### Core behavior
- Add a server helper to resolve the active company from `user.activeCompanyId`, with fallback to the first valid membership.
- Redirect any signed-in user with zero memberships to a required company setup flow.
- Creating a company automatically creates an `owner` membership for the creator and sets it as active.
- Invoice list, invoice detail, invoice create/update, and invoice delete all scope to `companyId = activeCompanyId`.
- Invoice preview/export stops reading hardcoded issuer details and user document logos; it reads the active company profile instead.
- Existing global admin pages remain workspace-wide, but normal invoice pages stay active-company scoped for everyone, including global admins.

### UI flow
- Add a company setup page used for first-run onboarding when a user has no companies.
- Add a header company switcher:
  - shows current active company
  - lists memberships the user can access
  - persists the selection by updating `activeCompanyId`
  - includes a “Create company” entry
- Update `/settings` to have two clear sections:
  - `Account`: current profile, password, active devices
  - `Company`: active company details, bank details, document logo, and membership list
- Company owners/admins can edit company data; members see it read-only.
- Keep site logo management separate and global; only workspace admins should be able to manage the MT Legacy site/header/favicon logo.
- Add a `/companies` page:
  - all users: view their companies and create a new one
  - global admins: view all companies and manage cross-workspace membership assignment

### Invitations and membership
- Keep workspace account invitations global-admin-only from the existing users directory.
- Do not add company email invites in v1.
- Global admins assign existing users to companies from the companies admin surface.
- To reconcile the selected rules:
  - company owners/admins manage company details and can manage roles/removals for existing members
  - global admins remain the only actors who add new members/accounts into companies

### Branding and uploads
- Move invoice document branding to the company model.
- Add a company-scoped Supabase Storage route for the active company document logo, restricted to company `owner`/`admin`.
- Stop using `user.documentLogoUrl` for invoices.
- Keep `/api/branding` and global site-logo behavior for MT Legacy app branding only.

### Migration and legacy handling
- Runtime/bootstrap adds the new tables and columns safely.
- Existing users are not auto-seeded with fake companies.
- On first company creation for an existing legacy user:
  - assign all of that user’s legacy invoices with `companyId IS NULL` to the new company
  - seed the company document logo from the user’s current legacy document logo if one exists
- Remove the hardcoded MT issuer/bank fallback from invoice rendering once company setup is required.

## Public API / Interface Changes
- Add company-facing server endpoints:
  - `GET /api/companies` for accessible companies + active company
  - `POST /api/companies` to create a company
  - `POST /api/companies/active` to switch active company
  - `GET /api/companies/:id` and `PATCH /api/companies/:id` for company details
  - `POST /api/companies/:id/logo` or Supabase Storage route for company document logo
  - admin-only membership endpoints for add/remove/role changes
- Expand settings summary to include active company data and company permissions.
- Update invoice payload/serialization so invoice responses include company-derived document logo and issuer context rather than user-derived logo context.
- Add shared frontend types:
  - `Company`
  - `CompanyMembership`
  - `CompanyRole`
  - `ActiveCompanySummary`

## Test Plan
- User with no companies is redirected to company setup from protected app routes.
- Creating a company creates the owner membership, sets `activeCompanyId`, and lands the user in the dashboard.
- Header switcher changes active company and all invoice/settings data re-scopes immediately.
- Regular members only see invoices for the active company; company sharing works across members of the same company.
- Invoice preview/export shows the selected company’s issuer details, bank details, and document logo with no hardcoded MT issuer fallback.
- Company owner/admin can edit company details and upload/remove the company document logo; basic members cannot.
- Global site logo remains available only to workspace admins and does not change when switching companies.
- Global admin can still invite a platform user, and that user is forced through company creation after first sign-in.
- Legacy user migration assigns old invoices to the first created company and carries forward their legacy document logo if present.

## Assumptions and Defaults
- Active company is persisted server-side on the user record via `activeCompanyId`, not only in local storage.
- Invoice themes remain per-invoice, not per-company.
- Company profile fields are required enough to fully replace the current hardcoded invoice issuer and bank details.
- Company owners/admins can manage existing member roles/removals, but adding members is a global-admin action in v1.
- The existing per-user `companyLogo*` fields are treated as obsolete legacy state and are not the source of truth going forward.
