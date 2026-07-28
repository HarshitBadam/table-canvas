import { useEffect, useRef, useState } from 'react'

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined
const GIS_SCRIPT_URL = 'https://accounts.google.com/gsi/client'

export interface GoogleCredentialResponse {
  credential: string
  select_by: string
}

interface GoogleIdentity {
  accounts: {
    id: {
      initialize: (config: Record<string, unknown>) => void
      renderButton: (parent: HTMLElement, config: Record<string, unknown>) => void
    }
  }
}

type Status = 'unconfigured' | 'loading' | 'ready' | 'unavailable'

function readGoogleIdentity(): GoogleIdentity | undefined {
  return (window as unknown as { google?: GoogleIdentity }).google
}

interface GoogleSignInButtonProps {
  onCredential: (response: GoogleCredentialResponse) => void
  busy?: boolean
}

export function GoogleSignInButton({ onCredential, busy = false }: GoogleSignInButtonProps) {
  const [status, setStatus] = useState<Status>(
    GOOGLE_CLIENT_ID ? 'loading' : 'unconfigured',
  )
  const hostRef = useRef<HTMLDivElement>(null)
  const callbackRef = useRef(onCredential)
  callbackRef.current = onCredential

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return

    if (readGoogleIdentity()) {
      setStatus('ready')
      return
    }

    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${GIS_SCRIPT_URL}"]`,
    )
    const script = existing ?? document.createElement('script')
    const onLoad = () => setStatus(readGoogleIdentity() ? 'ready' : 'unavailable')
    const onError = () => setStatus('unavailable')

    script.addEventListener('load', onLoad)
    script.addEventListener('error', onError)

    if (!existing) {
      script.src = GIS_SCRIPT_URL
      script.async = true
      script.defer = true
      document.head.appendChild(script)
    }

    return () => {
      script.removeEventListener('load', onLoad)
      script.removeEventListener('error', onError)
    }
  }, [])

  useEffect(() => {
    const host = hostRef.current
    if (status !== 'ready' || !host) return
    const identity = readGoogleIdentity()
    if (!identity) return

    identity.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: (response: GoogleCredentialResponse) => callbackRef.current(response),
      use_fedcm_for_button: true,
    })

    // The rendered iframe is sized once, so it has to be re-rendered whenever the
    // panel width changes; otherwise the invisible click target drifts off the face.
    let renderedWidth = 0
    const draw = () => {
      const width = Math.round(host.offsetWidth)
      if (width === 0 || width === renderedWidth) return
      renderedWidth = width
      host.innerHTML = ''
      identity.accounts.id.renderButton(host, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        shape: 'rectangular',
        text: 'continue_with',
        logo_alignment: 'center',
        width,
      })
    }

    draw()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(draw)
    observer?.observe(host)
    return () => {
      observer?.disconnect()
      host.innerHTML = ''
    }
  }, [status])

  if (status === 'loading') {
    return (
      <div className="auth-skeleton" role="status" aria-label="Loading Google sign-in" />
    )
  }

  if (status !== 'ready') {
    return (
      <>
        <button type="button" className="auth-action" disabled>
          <GoogleGlyph />
          Continue with Google
        </button>
        <p className="login-note" role="status">
          {status === 'unconfigured'
            ? 'Google sign-in is not available in this environment.'
            : 'Google sign-in could not load. Check your connection, or continue as a guest.'}
        </p>
      </>
    )
  }

  return (
    <div className="auth-google" data-busy={busy || undefined}>
      <div className="auth-action" aria-hidden="true">
        <GoogleGlyph />
        Continue with Google
      </div>
      <div ref={hostRef} className="auth-google-host" />
    </div>
  )
}

function GoogleGlyph() {
  return (
    <svg className="auth-action-icon" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.02-3.7H.96v2.34A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.98 10.72a5.4 5.4 0 0 1 0-3.44V4.94H.96a9 9 0 0 0 0 8.12l3.02-2.34Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.46 3.44 1.35l2.58-2.58C13.46.89 11.42 0 9 0A9 9 0 0 0 .96 4.94l3.02 2.34C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  )
}
