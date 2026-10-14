import type { Mail } from './mailer';

const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

/** One plain layout for every email: a sentence or two, one button, and a fallback link. */
function layout(options: {
  to: string;
  subject: string;
  intro: string;
  buttonLabel: string;
  url: string;
  outro: string;
}): Mail {
  const { to, subject, intro, buttonLabel, url, outro } = options;
  const text = `${intro}\n\n${buttonLabel}: ${url}\n\n${outro}\n\nAtlas & Ink`;
  const html = `<!doctype html>
<html><body style="margin:0;background:#f6f3ee;font-family:Georgia,serif;color:#241f1a">
<div style="max-width:480px;margin:0 auto;padding:32px 20px">
<p style="font-size:18px;line-height:1.5">${escapeHtml(intro).replaceAll('\n', '<br>')}</p>
<p style="margin:28px 0"><a href="${escapeHtml(url)}" style="background:#7a3e1d;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-family:Arial,sans-serif;font-size:15px">${escapeHtml(buttonLabel)}</a></p>
<p style="font-family:Arial,sans-serif;font-size:13px;color:#6b6258;line-height:1.5">If the button does not work, paste this address into your browser:<br><span style="word-break:break-all">${escapeHtml(url)}</span></p>
<p style="font-family:Arial,sans-serif;font-size:13px;color:#6b6258;line-height:1.5">${escapeHtml(outro)}</p>
<p style="font-family:Arial,sans-serif;font-size:13px;color:#6b6258">Atlas &amp; Ink</p>
</div></body></html>`;
  return { to, subject, text, html };
}

export function verificationEmail(to: string, name: string, url: string): Mail {
  return layout({
    to,
    subject: 'Confirm your email for Atlas & Ink',
    intro: `Hi ${name}, welcome to Atlas & Ink. Please confirm this is your email address.`,
    buttonLabel: 'Confirm my email',
    url,
    outro:
      "This link works for one hour. If you didn't create an account, you can ignore this email.",
  });
}

export function passwordResetEmail(to: string, name: string, url: string): Mail {
  return layout({
    to,
    subject: 'Reset your Atlas & Ink password',
    intro: `Hi ${name}, someone asked to reset the password for this account.`,
    buttonLabel: 'Choose a new password',
    url,
    outro:
      "This link works for one hour. If it wasn't you, ignore this email and your password stays as it is.",
  });
}

export function inviteEmail(
  to: string,
  options: { inviterName: string; worldName: string; roleLabel: string; url: string },
): Mail {
  const { inviterName, worldName, roleLabel, url } = options;
  return layout({
    to,
    subject: `${inviterName} invited you to ${worldName}`,
    intro: `${inviterName} invited you to join the world "${worldName}" on Atlas & Ink as ${roleLabel}.`,
    buttonLabel: 'Open the invitation',
    url,
    outro:
      "The link was made for you, so please don't forward it. If you weren't expecting this, you can ignore it.",
  });
}
