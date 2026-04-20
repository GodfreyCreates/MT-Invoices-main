import { promises as fs } from 'node:fs';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { db } from '../src/db';

const MIGRATIONS_DIR = path.resolve(process.cwd(), 'drizzle');
const MIGRATIONS_TABLE = '__app_migrations';
const BREAKPOINT_REGEX = /^\s*-->\s*statement-breakpoint\s*$/gm;

function splitStatements(contents: string) {
  return contents
    .split(BREAKPOINT_REGEX)
    .map((statement) => statement.trim())
    .filter(Boolean);
}

async function ensureMigrationsTable() {
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS "${MIGRATIONS_TABLE}" (
      "filename" text PRIMARY KEY,
      "applied_at" timestamp NOT NULL DEFAULT now()
    )
  `));
}

async function getAppliedMigrationFilenames() {
  const result = await db.execute(sql.raw(`
    SELECT "filename"
    FROM "${MIGRATIONS_TABLE}"
    ORDER BY "filename" ASC
  `));

  return new Set(
    result.rows.map((row) => String((row as Record<string, unknown>).filename)),
  );
}

async function getMigrationFilenames() {
  const entries = await fs.readdir(MIGRATIONS_DIR, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

async function applyMigration(filename: string) {
  const filePath = path.join(MIGRATIONS_DIR, filename);
  const contents = await fs.readFile(filePath, 'utf8');
  const statements = splitStatements(contents);

  if (statements.length === 0) {
    console.log(`Skipping empty migration ${filename}`);
    return;
  }

  console.log(`Applying migration ${filename} (${statements.length} statements)`);

  for (const statement of statements) {
    await db.execute(sql.raw(statement));
  }

  await db.execute(sql`
    INSERT INTO "__app_migrations" ("filename")
    VALUES (${filename})
    ON CONFLICT ("filename") DO NOTHING
  `);
}

async function main() {
  await ensureMigrationsTable();

  const migrationFilenames = await getMigrationFilenames();
  const appliedMigrationFilenames = await getAppliedMigrationFilenames();

  for (const filename of migrationFilenames) {
    if (appliedMigrationFilenames.has(filename)) {
      console.log(`Already applied ${filename}`);
      continue;
    }

    await applyMigration(filename);
  }

  console.log('Database migrations are up to date.');
}

main().catch((error) => {
  console.error('Failed to apply database migrations', error);
  process.exitCode = 1;
});
