import postgres from 'npm:postgres@3.4.7';
import { HttpError } from './auth.ts';

const databaseUrl = Deno.env.get('SUPABASE_DB_URL') ?? '';

function requireDatabaseUrl() {
  if (!databaseUrl) {
    throw new HttpError(500, 'Missing required function environment variable: SUPABASE_DB_URL');
  }

  return databaseUrl;
}

export const db = postgres(requireDatabaseUrl(), {
  prepare: false,
  max: 1,
  idle_timeout: 5,
  connect_timeout: 10,
});
