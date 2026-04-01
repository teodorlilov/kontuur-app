'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'

function CheckEmailContent() {
  const searchParams = useSearchParams()
  const email = searchParams.get('email')

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-10">
      <div className="w-full max-w-sm text-center">
        <div className="inline-flex items-center gap-2 mb-8">
          <div className="h-8 w-8 rounded-lg bg-brand-purple flex items-center justify-center">
            <span className="text-white text-sm font-bold">P</span>
          </div>
          <span className="text-xl font-semibold text-gray-900">PostFlow</span>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-8">
          <div className="h-12 w-12 rounded-full bg-brand-purple-light flex items-center justify-center mx-auto mb-4">
            <svg className="h-6 w-6 text-brand-purple" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
            </svg>
          </div>

          <h1 className="text-lg font-semibold text-gray-900 mb-2">Check your email</h1>
          <p className="text-sm text-gray-500">
            We sent a confirmation link to{' '}
            {email ? (
              <span className="font-medium text-gray-700">{email}</span>
            ) : (
              'your email address'
            )}
            . Click the link to activate your account.
          </p>

          <p className="text-xs text-gray-400 mt-4">
            Didn&apos;t receive it? Check your spam folder.
          </p>
        </div>

        <p className="text-center text-sm text-gray-500 mt-4">
          Already confirmed?{' '}
          <Link href="/login" className="text-brand-purple font-medium hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}

export default function CheckEmailPage() {
  return (
    <Suspense>
      <CheckEmailContent />
    </Suspense>
  )
}
