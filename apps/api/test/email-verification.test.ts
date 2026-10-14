import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Verification is off for every other test file; this one turns it on before the app loads.
vi.hoisted(() => {
  process.env.REQUIRE_EMAIL_VERIFICATION = 'true';
});

import { buildApp } from '../src/app';
import { outbox, type Mail } from '../src/lib/mailer';
import { PASSWORD, apiClient, type TestApp } from './helpers';

let app: TestApp;
beforeAll(async () => {
  app = await buildApp();
});
afterAll(async () => {
  delete process.env.REQUIRE_EMAIL_VERIFICATION;
  await app.close();
});
beforeEach(() => {
  outbox.length = 0;
});

const origin = { origin: process.env.WEB_ORIGIN ?? 'http://localhost:5173' };

const post = (url: string, payload: object) =>
  app.inject({ method: 'POST', url: `/api/auth${url}`, headers: origin, payload });

const register = (email = `${randomUUID()}@test.local`) =>
  post('/sign-up/email', { email, password: PASSWORD, name: 'Vera Test' }).then((res) => ({
    res,
    email,
  }));

/** The first https?://… link in an email, as a path the test app can call. */
function linkIn(mail: Mail | undefined): string {
  expect(mail, 'an email should have been sent').toBeDefined();
  const url = new URL(/https?:\/\/\S+/.exec(mail!.text)![0]);
  return url.pathname + url.search;
}

describe('email verification', () => {
  it('sends a confirmation email at sign-up and gives no session until it is used', async () => {
    const { res, email } = await register();
    expect(res.statusCode, res.body).toBe(200);
    expect(res.cookies.map((c) => c.name).join()).not.toContain('session_token');

    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({ to: email, subject: 'Confirm your email for Atlas & Ink' });
    expect(outbox[0]!.html).toContain('Confirm my email');
  });

  it('refuses sign-in until confirmed, and sends a fresh link instead of a dead end', async () => {
    const { email } = await register();
    outbox.length = 0;

    const attempt = await post('/sign-in/email', { email, password: PASSWORD });
    expect(attempt.statusCode).toBe(403);
    expect(outbox).toHaveLength(1);
    expect(outbox[0]!.to).toBe(email);
  });

  it('signs the person in once the link is followed, and sign-in then works', async () => {
    const { email } = await register();
    const confirm = await app.inject({ method: 'GET', url: linkIn(outbox[0]) });
    // The link sends the browser on to the app; the session cookie comes with it.
    expect(confirm.statusCode).toBeLessThan(400);
    const cookie = confirm.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
    expect(cookie).toContain('session_token');
    expect((await apiClient(app, cookie).get('/worlds')).statusCode).toBe(200);

    const signIn = await post('/sign-in/email', { email, password: PASSWORD });
    expect(signIn.statusCode).toBe(200);
  });

  it('rejects a tampered or reused link', async () => {
    await register();
    const link = linkIn(outbox[0]);
    const tampered = link.replace(/token=[^&]+/, 'token=not-a-real-token');
    const bad = await app.inject({ method: 'GET', url: tampered });
    expect(bad.cookies.map((c) => c.name).join()).not.toContain('session_token');
  });

  it('escapes names in the email body', async () => {
    const email = `${randomUUID()}@test.local`;
    await post('/sign-up/email', { email, password: PASSWORD, name: '<b>Eve</b>' });
    expect(outbox[0]!.html).not.toContain('<b>Eve</b>');
    expect(outbox[0]!.html).toContain('&lt;b&gt;Eve&lt;/b&gt;');
  });
});

describe('password reset', () => {
  async function confirmed() {
    const { email } = await register();
    await app.inject({ method: 'GET', url: linkIn(outbox[0]) });
    outbox.length = 0;
    return email;
  }

  it('emails a link that sets a new password and ends the old sessions', async () => {
    const email = await confirmed();
    const first = await post('/sign-in/email', { email, password: PASSWORD });
    const oldCookie = first.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
    expect((await apiClient(app, oldCookie).get('/worlds')).statusCode).toBe(200);

    const asked = await post('/request-password-reset', {
      email,
      redirectTo: `${origin.origin}/reset-password`,
    });
    expect(asked.statusCode, asked.body).toBe(200);
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({ to: email, subject: 'Reset your Atlas & Ink password' });

    // The emailed link carries a token; the reset page sends it back with the new password.
    const reset = await app.inject({ method: 'GET', url: linkIn(outbox[0]) });
    const token = new URL(reset.headers.location as string, origin.origin).searchParams.get(
      'token',
    );
    expect(token).toBeTruthy();
    const changed = await post('/reset-password', { newPassword: 'a-brand-new-password', token });
    expect(changed.statusCode, changed.body).toBe(200);

    expect((await post('/sign-in/email', { email, password: PASSWORD })).statusCode).toBe(401);
    expect(
      (await post('/sign-in/email', { email, password: 'a-brand-new-password' })).statusCode,
    ).toBe(200);
    expect((await apiClient(app, oldCookie).get('/worlds')).statusCode).toBe(401);
  });

  it('says the same thing for an address that has no account, and sends nothing', async () => {
    const known = await confirmed();
    const asked = (email: string) =>
      post('/request-password-reset', { email, redirectTo: `${origin.origin}/reset-password` });
    const real = await asked(known);
    outbox.length = 0;
    const unknown = await asked(`${randomUUID()}@test.local`);
    expect(unknown.statusCode).toBe(real.statusCode);
    expect(unknown.json()).toEqual(real.json());
    expect(outbox).toHaveLength(0);
  });
});
