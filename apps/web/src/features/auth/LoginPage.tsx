import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router';
import { Logo } from '../../brand/Logo.tsx';
import { Alert } from '../../components/ui/alert.tsx';
import { Button } from '../../components/ui/button.tsx';
import { TextField } from '../../components/ui/field.tsx';
import { ApiError } from '../../lib/api.ts';
import { useDevLogin, useSession } from './api.ts';

/** Only same-app paths are valid continuation targets (prevents open redirects). */
function safeNext(value: string | null): string {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : '/';
}

function loginErrorMessage(error: unknown): { title: string; body?: string } {
  if (!(error instanceof ApiError)) return { title: 'Sign-in failed. Please try again.' };
  switch (error.code) {
    case 'UNAUTHENTICATED':
      return { title: error.message, body: 'Check the address, or ask a facility administrator to create your account.' };
    case 'USER_INACTIVE':
      return { title: 'This account is deactivated', body: 'Contact a facility administrator to restore access.' };
    case 'NOT_FOUND':
      return { title: 'Development sign-in is not enabled on this server.' };
    case 'NETWORK_ERROR':
      return { title: error.message };
    default:
      return { title: error.message };
  }
}

export function LoginPage() {
  const session = useSession();
  const login = useDevLogin();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState('');
  const next = safeNext(params.get('next'));

  if (session.data) return <Navigate to={next} replace />;

  function submit(event: FormEvent) {
    event.preventDefault();
    login.mutate(email.trim(), { onSuccess: () => void navigate(next, { replace: true }) });
  }

  const failure = login.isError ? loginErrorMessage(login.error) : null;

  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,480px)_1fr]">
      <aside className="hidden flex-col justify-between bg-pix-blue p-10 text-white lg:flex">
        {/* Brand board: primary stacked logo, inverse, with the tagline. */}
        <Logo layout="stacked" tone="inverse" size="lg" tagline align="start" />
        <div className="flex flex-col gap-3">
          <p className="eyebrow text-white/60!">ICFO Core Facilities</p>
          <p className="font-title text-display">Management &amp; Operational System for Advanced ICFO Cores</p>
          <p className="text-white/70">Nano Fabrication Lab · Nanocharacterization Lab · Super-resolution Light Microscopy &amp; Nanoscopy</p>
        </div>
        <p className="text-caption text-white/50">Institut de Ciències Fotòniques</p>
      </aside>

      <main className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="flex w-full max-w-sm flex-col gap-5" noValidate>
          <div className="flex flex-col gap-1">
            <Logo layout="horizontal" tone="color" size="md" tagline className="mb-4 lg:hidden" />
            <h1 className="font-title text-title-md text-ink">Sign in</h1>
            <p className="text-body-sm text-ink-muted">
              Development sign-in: enter the email of an existing MOSAIC account. Institutional SSO replaces this in production.
            </p>
          </div>
          {failure && (
            <Alert tone="danger" title={failure.title}>{failure.body}</Alert>
          )}
          <TextField label="Email" type="email" autoComplete="email" required value={email}
            onChange={(e) => setEmail(e.target.value)} />
          <Button type="submit" size="lg" loading={login.isPending} disabled={email.trim() === ''}>Sign in</Button>
        </form>
      </main>
    </div>
  );
}
