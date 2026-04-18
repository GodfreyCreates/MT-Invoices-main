import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { getDatabaseUrl } from '../lib/server-env';
import * as schema from './schema';

const sql = neon(getDatabaseUrl());
export const db = drizzle(sql, { schema });
