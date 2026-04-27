import type { Metadata } from 'next'
import Link from 'next/link'
import { Footer } from '@/features/marketing/components/Footer'

export const metadata: Metadata = {
  title: 'Data Deletion — Kontuur',
  description: 'Request deletion of your data from Kontuur.',
}

const h1Style: React.CSSProperties = {
  fontFamily: 'var(--font-playfair)',
  fontSize: 40,
  fontWeight: 700,
  color: 'var(--color-text-1)',
  marginBottom: 8,
  lineHeight: 1.2,
}

const h2Style: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 600,
  color: 'var(--color-text-1)',
  marginTop: 48,
  marginBottom: 12,
}

const pStyle: React.CSSProperties = {
  fontSize: 15,
  color: 'var(--color-text-2)',
  lineHeight: 1.75,
  marginBottom: 16,
}

const dividerStyle: React.CSSProperties = {
  borderTop: '1px solid var(--color-border-1)',
  marginTop: 48,
  marginBottom: 48,
}

interface PageProps {
  searchParams: Promise<{ code?: string }>
}

export default async function DataDeletionPage({ searchParams }: PageProps) {
  const { code } = await searchParams

  return (
    <>
      <main style={{ background: 'var(--color-page)', minHeight: '100vh' }}>
        <div style={{ maxWidth: 720, margin: '0 auto', padding: '80px 24px 100px' }}>
          <Link
            href="/"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 14,
              color: 'var(--color-text-3)',
              textDecoration: 'none',
              marginBottom: 48,
            }}
          >
            ← Back
          </Link>
          <p style={{ fontSize: 13, color: 'var(--color-text-3)', marginBottom: 16 }}>
            Data Deletion
          </p>

          {code ? (
            <>
              <h1 style={h1Style}>Deletion Request Received</h1>
              <p style={{ ...pStyle, fontSize: 16, marginTop: 16 }}>
                Your data deletion request has been processed. All data associated with your
                Facebook or Instagram account has been removed from Kontuur&apos;s servers.
              </p>
              <div style={dividerStyle} />
              <p style={pStyle}>
                <strong>Confirmation code:</strong> {code}
              </p>
              <p style={pStyle}>
                If you have further questions, contact us at{' '}
                <a href="mailto:privacy@kontuur.io" style={{ color: 'var(--color-brand-accent)' }}>
                  privacy@kontuur.io
                </a>{' '}
                and include this confirmation code.
              </p>
            </>
          ) : (
            <>
              <h1 style={h1Style}>Data Deletion Instructions</h1>
              <p style={{ ...pStyle, fontSize: 16, marginTop: 16 }}>
                You can request deletion of all data Kontuur holds about you at any time.
              </p>

              <div style={dividerStyle} />

              <h2 style={h2Style}>Option 1 — Remove via Facebook Settings</h2>
              <p style={pStyle}>
                If you connected your Facebook or Instagram account to Kontuur, you can revoke
                access and trigger automatic data deletion directly through Facebook:
              </p>
              <ol style={{ ...pStyle, paddingLeft: 20 }}>
                <li>Go to your Facebook account settings.</li>
                <li>
                  Navigate to <strong>Security and Login</strong> &rarr;{' '}
                  <strong>Apps and Websites</strong>.
                </li>
                <li>Find <strong>Kontuur</strong> in the list and click <strong>Remove</strong>.</li>
                <li>
                  Facebook will automatically notify Kontuur and your data will be deleted within
                  24 hours.
                </li>
              </ol>

              <h2 style={h2Style}>Option 2 — Contact Us Directly</h2>
              <p style={pStyle}>
                Email us at{' '}
                <a href="mailto:privacy@kontuur.io" style={{ color: 'var(--color-brand-accent)' }}>
                  privacy@kontuur.io
                </a>{' '}
                with the subject line <strong>&quot;Data Deletion Request&quot;</strong> and
                include the email address associated with your account. We will process your
                request within 30 days and send you a confirmation.
              </p>

              <h2 style={h2Style}>What We Delete</h2>
              <p style={pStyle}>Upon receiving a deletion request, we remove:</p>
              <ul style={{ ...pStyle, paddingLeft: 20 }}>
                <li>Your Facebook and Instagram OAuth access tokens.</li>
                <li>Your social account details (account ID, username) stored in our database.</li>
                <li>Any analytics data retrieved from your connected accounts.</li>
              </ul>
              <p style={pStyle}>
                Content you created within Kontuur (post drafts, captions) may be retained as part
                of your agency&apos;s account unless you also request full account deletion.
              </p>
            </>
          )}
        </div>
      </main>
      <Footer />
    </>
  )
}
