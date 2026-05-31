import { useState, FormEvent, useCallback } from 'react';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useApp } from '@/state/AppContext';
import { ApiError } from '@/api/client';


export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const { login } = useApp();
  const navigate = useNavigate();
  const location = useLocation();

  const from = (location.state as { from?: Location })?.from?.pathname || '/';

  const clearError = useCallback(() => setError(null), []);

  const handleError = useCallback((err: unknown) => {
    if (err instanceof ApiError) {
      if (err.errors && err.errors.length > 0) {
        setError(err.errors.join('. '));
      } else {
        setError(err.message);
      }
    } else if (err instanceof Error) {
      setError(err.message);
    } else {
      setError('An unexpected error occurred');
    }
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    clearError();
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
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-sm">
                {error}
              </div>
            )}

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
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-border bg-surface-secondary text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent-green/50 focus:border-accent-green"
                placeholder="Enter your email"
                required
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
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-border bg-surface-secondary text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent-green/50 focus:border-accent-green"
                placeholder="Enter your password"
                required
                autoComplete="current-password"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-2.5 px-4 rounded-lg bg-accent-green text-white font-medium hover:bg-accent-green/90 focus:outline-none focus:ring-2 focus:ring-accent-green/50 focus:ring-offset-2 focus:ring-offset-surface disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
