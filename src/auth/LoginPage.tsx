import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '@/state/AppContext'
import { ApiError } from '@/api/client'
import { LoadingSpinner } from '@/layout/LoadingSpinner'
import { BrandMark } from '@/components/BrandMark'
import { LegalDocumentsDialog } from './LegalDocumentsDialog'
import { GoogleSignInButton, type GoogleCredentialResponse } from './GoogleSignInButton'

export function LoginPage() {
  const [pendingMethod, setPendingMethod] = useState<'google' | 'guest' | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [legalDocument, setLegalDocument] = useState<'terms' | 'privacy' | null>(null)

  const { googleLogin, continueAsGuest } = useApp()
  const navigate = useNavigate()

  const handleError = useCallback((err: unknown) => {
    if (err instanceof ApiError) {
      if (err.statusCode === 401) {
        setFormError('That sign-in was not accepted. Try again with your Google account.')
      } else if (err.statusCode === 403) {
        setFormError('This account does not have access to Table Canvas.')
      } else if (err.statusCode === 429) {
        setFormError('Too many sign-in attempts. Wait a few minutes, then try again.')
      } else if (err.statusCode >= 500) {
        setFormError('Table Canvas could not sign you in right now. Nothing was lost; please try again.')
      } else if (err.errors && err.errors.length > 0) {
        setFormError(err.errors.join('. '))
      } else {
        setFormError(err.message)
      }
    } else if (err instanceof TypeError) {
      setFormError('Cannot reach Table Canvas. Check your connection and try again.')
    } else if (err instanceof Error && err.message) {
      setFormError('Sign-in failed. Check your connection and try again.')
    } else {
      setFormError('Sign-in failed unexpectedly. Please try again.')
    }
  }, [])

  const runSignIn = useCallback(
    async (method: 'google' | 'guest', enter: () => Promise<unknown>) => {
      setFormError(null)
      setPendingMethod(method)
      try {
        await enter()
        navigate('/', { replace: true })
      } catch (err) {
        handleError(err)
      } finally {
        setPendingMethod(null)
      }
    },
    [navigate, handleError],
  )

  const handleGoogleCredential = useCallback(
    (response: GoogleCredentialResponse) => {
      void runSignIn('google', () => googleLogin(response.credential))
    },
    [runSignIn, googleLogin],
  )

  return (
    <div className="login-shell">
      <main className="login-stack">
        <div className="login-brand">
          <span className="login-mark-frame">
            <BrandMark className="login-mark" />
          </span>
          Table Canvas
        </div>

        <section className="login-panel" aria-labelledby="login-title">
          <h1 id="login-title" className="login-title">Sign in</h1>
          <p className="login-subtitle">
            Sync your projects across devices, or keep working locally in this browser.
          </p>

          {formError && (
            <div role="alert" className="login-alert">
              {formError}
            </div>
          )}

          <div className="login-actions">
            <div className="auth-choices">
              <GoogleSignInButton
                onCredential={handleGoogleCredential}
                busy={pendingMethod !== null}
              />
              <div className="auth-divider" aria-hidden="true">or</div>
              <button
                type="button"
                className="auth-action"
                disabled={pendingMethod !== null}
                onClick={() => void runSignIn('guest', continueAsGuest)}
              >
                {pendingMethod === 'guest' ? (
                  <>
                    <LoadingSpinner size="sm" />
                    Opening…
                  </>
                ) : (
                  <>
                    <svg
                      className="auth-action-icon"
                      viewBox="0 0 18 18"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      aria-hidden="true"
                    >
                      <rect x="2.5" y="3" width="13" height="10" rx="2" />
                      <path d="M6.5 15h5M9 13v2" />
                    </svg>
                    Continue as guest
                  </>
                )}
              </button>
            </div>
            <p className="login-note">
              Sign in to sync projects. Guest work stays on this device.
            </p>
          </div>
        </section>

        <p className="login-legal">
          By continuing, you agree to our{' '}
          <button
            type="button"
            className="login-legal-link"
            onClick={() => setLegalDocument('terms')}
          >
            Terms of Service
          </button>{' '}
          and{' '}
          <button
            type="button"
            className="login-legal-link"
            onClick={() => setLegalDocument('privacy')}
          >
            Privacy Policy
          </button>
          .
        </p>
      </main>

      <LegalDocumentsDialog
        document={legalDocument}
        onOpenChange={(open) => !open && setLegalDocument(null)}
      />
    </div>
  )
}
