import type { Metadata } from 'next'
import Link from 'next/link'
import { ContourField } from '@/components/layout/contour-field'
import { buttonClasses } from '@/components/ui/button'
import { GoodbyeSignOut } from '@/features/auth/components/goodbye-sign-out'
import { Footer } from '@/features/marketing/components/footer'
import { SIGN_UP_PATH } from '@/utils/constants'
import {
  proseContainer,
  proseDivider,
  proseEyebrow,
  proseH1,
  proseLead,
  proseMain,
  proseP,
} from '../legal-prose'

export const metadata: Metadata = {
  title: 'Workspace deleted — Kontuur',
  description: 'Your Kontuur workspace has been permanently deleted.',
  robots: { index: false },
}

/**
 * Where a person lands after deleting their workspace (`GOODBYE_PATH`): the legal pages' prose
 * on the contour ground, and the two ways on. Public — the session ends on arrival
 * (`GoodbyeSignOut`), so nothing here may read who the person was.
 */
export default function GoodbyePage() {
  return (
    <>
      <GoodbyeSignOut />
      <main className={`${proseMain} relative overflow-hidden`}>
        <ContourField />
        <div className={`${proseContainer} relative z-10`}>
          <p className={proseEyebrow}>Workspace deleted</p>
          <h1 className={proseH1}>Your workspace is gone</h1>
          <p className={proseLead}>
            Every client, post, image, connected account and member account has been permanently
            deleted, together with the Instagram and Facebook history that was synced for them.
            Nothing of it remains on Kontuur&apos;s servers.
          </p>

          <div className={proseDivider} />

          <p className={proseP}>
            Invoices already issued are kept for ten years, as Bulgarian law requires. Each one was
            emailed to you with its PDF attached at the time it was paid. Nothing else about the
            workspace is retained.
          </p>
          <p className={proseP}>Want to start again? A new workspace begins with a fresh trial.</p>
          <div className="mt-2 flex flex-wrap gap-3">
            <Link href={SIGN_UP_PATH} className={buttonClasses({ variant: 'primary', size: 'md' })}>
              Create a new workspace
            </Link>
            <Link href="/" className={buttonClasses({ variant: 'secondary', size: 'md' })}>
              Back to kontuur.app
            </Link>
          </div>
        </div>
      </main>
      <Footer />
    </>
  )
}
