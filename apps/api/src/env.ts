import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

// Local development reads the repo-root .env; deployed environments set real env vars,
// which take precedence over the file.
const rootEnvFile = fileURLToPath(new URL('../../../.env', import.meta.url));
if (existsSync(rootEnvFile)) process.loadEnvFile(rootEnvFile);

const isTest = process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST);

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.url(),
  TEST_DATABASE_URL: z.url().optional(),
  BETTER_AUTH_SECRET: z.string().min(32, 'BETTER_AUTH_SECRET must be at least 32 characters'),
  BETTER_AUTH_URL: z.url(),
  WEB_ORIGIN: z.url(),
  API_HOST: z.string().default('localhost'),
  API_PORT: z.coerce.number().int().default(3000),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment variables:', z.flattenError(parsed.error).fieldErrors);
  throw new Error('Invalid environment variables; see .env.example');
}

const testDatabaseUrl = parsed.data.TEST_DATABASE_URL;
if (isTest && !testDatabaseUrl) throw new Error('TEST_DATABASE_URL is required to run tests');

export const env = {
  ...parsed.data,
  isTest,
  isProduction: parsed.data.NODE_ENV === 'production',
  /** Tests always run against the separate test database. */
  databaseUrl: isTest ? testDatabaseUrl! : parsed.data.DATABASE_URL,
};
