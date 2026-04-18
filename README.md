# MT Legacy Logistics Invoices

Invoice generation, storage, export, and public verification for MT Legacy Logistics.

## Environment

Create a `.env` file with:

```env
APP_URL=http://localhost:3000
DATABASE_URL=postgresql://...
BETTER_AUTH_SECRET=replace-with-a-long-random-secret
TRUSTED_ORIGINS=http://localhost:3000
```

`TRUSTED_ORIGINS` is optional and accepts a comma-separated list of additional allowed origins.

## Run Locally

1. Install dependencies with `npm install`.
2. Apply the SQL migration in [drizzle/0001_invoice_security.sql](/C:/Users/devel/Downloads/MT-Invoices-main/drizzle/0001_invoice_security.sql).
3. Start the app with `npm run dev`.

## Build

- `npm run lint`
- `npm run build`
