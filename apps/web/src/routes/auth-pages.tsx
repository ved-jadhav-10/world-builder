import { MailCheck } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { Brand } from '@/components/brand';
import { Button } from '@/components/ui/button';
import { FieldError, Input, Label } from '@/components/ui/inputs';
import { authClient, signIn, signUp } from '@/lib/auth-client';
import { safeNext } from '@/lib/utils';

function AuthCard({
  title,
  children,
  footer,
}: {
  title: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-12">
      <Brand className="mb-8" />
      <div className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-sm">
        <h1 className="font-serif text-2xl font-semibold">{title}</h1>
        <div className="mt-6">{children}</div>
      </div>
      <p className="mt-6 text-sm text-muted-foreground">{footer}</p>
    </div>
  );
}

/** Carries the page someone was heading to (such as an invite link) across the other form. */
function withNext(path: string, next: string | null): string {
  return next ? `${path}?next=${encodeURIComponent(next)}` : path;
}

const linkClass = 'font-medium text-primary hover:underline';

/** Why a confirmation link did not work, when the address it sent the browser to says so. */
const LINK_PROBLEMS: Record<string, string> = {
  token_expired: 'That confirmation link has expired. Sign in and we will send you a new one.',
  invalid_token: 'That confirmation link is not valid. Sign in and we will send you a new one.',
};

export function SignInPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [error, setError] = useState<string>(LINK_PROBLEMS[params.get('error') ?? ''] ?? '');
  const [notice, setNotice] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    setNotice(undefined);
    const { error } = await signIn.email({
      email: String(form.get('email')),
      password: String(form.get('password')),
    });
    setBusy(false);
    if (error) {
      // The server has just emailed a fresh link, so this is a next step, not a dead end.
      if (error.status === 403) {
        return setNotice(
          'Please confirm your email first. We have sent you a new link; check your inbox.',
        );
      }
      return setError(error.message ?? 'Could not sign in');
    }
    void navigate(safeNext(params.get('next')), { replace: true });
  }

  return (
    <AuthCard
      title="Welcome back"
      footer={
        <>
          New here?{' '}
          <Link to={withNext('/sign-up', params.get('next'))} className={linkClass}>
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required autoFocus />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between">
            <Label htmlFor="password">Password</Label>
            <Link to="/forgot-password" className="text-xs text-muted-foreground hover:underline">
              Forgot password?
            </Link>
          </div>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </div>
        <FieldError message={error} />
        {notice ? <p className="text-[13px] text-foreground">{notice}</p> : null}
        <Button type="submit" className="w-full" disabled={busy}>
          Sign in
        </Button>
        {import.meta.env.DEV ? (
          <p className="text-center text-xs text-muted-foreground">
            Demo account (after <code>pnpm db:seed</code>): demo@atlas.local / demo-password
          </p>
        ) : null}
      </form>
    </AuthCard>
  );
}

export function SignUpPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email'));
    setBusy(true);
    setError(undefined);
    const { data, error } = await signUp.email({
      name: String(form.get('name')),
      email,
      password: String(form.get('password')),
      // Where the confirmation link in the email leads, once the address is confirmed.
      callbackURL: `${window.location.origin}${safeNext(params.get('next'))}`,
    });
    setBusy(false);
    if (error) return setError(error.message ?? 'Could not create your account');
    // When the server wants the address confirmed first, there is no session yet. This is a page
    // of its own because the form is replaced while the session is re-read after sign-up.
    if (!data?.token) {
      const query = new URLSearchParams({ email });
      const next = params.get('next');
      if (next) query.set('next', next);
      return void navigate(`/check-email?${query}`, { replace: true });
    }
    void navigate(safeNext(params.get('next')), { replace: true });
  }

  return (
    <AuthCard
      title="Create your account"
      footer={
        <>
          Already have an account?{' '}
          <Link to={withNext('/sign-in', params.get('next'))} className={linkClass}>
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" autoComplete="name" required autoFocus maxLength={100} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
          />
          <p className="text-xs text-muted-foreground">At least 8 characters.</p>
        </div>
        <FieldError message={error} />
        <Button type="submit" className="w-full" disabled={busy}>
          Create account
        </Button>
      </form>
    </AuthCard>
  );
}

/** Where sign-up leads when the address has to be confirmed before the first sign-in. */
export function CheckEmailPage() {
  const [params] = useSearchParams();
  const email = params.get('email');
  return (
    <AuthCard
      title="Check your email"
      footer={
        <>
          Already confirmed?{' '}
          <Link to={withNext('/sign-in', params.get('next'))} className={linkClass}>
            Sign in
          </Link>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        <MailCheck className="size-8 text-primary" />
        <p>
          We sent a confirmation link to {email ? <strong>{email}</strong> : 'your email address'}.
          Open it to finish creating your account.
        </p>
        <p className="text-muted-foreground">
          Nothing arrived? Look in your spam folder. Signing in again sends a new link.
        </p>
      </div>
    </AuthCard>
  );
}

export function ForgotPasswordPage() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [sentTo, setSentTo] = useState<string>();

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get('email'));
    setBusy(true);
    setError(undefined);
    const { error } = await authClient.requestPasswordReset({
      email,
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setBusy(false);
    if (error) return setError(error.message ?? 'Could not send the email. Try again soon.');
    setSentTo(email);
  }

  return (
    <AuthCard
      title="Reset your password"
      footer={
        <Link to="/sign-in" className={linkClass}>
          Back to sign in
        </Link>
      }
    >
      {sentTo ? (
        <div className="space-y-3 text-sm">
          <MailCheck className="size-8 text-primary" />
          <p>
            If there is an account for <strong>{sentTo}</strong>, we have emailed it a link to
            choose a new password. It works for one hour.
          </p>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Enter the email you signed up with and we will send you a link.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" autoComplete="email" required autoFocus />
          </div>
          <FieldError message={error} />
          <Button type="submit" className="w-full" disabled={busy}>
            Send reset link
          </Button>
        </form>
      )}
    </AuthCard>
  );
}

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const newPassword = String(form.get('password'));
    if (newPassword !== String(form.get('confirm'))) return setError('The two passwords differ.');
    setBusy(true);
    setError(undefined);
    const { error } = await authClient.resetPassword({ newPassword, token: token ?? '' });
    setBusy(false);
    if (error) return setError(error.message ?? 'Could not change the password');
    toast.success('Password changed. Sign in with the new one.');
    void navigate('/sign-in', { replace: true });
  }

  if (!token || params.get('error')) {
    return (
      <AuthCard
        title="Link not valid"
        footer={
          <Link to="/sign-in" className={linkClass}>
            Back to sign in
          </Link>
        }
      >
        <p className="text-sm">
          This password link is not valid, or has expired.{' '}
          <Link to="/forgot-password" className={linkClass}>
            Ask for a new one
          </Link>
          .
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Choose a new password"
      footer={
        <Link to="/sign-in" className={linkClass}>
          Back to sign in
        </Link>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="password">New password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            autoFocus
          />
          <p className="text-xs text-muted-foreground">At least 8 characters.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirm">Type it again</Label>
          <Input
            id="confirm"
            name="confirm"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
          />
        </div>
        <FieldError message={error} />
        <Button type="submit" className="w-full" disabled={busy}>
          Change password
        </Button>
      </form>
    </AuthCard>
  );
}
