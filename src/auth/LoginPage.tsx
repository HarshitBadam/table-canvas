import { useState, useEffect, useRef, FormEvent, useCallback } from 'react';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useApp } from '@/state/AppContext';
import { ApiError } from '@/api/client';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
const GIS_SCRIPT_URL = 'https://accounts.google.com/gsi/client';

interface GoogleCredentialResponse {
  credential: string;
  select_by: string;
}

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [gisReady, setGisReady] = useState(false);

  const { login, googleLogin, continueAsGuest } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const googleBtnRef = useRef<HTMLDivElement>(null);

  const from = (location.state as { from?: Location })?.from?.pathname || '/';

  const clearFormError = useCallback(() => setFormError(null), []);

  const handleError = useCallback((err: unknown) => {
    if (err instanceof ApiError) {
      if (err.statusCode === 401) {
        setFormError('The email or password is incorrect. Check your details and try again.');
      } else if (err.statusCode === 403) {
        setFormError('This account does not have access to Table Canvas.');
      } else if (err.statusCode === 429) {
        setFormError('Too many sign-in attempts. Wait a few minutes, then try again.');
      } else if (err.statusCode >= 500) {
        setFormError('Table Canvas could not sign you in right now. Your details were not lost; please try again.');
      } else if (err.errors && err.errors.length > 0) {
        setFormError(err.errors.join('. '));
      } else {
        setFormError(err.message);
      }
    } else if (err instanceof TypeError) {
      setFormError('Cannot reach Table Canvas. Check your connection and try again.');
    } else if (err instanceof Error && err.message) {
      setFormError('Sign-in failed. Check your connection and try again.');
    } else {
      setFormError('Sign-in failed unexpectedly. Please try again.');
    }
  }, []);

  const handleGoogleCredential = useCallback(
    async (response: GoogleCredentialResponse) => {
      clearFormError();
      setIsSubmitting(true);
      try {
        await googleLogin(response.credential);
        navigate(from, { replace: true });
      } catch (err) {
        handleError(err);
      } finally {
        setIsSubmitting(false);
      }
    },
    [googleLogin, navigate, from, clearFormError, handleError],
  );

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;

    const existing = document.querySelector(`script[src="${GIS_SCRIPT_URL}"]`);
    if (existing) {
      if ((window as unknown as Record<string, unknown>).google) {
        setGisReady(true);
      }
      return;
    }

    const script = document.createElement('script');
    script.src = GIS_SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.onload = () => setGisReady(true);
    script.onerror = () => {
      /* GIS script failed to load — degrade gracefully */
    };
    document.head.appendChild(script);
  }, []);

  useEffect(() => {
    if (!gisReady || !GOOGLE_CLIENT_ID || !googleBtnRef.current) return;
    const g = (window as unknown as Record<string, unknown>).google as {
      accounts: {
        id: {
          initialize: (config: Record<string, unknown>) => void;
          renderButton: (parent: HTMLElement, config: Record<string, unknown>) => void;
        };
      };
    } | undefined;
    if (!g) return;

    g.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: handleGoogleCredential,
      use_fedcm_for_button: true,
    });
    // Clear any previously rendered button first; otherwise effect re-runs (StrictMode
    // double-invoke, or a changed callback identity) stack duplicate Google buttons.
    googleBtnRef.current.innerHTML = '';
    g.accounts.id.renderButton(googleBtnRef.current, {
      type: 'standard',
      theme: 'outline',
      size: 'large',
      width: googleBtnRef.current.offsetWidth,
      text: 'signin_with',
    });
  }, [gisReady, handleGoogleCredential]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    clearFormError();
    setIsSubmitting(true);

    try {
      await login({ email, password });
      navigate(from, { replace: true });
    } catch (err) {
      handleError(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-canvas p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-accent-green/10 flex items-center justify-center">
            <svg
              className="w-8 h-8 text-accent-green"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-text-primary">Table Canvas</h1>
          <p className="text-sm text-text-secondary mt-1">Welcome back!</p>
        </div>

        <div className="bg-surface border border-border rounded-xl p-6 shadow-lg">
          {formError && (
            <div
              id="login-error"
              role="alert"
              className="mb-4 p-3 rounded-lg bg-error/10 border border-error/20 text-error-text text-sm"
            >
              {formError}
            </div>
          )}

          {GOOGLE_CLIENT_ID && gisReady && (
            <>
              <div ref={googleBtnRef} className="w-full" />
              <div className="relative my-5">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-surface px-2 text-text-tertiary">or</span>
                </div>
              </div>
            </>
          )}

          <form
            onSubmit={handleSubmit}
            className="space-y-4"
            aria-describedby={formError ? 'login-error' : undefined}
          >
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-text-secondary mb-1.5"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  clearFormError();
                }}
                className="w-full px-3 py-2 rounded-lg border border-border bg-surface-secondary text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent-green"
                placeholder="Enter your email"
                required
                maxLength={254}
                autoComplete="email"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-text-secondary mb-1.5"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  clearFormError();
                }}
                className="w-full px-3 py-2 rounded-lg border border-border bg-surface-secondary text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent-green"
                placeholder="Enter your password"
                required
                maxLength={1024}
                autoComplete="current-password"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-2.5 px-4 rounded-lg bg-accent-green text-white font-medium hover:bg-accent-green/90 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isSubmitting ? (
                <span className="flex items-center justify-center gap-2">
                  <LoadingSpinner size="sm" />
                  Signing in...
                </span>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          <div className="relative my-5">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-surface px-2 text-text-tertiary">or</span>
            </div>
          </div>

          <button
            type="button"
            disabled={isSubmitting}
            onClick={async () => {
              clearFormError();
              setIsSubmitting(true);
              try {
                await continueAsGuest();
                navigate(from, { replace: true });
              } catch (err) {
                handleError(err);
              } finally {
                setIsSubmitting(false);
              }
            }}
            className="btn btn-secondary w-full"
          >
            Continue without an account
          </button>
          <p className="mt-2 text-center text-xs text-text-tertiary">
            Work stays in this browser. Sign in later to sync it.
          </p>

          <div className="mt-6 pt-6 border-t border-border text-center">
            <p className="text-sm text-text-secondary">
              Don't have an account?{' '}
              <Link
                to="/early-access"
                className="text-accent-green hover:underline font-medium"
              >
                Request early access
              </Link>
            </p>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-text-tertiary">
          By continuing, you agree to our Terms of Service and Privacy Policy
        </p>
      </div>
    </div>
  );
}
