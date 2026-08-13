import type { Metadata } from 'next'
import Link from 'next/link'
import { Footer } from '@/features/marketing/components/footer'
import {
  proseBackLink,
  proseContainer,
  proseDivider,
  proseEyebrow,
  proseH1,
  proseH2,
  proseLead,
  proseList,
  proseMain,
  proseP,
} from '../legal-prose'

export const metadata: Metadata = {
  title: 'Data Deletion — Kontuur',
  description: 'Request deletion of your data from Kontuur.',
}

interface PageProps {
  searchParams: Promise<{ code?: string }>
}

export default async function DataDeletionPage({ searchParams }: PageProps) {
  const { code } = await searchParams

  return (
    <>
      <main className={proseMain}>
        <div className={proseContainer}>
          <Link className={proseBackLink} href="/">
            ← Back
          </Link>
          <p className={proseEyebrow}>Data Deletion</p>

          {code ? (
            <>
              <h1 className={proseH1}>Deletion Request Received</h1>
              <p className={proseLead}>
                Your data deletion request has been processed. All data associated with your
                Facebook or Instagram account has been removed from Kontuur&apos;s servers.
              </p>
              <div className={proseDivider} />
              <p className={proseP}>
                <strong>Confirmation code:</strong> {code}
              </p>
              <p className={proseP}>
                If you have further questions, contact us at{' '}
                <a href="mailto:privacy@kontuur.io" className="text-spring">
                  privacy@kontuur.io
                </a>{' '}
                and include this confirmation code.
              </p>
            </>
          ) : (
            <>
              <h1 className={proseH1}>Data Deletion Instructions</h1>
              <p className={proseLead}>
                You can request deletion of all data Kontuur holds about you at any time.
              </p>

              <div className={proseDivider} />

              <h2 className={proseH2}>Option 1 — Remove via Facebook Settings</h2>
              <p className={proseP}>
                If you connected your Facebook or Instagram account to Kontuur, you can revoke
                access and trigger automatic data deletion directly through Facebook:
              </p>
              <ol className={proseList}>
                <li>Go to your Facebook account settings.</li>
                <li>
                  Navigate to <strong>Security and Login</strong> &rarr;{' '}
                  <strong>Apps and Websites</strong>.
                </li>
                <li>
                  Find <strong>Kontuur</strong> in the list and click <strong>Remove</strong>.
                </li>
                <li>
                  Facebook will automatically notify Kontuur and your data will be deleted within 24
                  hours.
                </li>
              </ol>

              <h2 className={proseH2}>Option 2 — Contact Us Directly</h2>
              <p className={proseP}>
                Email us at{' '}
                <a href="mailto:privacy@kontuur.io" className="text-spring">
                  privacy@kontuur.io
                </a>{' '}
                with the subject line <strong>&quot;Data Deletion Request&quot;</strong> and include
                the email address associated with your account. We will process your request within
                30 days and send you a confirmation.
              </p>

              <h2 className={proseH2}>What We Delete</h2>
              <p className={proseP}>Upon receiving a deletion request, we remove:</p>
              <ul className={proseList}>
                <li>Your Facebook and Instagram OAuth access tokens.</li>
                <li>Your social account details (account ID, username) stored in our database.</li>
                <li>Any analytics data retrieved from your connected accounts.</li>
              </ul>
              <p className={proseP}>
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
