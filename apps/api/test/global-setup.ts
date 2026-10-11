import { existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

/** Brings the test database to the latest schema and empties it before the run. */
export async function setup() {
  const envFile = fileURLToPath(new URL('../../../.env', import.meta.url));
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('TEST_DATABASE_URL is required to run tests');

  // The database is emptied below, so uploaded files from earlier runs are orphans.
  rmSync(join(tmpdir(), 'atlas-ink-test-storage'), { recursive: true, force: true });

  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await migrate(drizzle(sql), {
      migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)),
    });
    // Cascades to sessions, accounts, worlds and everything inside them.
    await sql`truncate table "user", "verification" cascade`;
  } finally {
    await sql.end();
  }
}
