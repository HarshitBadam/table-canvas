import type { ReactNode } from 'react'

export const legalContactEmail = 'table.canvas.support@gmail.com'

export function TermsContent() {
  return (
    <>
      <p>
        These Terms govern your use of Table Canvas. By continuing with Google or
        starting a guest session, you agree to them.
      </p>
      <LegalSection title="Using Table Canvas">
        You may use Table Canvas to create, transform, and explore tabular data.
        Keep your account credentials secure and use the product only for lawful
        purposes. Do not attempt to disrupt the service or access another person’s
        data without permission.
      </LegalSection>
      <LegalSection title="Your data">
        You retain ownership of the data and projects you create. Guest projects
        stay in this browser. When you sign in with Google, projects may be
        synchronized to your account so that you can access them across sessions.
      </LegalSection>
      <LegalSection title="Service availability">
        Table Canvas is provided as available. We may change, pause, or discontinue
        parts of the product as it evolves. You are responsible for exporting any
        data you need to retain independently.
      </LegalSection>
      <LegalSection title="Changes and contact">
        We may update these Terms as the product changes. Continued use after an
        update means you accept the revised Terms. For questions, email{' '}
        <LegalContactLink />.
      </LegalSection>
    </>
  )
}

export function PrivacyContent() {
  return (
    <>
      <p>
        This policy explains how Table Canvas handles information when you use the
        product.
      </p>
      <LegalSection title="Information we receive">
        If you sign in with Google, we receive the identity information Google
        provides for your account: your name, email address, Google account ID, and
        profile image when available. We also store the projects and data you choose
        to synchronize.
      </LegalSection>
      <LegalSection title="Guest sessions">
        Guest projects are stored locally in your browser. They are not uploaded
        for synchronization unless you later sign in and choose to use an account.
      </LegalSection>
      <LegalSection title="How we use information">
        We use account information to authenticate you and keep your projects
        associated with your account. We use project data to provide the workspace,
        synchronization, and export features you request. We do not sell, rent, or
        license your personal or project data, and we do not use it for advertising,
        marketing, or AI model training. We use it only to operate, secure, support,
        and maintain Table Canvas.
      </LegalSection>
      <LegalSection title="Cookies and service providers">
        We use secure authentication cookies to keep signed-in sessions active.
        Google processes your sign-in according to its own privacy policy. If error
        reporting is enabled, limited technical error details may be sent to Sentry;
        request bodies, cookies, headers, and IP addresses are excluded from those
        reports.
      </LegalSection>
      <LegalSection title="Questions">
        To ask about this policy or your account data, email <LegalContactLink />.
      </LegalSection>
    </>
  )
}

function LegalContactLink() {
  return (
    <a
      className="text-accent-text underline decoration-border underline-offset-4 transition-colors hover:decoration-current"
      href={`mailto:${legalContactEmail}`}
    >
      {legalContactEmail}
    </a>
  )
}

function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-5">
      <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
      <p className="mt-1.5">{children}</p>
    </section>
  )
}
