'use client'

import { Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Mail } from 'lucide-react'
import { AuthPanel } from '@/features/auth/components/auth-panel'

/**
 * Where sign-up lands when the Supabase project has email confirmation on.
 *
 * Still a real route rather than a dialog view: sign-up navigates here, and the
 * visitor's next move is in their inbox, not on this page. It borrows the
 * dialog's own panel so the two read as one surface.
 */
function CheckEmailContent() {
  const email = useSearchParams().get('email')

  return (
    <main className="flex min-h-screen items-center justify-center bg-paper px-5 py-12">
      <div className="w-full max-w-[432px] rounded-card border border-line bg-surface p-8 md:p-9">
        <AuthPanel
          title="Check your email"
          description={
            <>
              We sent a confirmation link to{' '}
              {email ? (
                <span className="font-medium text-ink">{email}</span>
              ) : (
                'your email address'
              )}
              . Click it to activate your account.
            </>
          }
        >
          <div className="flex flex-col items-center gap-6">
            <span className="grid size-12 place-items-center rounded-full bg-wash text-forest">
              <Mail size={22} strokeWidth={1.6} aria-hidden />
            </span>
            <p className="text-center text-caption text-text3">
              Didn&apos;t receive it? Check your spam folder.
            </p>
            <p className="text-center text-caption text-text2">
              Already confirmed?{' '}
              <Link
                href="/?auth=signin"
                className="font-medium text-spring-text underline-offset-4 hover:underline"
              >
                Sign in
              </Link>
            </p>
          </div>
        </AuthPanel>
      </div>
    </main>
  )
}

export default function CheckEmailPage() {
  return (
    <Suspense>
      <CheckEmailContent />
    </Suspense>
  )
}
