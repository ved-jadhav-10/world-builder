import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db } from './db/client';
import * as schema from './db/schema';
import { env } from './env';

export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  basePath: '/api/auth',
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: [env.WEB_ORIGIN],
  database: drizzleAdapter(db, { provider: 'pg', schema }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    // No email provider yet: surface reset links in the API log during development.
    sendResetPassword: async ({ user, url }) => {
      console.info(`[auth] Password reset requested for ${user.email}: ${url}`);
    },
  },
  rateLimit: { enabled: !env.isTest },
});

export type SessionUser = typeof auth.$Infer.Session.user;
