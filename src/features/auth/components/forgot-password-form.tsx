'use client'

import { useState } from 'react'
import Link from 'next/link'
import { validateEmail } from '@/lib/validation'
import { cn } from '@/utils/cn'
import { Input } from '@/components/ui/input'
import { toast } from '@/components/ui/toast'
import { AuthLayout } from '@/features/auth/components/auth-layout'

const FORM_COPY = {
  headline: 'Back in your account in minutes.',
  italicWord: 'minutes.',
  body: 'Enter your email and we will send you a secure reset link. It arrives within a minute.',
}

const SUCCESS_COPY = {
  headline: 'Check your inbox.',
  italicWord: 'inbox.',
  body: 'The reset link is on its way. It expires in 60 minutes — use it before then.',
}

interface FormPanelProps {
  email: string
  setEmail: (v: string) => void
  emailError: string | undefined
  loading: boolean
  onSubmit: (e: React.SyntheticEvent<HTMLFormElement>) => void
}

function FormPanel({ email, setEmail, emailError, loading, onSubmit }: FormPanelProps) {
  return (
    <div>
      {/* tracking: the micro role carries no letter-spacing; this back-link is opened a
          hair so the arrow does not collide with the word after it. */}
      <Link
        href="/login"
        className="text-micro inline-flex items-center gap-1.5 text-text2 no-underline tracking-[0.3px] mb-8"
      >
        ← Back to sign in
      </Link>
      <h3 className="text-headline font-display font-normal text-ink mb-1">Reset your password</h3>
      <p className="text-body text-text2 mb-8">Enter your email and we'll send you a reset link.</p>
      <form onSubmit={onSubmit} className="flex flex-col gap-0">
        <div className="mb-5">
          <Input
            label="Email"
            type="email"
            placeholder="you@agency.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={emailError}
            autoComplete="email"
            autoFocus
            labelVariant="caps"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className={cn(
            'text-label font-semibold uppercase font-sans',
            'w-full flex items-center justify-center gap-1.5 px-0 py-[13px] mt-1',
            'bg-forest-deep text-ink-inv border-none rounded-xs',
            !loading && 'hover:bg-spring-text'
          )}
          style={{
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.5 : 1,
          }}
        >
          {loading && (
            <svg
              style={{ width: 14, height: 14, animation: 'spin 1s linear infinite' }}
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                style={{ opacity: 0.25 }}
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                style={{ opacity: 0.75 }}
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
          )}
          Send reset link
        </button>
      </form>
      <div className="mt-5 p-3.5 bg-ink/5 border-l-2 border-l-spring-text rounded-r-xs">
        {/* leading: a four-line helper note at 11px opens past the micro role's 1.35,
            which is set for single-line chips rather than for a paragraph. */}
        <p className="text-micro text-text2 leading-[1.65]">
          If you don't receive an email within a few minutes, check your spam folder or make sure
          you're using the address you signed up with.
        </p>
      </div>
    </div>
  )
}

interface SuccessPanelProps {
  email: string
  onResend: () => void
}

function SuccessPanel({ email, onResend }: SuccessPanelProps) {
  return (
    <div className="text-center">
      <div className="w-14 h-14 rounded-full border-[1.5px] border-spring-text flex items-center justify-center mx-auto mb-6">
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--spring-text)"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      </div>
      <h3 className="text-headline font-display font-normal text-ink mb-2">Check your email</h3>
      {/* leading: this line sits between an icon and a boxed address, and opens past the
          body role's 1.6 to keep that vertical rhythm even. */}
      <p className="text-body text-text2 leading-[1.7] mb-2">We sent a password reset link to</p>
      <div className="text-caption inline-block bg-surface border border-ink/14 rounded-xs px-3 py-1.5 text-ink font-medium mb-7">
        {email}
      </div>
      <div className="flex items-center gap-3 mb-4">
        <div className="flex-1 h-px bg-ink/10" />
        {/* tracking: a two-letter divider label reads tighter than the label role's
            0.16em (1.6px) — at this width the role's spacing pulls "OR" apart. */}
        <span className="text-label text-text3 tracking-[1px]">OR</span>
        <div className="flex-1 h-px bg-ink/10" />
      </div>
      <p className="text-micro text-text2 mb-4">
        Didn't receive it?{' '}
        <button
          onClick={onResend}
          className="text-micro text-spring-text bg-transparent border-none cursor-pointer p-0"
        >
          Resend email
        </button>
      </p>
      <Link
        href="/login"
        className="text-micro inline-flex items-center justify-center gap-1.5 text-text2 no-underline w-full"
      >
        ← Back to sign in
      </Link>
    </div>
  )
}

export function ForgotPasswordForm() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [emailError, setEmailError] = useState<string | undefined>()

  async function sendToApi() {
    const res = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      toast.error(body.error ?? 'Something went wrong. Please try again.')
    }
    return res.ok
  }

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault()
    const err = validateEmail(email)
    if (err) {
      setEmailError(err)
      return
    }
    setEmailError(undefined)
    setLoading(true)
    const ok = await sendToApi()
    setLoading(false)
    if (ok) setSent(true)
  }

  async function handleResend() {
    setLoading(true)
    const ok = await sendToApi()
    setLoading(false)
    if (ok) toast.success('Reset email sent')
  }

  return (
    <AuthLayout staticCopy={sent ? SUCCESS_COPY : FORM_COPY}>
      {sent ? (
        <SuccessPanel email={email} onResend={handleResend} />
      ) : (
        <FormPanel
          email={email}
          setEmail={setEmail}
          emailError={emailError}
          loading={loading}
          onSubmit={handleSubmit}
        />
      )}
    </AuthLayout>
  )
}
