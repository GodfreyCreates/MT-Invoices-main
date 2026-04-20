import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, Loader2, MailCheck, ShieldCheck } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { authClient } from '../lib/auth-client';
import { useBranding } from '../lib/branding';
import { invokeSupabaseFunction } from '../lib/supabase-functions';
import { toast } from 'sonner';
import { supabase } from '../lib/supabase';

const MIN_PASSWORD_LENGTH = 8;

type InvitationDetails = {
  email: string;
  role: string;
  expiresAt: string;
  companyName?: string | null;
};

type AcceptInvitationResponse = {
  email: string;
  requiresEmailVerification: boolean;
};

function formatDateTime(value: string | null) {
  if (!value) {
    return 'Not available';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'Not available';
  }

  return new Intl.DateTimeFormat('en-ZA', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(parsed);
}

export function AcceptInvitationPage() {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const { resolvedLogoSrc } = useBranding();
  const { data: session } = authClient.useSession();
  const [details, setDetails] = useState<InvitationDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [isComplete, setIsComplete] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFinishingSetup, setIsFinishingSetup] = useState(false);
  const [requiresEmailVerification, setRequiresEmailVerification] = useState(false);
  const [form, setForm] = useState({
    name: '',
    password: '',
    confirmPassword: '',
  });
  const acceptedPasswordRef = useRef('');
  const autoSignInTimeoutRef = useRef<number | null>(null);

  const roleLabel = useMemo(() => {
    if (!details?.role) {
      return 'User';
    }

    return details.role.charAt(0).toUpperCase() + details.role.slice(1);
  }, [details?.role]);

  const signInAcceptedUser = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      throw error;
    }

    await authClient.getSession();
  };

  useEffect(() => {
    const loadInvitation = async () => {
      setIsLoading(true);
      setError('');

      try {
        const invitation = await invokeSupabaseFunction<InvitationDetails>('auth-invitations', {
          body: {
            action: 'get',
            token,
          },
        });
        setDetails(invitation);
      } catch (requestError) {
        const message =
          requestError instanceof Error ? requestError.message : 'Failed to load invitation';
        setError(message);
      } finally {
        setIsLoading(false);
      }
    };

    if (!token) {
      setError('Invitation token is missing');
      setIsLoading(false);
      return;
    }

    void loadInvitation();
  }, [token]);

  useEffect(() => {
    return () => {
      if (autoSignInTimeoutRef.current !== null) {
        window.clearTimeout(autoSignInTimeoutRef.current);
      }
    };
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    if (!details) {
      setError('Invitation details are not available');
      return;
    }

    const trimmedName = form.name.trim();
    if (!trimmedName) {
      setError('Names are required');
      return;
    }

    if (form.password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters long`);
      return;
    }

    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await invokeSupabaseFunction<AcceptInvitationResponse>('auth-invitations', {
        body: {
          action: 'accept',
          token,
          name: trimmedName,
          password: form.password,
        },
      });

      toast.success('Account created successfully');
      acceptedPasswordRef.current = form.password;
      setRequiresEmailVerification(result.requiresEmailVerification);
      setIsComplete(true);
      setError('');

      if (result.requiresEmailVerification) {
        return;
      }

      autoSignInTimeoutRef.current = window.setTimeout(async () => {
        try {
          setIsFinishingSetup(true);

          const invitationEmail = details.email.trim().toLowerCase();
          const currentSessionEmail = session?.user?.email?.trim().toLowerCase() ?? '';

          if (currentSessionEmail && currentSessionEmail !== invitationEmail) {
            await authClient.signOut();
          }

          await signInAcceptedUser(details.email, acceptedPasswordRef.current);
          navigate('/dashboard', { replace: true });
        } catch (signInError) {
          const message =
            signInError instanceof Error
              ? signInError.message
              : 'Failed to finish signing you in automatically';
          setError(message);
          toast.error(message);
          navigate(`/auth?email=${encodeURIComponent(details.email)}&invited=1`, { replace: true });
        } finally {
          setIsFinishingSetup(false);
        }
      }, 5000);
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : 'Failed to accept invitation';
      setError(message);
      toast.error(message);
    } finally {
      setIsFinishingSetup(false);
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col justify-center bg-background px-4 py-12 font-sans sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-lg">
        <div className="flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl border border-border bg-card p-2 shadow-sm">
            <img
              src={resolvedLogoSrc}
              alt="MT Legacy logo"
              className="h-full w-full object-contain"
            />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
            Accept invitation
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Finish setting up your account to access MT Legacy.
          </p>
        </div>

        <div className="mt-8 rounded-[28px] border border-border bg-card p-6 shadow-sm sm:p-8">
          {isLoading ? (
            <div className="flex min-h-60 items-center justify-center gap-3 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading invitation...
            </div>
          ) : error && !details ? (
            <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-5 text-center text-sm text-destructive">
              <AlertTriangle className="mx-auto h-6 w-6" />
              <p className="mt-3 font-semibold text-foreground">Invitation unavailable</p>
              <p className="mt-2">{error}</p>
              <Link
                to="/auth"
                className="mt-4 inline-flex text-sm font-semibold text-foreground underline"
              >
                Go to sign in
              </Link>
            </div>
          ) : isComplete ? (
            <div className="rounded-2xl border border-border bg-secondary p-5 text-center text-sm text-secondary-foreground">
              <MailCheck className="mx-auto h-6 w-6" />
              <p className="mt-3 font-semibold text-foreground">Your account is ready</p>
              <p className="mt-2">
                {requiresEmailVerification
                  ? 'Check your email to confirm the account, then sign in from the main auth page.'
                  : details?.companyName
                    ? `You&apos;ll be signed in automatically in 5 seconds and taken to the ${details.companyName} dashboard.`
                    : 'You&apos;ll be signed in automatically in 5 seconds and taken to the dashboard.'}
              </p>
              <p className="mt-2 text-xs font-medium text-foreground">
                Signed-in email: <strong>{details.email}</strong>
              </p>
              {isFinishingSetup ? (
                <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-background px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Signing you in
                </div>
              ) : null}
            </div>
          ) : details ? (
            <form className="space-y-6" onSubmit={handleSubmit}>
              <div className="rounded-2xl border border-border bg-muted p-4 text-muted-foreground">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
                  <div>
                    <p className="font-semibold text-foreground">Invitation details</p>
                    <p className="mt-1 text-sm">
                      This invitation is reserved for <strong>{details.email}</strong> and expires on{' '}
                      <strong>{formatDateTime(details.expiresAt)}</strong>.
                    </p>
                    <p className="mt-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      Role: {roleLabel}
                    </p>
                    {details.companyName ? (
                      <p className="mt-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        Company: {details.companyName}
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>

              {error ? (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                  {error}
                </div>
              ) : null}

              <div>
                <label className="block text-sm font-medium text-foreground">Email address</label>
                <div className="mt-1 rounded-lg border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
                  {details.email}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground">Names</label>
                <div className="mt-1">
                  <input
                    type="text"
                    required
                    value={form.name}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, name: event.target.value }))
                    }
                    autoComplete="name"
                    className="block w-full appearance-none rounded-lg border border-input bg-background px-3 py-2 text-foreground shadow-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring sm:text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground">Password</label>
                <div className="mt-1">
                  <input
                    type="password"
                    required
                    value={form.password}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, password: event.target.value }))
                    }
                    autoComplete="new-password"
                    className="block w-full appearance-none rounded-lg border border-input bg-background px-3 py-2 text-foreground shadow-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring sm:text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground">Confirm password</label>
                <div className="mt-1">
                  <input
                    type="password"
                    required
                    value={form.confirmPassword}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, confirmPassword: event.target.value }))
                    }
                    autoComplete="new-password"
                    className="block w-full appearance-none rounded-lg border border-input bg-background px-3 py-2 text-foreground shadow-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring sm:text-sm"
                  />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Use at least {MIN_PASSWORD_LENGTH} characters.
                </p>
              </div>

              <Button
                type="submit"
                className="w-full justify-center"
                disabled={isSubmitting || isFinishingSetup}
              >
                {isSubmitting
                    ? 'Creating account...'
                    : 'Create account'}
              </Button>
            </form>
          ) : null}
        </div>
      </div>
    </div>
  );
}
