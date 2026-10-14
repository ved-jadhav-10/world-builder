import { env } from '../env';

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** Everything "sent" while tests run, so they can read the links without a mail server. */
export const outbox: Mail[] = [];

/**
 * Sends one email. In development (`EMAIL_PROVIDER=console`) it prints the message to the API log
 * instead, so verification and reset links can be clicked straight from the terminal. Throws if
 * the provider refuses, so callers decide whether that matters to them.
 */
export async function sendMail(mail: Mail): Promise<void> {
  if (env.isTest) {
    outbox.push(mail);
    return;
  }
  if (env.EMAIL_PROVIDER === 'console') {
    console.info(`[mail] To: ${mail.to}\n[mail] Subject: ${mail.subject}\n${mail.text}\n`);
    return;
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [mail.to],
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(`Email provider answered ${response.status}: ${await response.text()}`);
  }
}

/** Sends in the background: a slow or failing provider must never hold up or break a request. */
export function sendMailSoon(mail: Mail): void {
  sendMail(mail).catch((error: unknown) => {
    console.error(`[mail] Could not send "${mail.subject}" to ${mail.to}:`, error);
  });
}
