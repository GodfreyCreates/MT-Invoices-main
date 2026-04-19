import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, MailCheck } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { authClient } from '../lib/auth-client';
import { useBranding } from '../lib/branding';
import { Button } from '../components/ui/Button';
import { toast } from 'sonner';
import { ApiError, apiRequest } from '../lib/api';

const MIN_PASSWORD_LENGTH = 8;

export function AuthPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSendingVerificationEmail, setIsSendingVerificationEmail] = useState(false);
  const [requiresEmailVerification, setRequiresEmailVerification] = useState(false);
  const [verificationEmailTarget, setVerificationEmailTarget] = useState('');
  const [verificationNotice, setVerificationNotice] = useState('');
  const navigate = useNavigate();
  const location = useLocation();
  const { data: session } = authClient.useSession();
  const { resolvedLogoSrc } = useBranding();
  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const redirectTo =
    typeof location.state === 'object' &&
    location.state &&
    'from' in location.state &&
    typeof location.state.from === 'string'
      ? location.state.from
      : '/dashboard';
  const prefilledEmail = searchParams.get('email') ?? '';
  const invited = searchParams.get('invited') === '1';

  useEffect(() => {
    if (prefilledEmail) {
      setEmail(prefilledEmail);
    }
  }, [prefilledEmail]);

  useEffect(() => {
    if (session) {
      navigate(redirectTo, { replace: true });
    }
  }, [navigate, redirectTo, session]);

  const isEmailVerificationError = (message: string) =>
    message.trim().toLowerCase().includes('email not verified');

  const sendVerificationEmail = async (targetEmail: string, showSuccessToast = true) => {
    setIsSendingVerificationEmail(true);

    try {
      await apiRequest<{ status: boolean }>('/api/auth/send-verification-email', {
        method: 'POST',
        body: JSON.stringify({
          email: targetEmail,
          callbackURL: redirectTo,
        }),
      });

      setRequiresEmailVerification(true);
      setVerificationEmailTarget(targetEmail);
      setVerificationNotice(
        `We sent a confirmation email to ${targetEmail}. Open it to verify your account, then sign in again.`,
      );
      setError('');

      if (showSuccessToast) {
        toast.success('Confirmation email sent');
      }
    } catch (requestError) {
      const message =
        requestError instanceof ApiError
          ? requestError.message
          : 'Failed to send verification email';

      setRequiresEmailVerification(true);
      setVerificationEmailTarget(targetEmail);
      setVerificationNotice(
        'Your email is not verified yet. We could not resend the confirmation email automatically. Try again below.',
      );
      setError(message);
      toast.error(message);
    } finally {
      setIsSendingVerificationEmail(false);
    }
  };

  const handleUnverifiedEmail = async (targetEmail: string) => {
    setRequiresEmailVerification(true);
    setVerificationEmailTarget(targetEmail);
    setVerificationNotice(
      `Your email is not verified yet. We're sending a confirmation email to ${targetEmail} now.`,
    );
    setError('');
    await sendVerificationEmail(targetEmail, false);
  };

  const handleAuthSuccess = async () => {
    await authClient.getSession();
    toast.success('Signed in successfully');
    navigate(redirectTo, { replace: true });
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setRequiresEmailVerification(false);
    setVerificationEmailTarget('');
    setVerificationNotice('');

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setError('Email is required');
      return;
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters long`);
      return;
    }

    setIsLoading(true);

    try {
      await authClient.signIn.email(
        {
          email: normalizedEmail,
          password,
          callbackURL: redirectTo,
        },
        {
          onSuccess: async () => {
            await handleAuthSuccess();
          },
          onError: async (ctx) => {
            const message = ctx.error.message || 'Failed to sign in';

            if (isEmailVerificationError(message)) {
              await handleUnverifiedEmail(normalizedEmail);
              return;
            }

            setError(message);
            toast.error(message);
          },
        },
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to sign in';

      if (isEmailVerificationError(message)) {
        await handleUnverifiedEmail(normalizedEmail);
      } else {
        setError(message);
        toast.error(message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col justify-center bg-gray-50 px-4 py-12 font-sans sm:px-6 lg:px-8">
      <div className="flex flex-col items-center sm:mx-auto sm:w-full sm:max-w-md">
        <div className="mb-4 flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
          <img
            src={resolvedLogoSrc}
            alt="MT Legacy logo"
            className="h-full w-full object-contain"
          />
        </div>
        <h2 className="mt-2 text-center text-3xl font-extrabold tracking-tight text-gray-900">
          Sign in to your account
        </h2>
        <p className="mt-3 max-w-sm text-center text-sm leading-6 text-slate-500">
          Access is managed by administrator invitation. If you need an account, ask your admin to send you an invitation email.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="border border-gray-200 bg-white px-4 py-8 shadow-sm sm:rounded-xl sm:px-10">
          {invited ? (
            <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
              <div className="flex items-start gap-3">
                <MailCheck className="mt-0.5 h-5 w-5 shrink-0" />
                <div>
                  <p className="font-semibold text-emerald-900">Invitation accepted</p>
                  <p className="mt-1">Your account is ready. Sign in with the password you just created.</p>
                </div>
              </div>
            </div>
          ) : null}

          {requiresEmailVerification ? (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              <div className="flex items-start gap-3">
                <MailCheck className="mt-0.5 h-5 w-5 shrink-0" />
                <div className="flex-1">
                  <p className="font-semibold text-amber-950">Verify your email address</p>
                  <p className="mt-1">
                    {verificationNotice ||
                      `We sent a confirmation email to ${verificationEmailTarget}. Open it to verify your account, then sign in again.`}
                  </p>
                  <div className="mt-3">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-2 border-amber-300 bg-white/80 text-amber-900 hover:bg-white"
                      onClick={() => void sendVerificationEmail(verificationEmailTarget || email)}
                      disabled={isSendingVerificationEmail || !(verificationEmailTarget || email)}
                    >
                      {isSendingVerificationEmail ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Sending...
                        </>
                      ) : (
                        'Resend confirmation email'
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          <form className="space-y-6" onSubmit={handleSubmit}>
            {error ? (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
                {error}
              </div>
            ) : null}

            <div>
              <label className="block text-sm font-medium text-gray-700">Email address</label>
              <div className="mt-1">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
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
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  className="block w-full appearance-none rounded-lg border border-gray-300 px-3 py-2 placeholder-gray-400 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
                />
              </div>
            </div>

            <div>
              <Button type="submit" className="w-full justify-center" disabled={isLoading}>
                {isLoading ? 'Please wait...' : 'Sign in'}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
