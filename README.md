# MT Legacy Logistics Invoices

Invoice generation, storage, export, and public verification for MT Legacy Logistics.

## Environment

Create a `.env` file with:

```env
APP_URL=https://app.example.com
APP_SECRET=replace-with-a-long-random-secret
SUPABASE_DB_URL=postgresql://postgres.project:password@aws-0-region.pooler.supabase.com:6543/postgres
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-supabase-publishable-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
```

`APP_URL` is the canonical public origin used for invitations and Supabase email links.
`SUPABASE_DB_URL` should point to your Supabase Postgres connection string.
`SUPABASE_SERVICE_ROLE_KEY` is required for trusted server-side auth admin operations. Never expose it to the browser.

On Vercel, if `APP_URL` is not set, the app falls back to `VERCEL_PROJECT_PRODUCTION_URL` and then `VERCEL_URL`.
`SITE_URL` is still accepted as a deprecated fallback for one transition window, but new deployments should use `APP_URL`.

## Run Locally

1. Install dependencies with `npm install`.
2. Apply the database migrations with `npm run db:migrate`.
3. Start the app with `npm run dev`.

## Build

- `npm run db:migrate`
- `npm run lint`
- `npm run build`
