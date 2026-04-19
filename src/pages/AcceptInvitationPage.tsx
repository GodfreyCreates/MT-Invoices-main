import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, Loader2, MailCheck, ShieldCheck } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { authClient } from '../lib/auth-client';
import { useBranding } from '../lib/branding';
import { ApiError, apiRequest } from '../lib/api';
import { toast } from 'sonner';

const MIN_PASSWORD_LENGTH = 8;

type InvitationDetails = {
  email: string;
  role: string;
  expiresAt: string;
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
    await new Promise<void>((resolve, reject) => {
      void authClient.signIn.email(
        {
          email,
          password,
        },
        {
          onSuccess: async () => {
            await authClient.getSession();
            resolve();
          },
          onError: (ctx) => {
            reject(new Error(ctx.error.message || 'Failed to sign in with the invitation account'));
          },
        },
      );
    });
  };

  useEffect(() => {
    const loadInvitation = async () => {
      setIsLoading(true);
      setError('');

      try {
        const invitation = await apiRequest<InvitationDetails>(`/api/invitations/${token}`);
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
      await apiRequest(`/api/invitations/${token}/accept`, {
        method: 'POST',
        body: JSON.stringify({
          name: trimmedName,
          password: form.password,
        }),
      });

      toast.success('Account created successfully');
      acceptedPasswordRef.current = form.password;
      setIsComplete(true);
      setError('');

      autoSignInTimeoutRef.current = window.setTimeout(async () => {
        try {
          setIsFinishingSetup(true);

          const invitationEmail = details.email.trim().toLowerCase();
          const currentSessionEmail = session?.user?.email?.trim().toLowerCase() ?? '';

          if (currentSessionEmail && currentSessionEmail !== invitationEmail) {
            await authClient.signOut();
          }

          await signInAcceptedUser(details.email, acceptedPasswordRef.current);
          navigate('/', { replace: true });
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
      const message =
        requestError instanceof ApiError ? requestError.message : 'Failed to accept invitation';
      setError(message);
      toast.error(message);
    } finally {
      setIsFinishingSetup(false);
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col justify-center bg-slate-50 px-4 py-12 font-sans sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-lg">
        <div className="flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
            <img
              src={resolvedLogoSrc}
              alt="MT Legacy logo"
              className="h-full w-full object-contain"
            />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-950">
            Accept invitation
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-500">
            Finish setting up your account to access MT Legacy.
          </p>
        </div>

        <div className="mt-8 rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_30px_90px_-50px_rgba(15,23,42,0.45)] sm:p-8">
          {isLoading ? (
            <div className="flex min-h-60 items-center justify-center gap-3 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading invitation...
            </div>
          ) : error && !details ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-center text-sm text-red-700">
              <AlertTriangle className="mx-auto h-6 w-6" />
              <p className="mt-3 font-semibold text-red-900">Invitation unavailable</p>
              <p className="mt-2">{error}</p>
              <Link
                to="/auth"
                className="mt-4 inline-flex text-sm font-semibold text-red-800 underline"
              >
                Go to sign in
              </Link>
            </div>
          ) : isComplete ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-center text-sm text-emerald-700">
              <MailCheck className="mx-auto h-6 w-6" />
              <p className="mt-3 font-semibold text-emerald-900">Your account is ready</p>
              <p className="mt-2">
                You&apos;ll be signed in automatically in 5 seconds and taken to the dashboard.
              </p>
              <p className="mt-2 text-xs font-medium text-emerald-800">
                Signed-in email: <strong>{details.email}</strong>
              </p>
              {isFinishingSetup ? (
                <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/70 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-900">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Signing you in
                </div>
              ) : null}
            </div>
          ) : details ? (
            <form className="space-y-6" onSubmit={handleSubmit}>
              <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-4 text-indigo-700">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
                  <div>
                    <p className="font-semibold text-indigo-950">Invitation details</p>
                    <p className="mt-1 text-sm">
                      This invitation is reserved for <strong>{details.email}</strong> and expires on{' '}
                      <strong>{formatDateTime(details.expiresAt)}</strong>.
                    </p>
                    <p className="mt-2 text-xs font-semibold uppercase tracking-[0.18em] text-indigo-500">
                      Role: {roleLabel}
                    </p>
                  </div>
                </div>
              </div>

              {error ? (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
                  {error}
                </div>
              ) : null}

              <div>
                <label className="block text-sm font-medium text-gray-700">Email address</label>
                <div className="mt-1 rounded-lg border border-gray-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                  {details.email}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Names</label>
                <div className="mt-1">
                  <input
                    type="text"
                    required
                    value={form.name}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, name: event.target.value }))
                    }
                    autoComplete="name"
                    className="block w-full appearance-none rounded-lg border border-gray-300 px-3 py-2 placeholder-gray-400 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Password</label>
                <div className="mt-1">
                  <input
                    type="password"
                    required
                    value={form.password}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, password: event.target.value }))
                    }
                    autoComplete="new-password"
                    className="block w-full appearance-none rounded-lg border border-gray-300 px-3 py-2 placeholder-gray-400 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Confirm password</label>
                <div className="mt-1">
                  <input
                    type="password"
                    required
                    value={form.confirmPassword}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, confirmPassword: event.target.value }))
                    }
                    autoComplete="new-password"
                    className="block w-full appearance-none rounded-lg border border-gray-300 px-3 py-2 placeholder-gray-400 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
                  />
                </div>
                <p className="mt-2 text-xs text-slate-500">
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
