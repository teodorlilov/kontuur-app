'use client'

import { useState } from 'react'
import Link from 'next/link'
import { validateEmail } from '@/lib/validation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from '@/components/ui/toast'
import { KontuurLogo } from '@/components/ui/kontuur-logo'

export function ForgotPasswordForm() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [emailError, setEmailError] = useState<string | undefined>()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const err = validateEmail(email)
    if (err) {
      setEmailError(err)
      return
    }
    setEmailError(undefined)
    setLoading(true)

    const res = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      toast.error(body.error ?? 'Something went wrong. Please try again.')
      setLoading(false)
      return
    }

    setSent(true)
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="inline-flex mb-6">
            <KontuurLogo />
          </div>
          <h1 className="text-xl font-semibold text-gray-900">Reset your password</h1>
          <p className="text-sm text-gray-500 mt-1">
            {sent
              ? 'Check your email for a reset link'
              : "Enter your email and we'll send you a reset link"}
          </p>
        </div>

        {sent ? (
          <div className="bg-white rounded-xl border border-gray-200 p-6 text-center">
            <p className="text-sm text-gray-600 mb-4">
              We sent a password reset link to <span className="font-medium">{email}</span>.
            </p>
            <Link href="/login" className="text-sm text-brand-purple font-medium hover:underline">
              Back to sign in
            </Link>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="bg-white rounded-xl border border-gray-200 p-6 flex flex-col gap-4"
          >
            <Input
              label="Email"
              type="email"
              placeholder="you@agency.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              error={emailError}
              autoComplete="email"
              autoFocus
            />
            <Button type="submit" loading={loading} className="w-full mt-1">
              Send reset link
            </Button>
          </form>
        )}

        {!sent && (
          <p className="text-center text-sm text-gray-500 mt-4">
            <Link href="/login" className="text-brand-purple font-medium hover:underline">
              Back to sign in
            </Link>
          </p>
        )}
      </div>
    </div>
  )
}
