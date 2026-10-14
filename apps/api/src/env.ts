import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

// Local development reads the repo-root .env; deployed environments set real env vars,
// which take precedence over the file.
const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const rootEnvFile = resolve(repoRoot, '.env');
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
  /** Where uploaded map images and their tiles are kept; relative paths start at the repo root. */
  STORAGE_DIR: z.string().min(1).default('storage'),
  /** `console` prints each email to the API log (development); `resend` sends it for real. */
  EMAIL_PROVIDER: z.enum(['console', 'resend']).default('console'),
  RESEND_API_KEY: z.string().min(1).optional(),
  /** Sender address, such as `Atlas & Ink <hello@your-domain.com>`; must be a verified domain on Resend. */
  EMAIL_FROM: z.string().min(3).default('Atlas & Ink <onboarding@resend.dev>'),
  /** Sign-in is refused until the email address is confirmed. Defaults to on whenever email is real. */
  REQUIRE_EMAIL_VERIFICATION: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === 'true')),
  /** Set when the API sits behind a proxy or load balancer, so rate limits see real client IPs. */
  TRUST_PROXY: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment variables:', z.flattenError(parsed.error).fieldErrors);
  throw new Error('Invalid environment variables; see .env.example');
}

const testDatabaseUrl = parsed.data.TEST_DATABASE_URL;
if (isTest && !testDatabaseUrl) throw new Error('TEST_DATABASE_URL is required to run tests');
if (parsed.data.EMAIL_PROVIDER === 'resend' && !parsed.data.RESEND_API_KEY) {
  throw new Error('RESEND_API_KEY is required when EMAIL_PROVIDER=resend');
}

export const env = {
  ...parsed.data,
  isTest,
  isProduction: parsed.data.NODE_ENV === 'production',
  /** Tests always run against the separate test database. */
  databaseUrl: isTest ? testDatabaseUrl! : parsed.data.DATABASE_URL,
  storageDir: resolve(repoRoot, parsed.data.STORAGE_DIR),
  requireEmailVerification:
    parsed.data.REQUIRE_EMAIL_VERIFICATION ?? parsed.data.EMAIL_PROVIDER !== 'console',
};
