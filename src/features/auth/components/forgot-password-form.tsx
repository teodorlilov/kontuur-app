'use client'

import { useState } from 'react'
import Link from 'next/link'
import { validateEmail } from '@/lib/validation'
import { Input } from '@/components/ui/input'
import { toast } from '@/components/ui/toast'
import { AuthLayout } from '@/components/auth/auth-layout'

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

const INPUT_STYLE: React.CSSProperties = {
  background: '#fff',
  border: '1px solid rgba(44,62,80,0.14)',
  borderRadius: 4,
  padding: '12px 14px',
  fontSize: 13,
  height: 'auto',
  color: '#1A2630',
}

const LABEL_STYLE: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 500,
  color: '#1A2630',
  letterSpacing: '2px',
  textTransform: 'uppercase',
}

function onFocus(e: React.FocusEvent<HTMLInputElement>) {
  e.currentTarget.style.borderColor = '#C07B55'
}

function onBlur(e: React.FocusEvent<HTMLInputElement>) {
  e.currentTarget.style.borderColor = 'rgba(44,62,80,0.14)'
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
      <Link href="/login" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#8A8070', textDecoration: 'none', letterSpacing: '0.3px', marginBottom: 32 }}>
        ← Back to sign in
      </Link>
      <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 400, color: '#1A2630', marginBottom: 4 }}>
        Reset your password
      </h3>
      <p style={{ fontSize: 13, color: '#8A8070', marginBottom: 32, lineHeight: 1.6 }}>
        Enter your email and we'll send you a reset link.
      </p>
      <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        <div style={{ marginBottom: 20 }}>
          <Input
            label="Email"
            type="email"
            placeholder="you@agency.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={emailError}
            autoComplete="email"
            autoFocus
            style={INPUT_STYLE}
            labelStyle={LABEL_STYLE}
            onFocus={onFocus}
            onBlur={onBlur}
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '13px 0', background: '#1A2630', color: '#ECE8E1', fontFamily: 'var(--font-sans)', fontSize: 10, fontWeight: 800, letterSpacing: '2.5px', textTransform: 'uppercase', border: 'none', borderRadius: 4, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.5 : 1, marginTop: 4 }}
          onMouseEnter={(e) => { if (!loading) e.currentTarget.style.background = '#C07B55' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = '#1A2630' }}
        >
          {loading && (
            <svg style={{ width: 14, height: 14, animation: 'spin 1s linear infinite' }} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}
          Send reset link
        </button>
      </form>
      <div style={{ marginTop: 20, padding: 14, background: 'rgba(44,62,80,0.05)', borderLeft: '2px solid #C07B55', borderRadius: '0 4px 4px 0' }}>
        <p style={{ fontSize: 11, color: '#8A8070', lineHeight: 1.65 }}>
          If you don't receive an email within a few minutes, check your spam folder or make sure you're using the address you signed up with.
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
    <div style={{ textAlign: 'center' }}>
      <div style={{ width: 56, height: 56, borderRadius: '50%', border: '1.5px solid #C07B55', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#C07B55" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      </div>
      <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 400, color: '#1A2630', marginBottom: 8 }}>
        Check your email
      </h3>
      <p style={{ fontSize: 13, color: '#8A8070', lineHeight: 1.7, marginBottom: 8 }}>
        We sent a password reset link to
      </p>
      <div style={{ display: 'inline-block', background: '#ffffff', border: '1px solid rgba(44,62,80,0.14)', borderRadius: 4, padding: '6px 12px', fontSize: 12, color: '#1A2630', fontWeight: 500, marginBottom: 28 }}>
        {email}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <div style={{ flex: 1, height: 1, background: 'rgba(44,62,80,0.1)' }} />
        <span style={{ fontSize: 10, color: '#B4A898', letterSpacing: '1px' }}>OR</span>
        <div style={{ flex: 1, height: 1, background: 'rgba(44,62,80,0.1)' }} />
      </div>
      <p style={{ fontSize: 11, color: '#8A8070', marginBottom: 16 }}>
        Didn't receive it?{' '}
        <button onClick={onResend} style={{ color: '#C07B55', background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, padding: 0 }}>
          Resend email
        </button>
      </p>
      <Link href="/login" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 11, color: '#8A8070', textDecoration: 'none', width: '100%' }}>
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
      const body = await res.json().catch(() => ({})) as { error?: string }
      toast.error(body.error ?? 'Something went wrong. Please try again.')
    }
    return res.ok
  }

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault()
    const err = validateEmail(email)
    if (err) { setEmailError(err); return }
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
      {sent
        ? <SuccessPanel email={email} onResend={handleResend} />
        : <FormPanel email={email} setEmail={setEmail} emailError={emailError} loading={loading} onSubmit={handleSubmit} />
      }
    </AuthLayout>
  )
}
