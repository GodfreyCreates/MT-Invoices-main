# MT Legacy Logistics Invoices

Invoice generation, storage, export, and public verification for MT Legacy Logistics.

## Environment

Create a `.env` file with:

```env
APP_URL=https://app.example.com
AUTH_ALLOWED_HOSTS=app.example.com,www.example.com,localhost:3000,localhost:5173
DATABASE_URL=postgresql://...
BETTER_AUTH_SECRET=replace-with-a-long-random-secret
TRUSTED_ORIGINS=http://localhost:3000
```

`APP_URL` is the canonical public origin used for invitations and email verification links.
On Vercel, if `APP_URL` is not set, the app falls back to `VERCEL_PROJECT_PRODUCTION_URL` and then `VERCEL_URL`.

`AUTH_ALLOWED_HOSTS` is optional and accepts a comma-separated list of additional auth hosts or host patterns. Use hostnames only, not full URLs.

Frontend auth and API requests are same-origin.

`TRUSTED_ORIGINS` is optional and accepts a comma-separated list of additional absolute origins for true cross-origin auth callers.

`SITE_URL` is still accepted as a deprecated fallback for one transition window, but new deployments should use `APP_URL`.

For production domains, the auth host allow-list now also accepts common apex/`www` aliases automatically (for example, configuring `app.example.com` also allows `www.app.example.com`).

On Vercel, `VERCEL_URL` / `VERCEL_BRANCH_URL` and `APP_URL` are used to build the auth host allow-list.

## Run Locally

1. Install dependencies with `npm install`.
2. Apply the database migrations with `npm run db:migrate`.
3. Start the app with `npm run dev`.

## Build

- `npm run db:migrate`
- `npm run lint`
- `npm run build`
