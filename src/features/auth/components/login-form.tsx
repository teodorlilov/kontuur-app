'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'
import { validateEmail } from '@/lib/validation'
import { Input } from '@/components/ui/input'
import { toast } from '@/components/ui/toast'
import { AuthLayout } from '@/features/auth/components/auth-layout'

const INPUT_STYLE: React.CSSProperties = {
  background: '#fff',
  border: '1px solid rgba(44,62,80,0.14)',
  borderRadius: 4,
  padding: '12px 14px',
  fontSize: 13,
  height: 'auto',
}

const LABEL_STYLE: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 500,
  color: '#1A2630',
  letterSpacing: '2px',
  textTransform: 'uppercase',
}

function onLoginFocus(hasError: boolean) {
  return (e: React.FocusEvent<HTMLInputElement>) => {
    if (!hasError) e.currentTarget.style.borderColor = '#C07B55'
  }
}

function onLoginBlur(hasError: boolean) {
  return (e: React.FocusEvent<HTMLInputElement>) => {
    if (!hasError) e.currentTarget.style.borderColor = 'rgba(44,62,80,0.14)'
  }
}

interface LoginFormPanelProps {
  email: string
  setEmail: (v: string) => void
  password: string
  setPassword: (v: string) => void
  errors: { email?: string; password?: string }
  loading: boolean
  onSubmit: (e: React.SyntheticEvent<HTMLFormElement>) => void
}

function LoginFormPanel({ email, setEmail, password, setPassword, errors, loading, onSubmit }: LoginFormPanelProps) {
  return (
    <div>
      <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 400, color: '#1A2630', marginBottom: 6 }}>
        Welcome back
      </h3>
      <p style={{ fontSize: 13, color: '#8A8070', marginBottom: 32 }}>Sign in to your account</p>
      <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        <div style={{ marginBottom: 18 }}>
          <Input
            label="Email"
            type="email"
            placeholder="you@agency.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={errors.email}
            autoComplete="email"
            style={INPUT_STYLE}
            labelStyle={LABEL_STYLE}
            onFocus={onLoginFocus(!!errors.email)}
            onBlur={onLoginBlur(!!errors.email)}
          />
        </div>
        <div style={{ marginBottom: 6 }}>
          <Input
            label="Password"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={errors.password}
            autoComplete="current-password"
            style={INPUT_STYLE}
            labelStyle={LABEL_STYLE}
            onFocus={onLoginFocus(!!errors.password)}
            onBlur={onLoginBlur(!!errors.password)}
          />
        </div>
        <div style={{ textAlign: 'right', marginBottom: 18 }}>
          <Link href="/forgot-password" style={{ fontSize: 11, color: '#7A7060', textDecoration: 'none' }}>
            Forgot password?
          </Link>
        </div>
        <button
          type="submit"
          disabled={loading}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            padding: '13px 0',
            background: '#1A2630',
            color: '#ECE8E1',
            fontFamily: 'var(--font-sans)',
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: '2.5px',
            textTransform: 'uppercase',
            border: 'none',
            borderRadius: 4,
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.5 : 1,
            marginTop: 8,
          }}
          onMouseEnter={(e) => { if (!loading) e.currentTarget.style.background = '#C07B55' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = '#1A2630' }}
        >
          {loading && (
            <svg style={{ width: 14, height: 14, animation: 'spin 1s linear infinite' }} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}
          Sign in
        </button>
      </form>
      <p style={{ textAlign: 'center', fontSize: 12, color: '#7A7060', marginTop: 20 }}>
        No account?{' '}
        <Link href="/signup" style={{ color: '#C07B55', textDecoration: 'none' }}>
          Sign up
        </Link>
      </p>
    </div>
  )
}

export function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({})

  function validate() {
    const next: typeof errors = {}
    const emailError = validateEmail(email)
    if (emailError) next.email = emailError
    if (!password) next.password = 'Password is required'
    return next
  }

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length > 0) {
      setErrors(errs)
      return
    }
    setErrors({})
    setLoading(true)

    const supabase = createBrowserSupabaseClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      toast.error(error.message)
      setLoading(false)
      return
    }

    window.location.href = '/dashboard'
  }

  return (
    <AuthLayout>
      <LoginFormPanel
        email={email}
        setEmail={setEmail}
        password={password}
        setPassword={setPassword}
        errors={errors}
        loading={loading}
        onSubmit={handleSubmit}
      />
    </AuthLayout>
  )
}
