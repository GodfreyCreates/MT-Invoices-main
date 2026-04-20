import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { getDatabaseUrl } from '../lib/server-env';
import * as schema from './schema';

const queryClient = postgres(getDatabaseUrl(), {
  prepare: false,
  max: 10,
  ssl: 'require',
});

export const db = drizzle(queryClient, { schema });
export { queryClient };
