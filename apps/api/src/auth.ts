import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db } from './db/client';
import * as schema from './db/schema';
import { env } from './env';
import { passwordResetEmail, verificationEmail } from './lib/email-templates';
import { sendMailSoon } from './lib/mailer';
import { noteWorldsToRemove, removeNotedWorldFiles } from './modules/account/service';

/** Set by the auth route to Fastify's view of the client address; see plugins/auth-routes.ts. */
export const CLIENT_IP_HEADER = 'x-atlas-client-ip';

export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  basePath: '/api/auth',
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: [env.WEB_ORIGIN],
  // Only our own header is read, so a client can't dodge the limits by forging X-Forwarded-For.
  advanced: { ipAddress: { ipAddressHeaders: [CLIENT_IP_HEADER] } },
  database: drizzleAdapter(db, { provider: 'pg', schema }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    requireEmailVerification: env.requireEmailVerification,
    // A reset proves control of the mailbox, so a stolen session shouldn't survive it.
    revokeSessionsOnPasswordReset: true,
    // Not awaited: how long the provider takes must not reveal whether an account exists.
    sendResetPassword: async ({ user, url }) => {
      sendMailSoon(passwordResetEmail(user.email, user.name, url));
    },
  },
  emailVerification: {
    sendOnSignUp: env.requireEmailVerification,
    // Signing in with an unconfirmed address sends a fresh link instead of a dead end.
    sendOnSignIn: env.requireEmailVerification,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      sendMailSoon(verificationEmail(user.email, user.name, url));
    },
  },
  user: {
    deleteUser: {
      enabled: true,
      beforeDelete: async (user) => noteWorldsToRemove(user.id),
      afterDelete: async (user) => removeNotedWorldFiles(user.id),
    },
  },
  rateLimit: { enabled: !env.isTest },
});

export type SessionUser = typeof auth.$Infer.Session.user;
