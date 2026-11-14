/**
 * Brings the database up to date. Production runs this before the server starts
 * (`node dist/migrate.js`); in development `pnpm db:migrate` does the same through Drizzle Kit.
 */
import { resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { env } from '../env';

const folder = resolve(process.env.MIGRATIONS_DIR ?? 'drizzle');
const sql = postgres(env.databaseUrl, { max: 1, onnotice: () => {} });
try {
  await migrate(drizzle(sql), { migrationsFolder: folder });
  console.info(`Database is up to date (migrations from ${folder}).`);
} finally {
  await sql.end();
}
