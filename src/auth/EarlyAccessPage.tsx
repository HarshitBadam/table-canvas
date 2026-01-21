import { useNavigate } from 'react-router-dom';

/**
 * Early Access Page - Shown when users try to register
 */
export function EarlyAccessPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex items-center justify-center bg-canvas p-4">
      <div className="w-full max-w-md">
        {/* Logo/Header */}
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
          <p className="text-sm text-text-secondary mt-1">Early Access Program</p>
        </div>

        {/* Message Card */}
        <div className="bg-surface border border-border rounded-xl p-6 shadow-lg">
          <div className="text-center">
            {/* Info Icon */}
            <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-accent-blue/10 flex items-center justify-center">
              <svg
                className="w-6 h-6 text-accent-blue"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>

            <h2 className="text-lg font-semibold text-text-primary mb-2">
              Coming Soon
            </h2>

            <p className="text-sm text-text-secondary mb-6">
              Table Canvas is currently in the development stages and not yet open
              for public registration.
            </p>

            <div className="bg-surface-secondary rounded-lg p-4 mb-6">
              <p className="text-sm text-text-secondary mb-2">
                Interested in early access?
              </p>
              <p className="text-sm font-medium text-text-primary">
                Contact us at:
              </p>
              <a
                href="mailto:harshitbadam2050@gmail.com"
                className="text-accent-green hover:underline text-sm font-medium"
              >
                harshitbadam2050@gmail.com
              </a>
            </div>

            <button
              onClick={() => navigate('/login')}
              className="btn btn-secondary w-full gap-2"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 19l-7-7m0 0l7-7m-7 7h18"
                />
              </svg>
              Back to Login
            </button>
          </div>
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-text-tertiary">
          Already have an account? Go back to the login page to sign in.
        </p>
      </div>
    </div>
  );
}
