'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'
import { validateEmail, validatePassword } from '@/lib/validation'
import { Input } from '@/components/ui/input'
import { toast } from '@/components/ui/toast'
import { AuthLayout } from '@/components/auth/auth-layout'

type Mode = 'agency' | 'solo'

interface FormErrors {
  email?: string
  password?: string
  businessName?: string
}

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

function onFocus(e: React.FocusEvent<HTMLInputElement>) {
  e.currentTarget.style.borderColor = '#C07B55'
}

function onBlur(e: React.FocusEvent<HTMLInputElement>) {
  e.currentTarget.style.borderColor = 'rgba(44,62,80,0.14)'
}

interface ModeSelectorProps {
  mode: Mode
  setMode: (m: Mode) => void
}

function ModeSelector({ mode, setMode }: ModeSelectorProps) {
  const options = [
    { value: 'agency' as Mode, label: 'I manage social media for clients', sub: 'Agency mode — manage multiple clients' },
    { value: 'solo' as Mode, label: 'I manage my own business socials', sub: 'Solo mode — simplified for one brand' },
  ]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <p style={{ fontSize: 10, fontWeight: 500, color: '#1A2630', letterSpacing: '2px', textTransform: 'uppercase' }}>
        How will you use kontuur?
      </p>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => setMode(opt.value)}
          style={{
            textAlign: 'left',
            padding: '12px 14px',
            borderRadius: 4,
            border: mode === opt.value ? '1px solid #1A2630' : '1px solid rgba(44,62,80,0.14)',
            background: '#fff',
            cursor: 'pointer',
            transition: 'border-color 0.15s',
          }}
          onMouseEnter={(e) => { if (mode !== opt.value) e.currentTarget.style.borderColor = '#C07B55' }}
          onMouseLeave={(e) => { if (mode !== opt.value) e.currentTarget.style.borderColor = 'rgba(44,62,80,0.14)' }}
        >
          <span style={{ fontSize: 13, fontWeight: 500, color: '#1A2630', display: 'block' }}>{opt.label}</span>
          <span style={{ fontSize: 12, color: '#8A8070', marginTop: 2, display: 'block' }}>{opt.sub}</span>
        </button>
      ))}
    </div>
  )
}

export function SignupForm() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [mode, setMode] = useState<Mode>('agency')
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<FormErrors>({})

  function validate() {
    const next: FormErrors = {}
    const emailError = validateEmail(email)
    if (emailError) next.email = emailError
    const passwordError = validatePassword(password)
    if (passwordError) next.password = passwordError
    if (!businessName) next.businessName = 'Business name is required'
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

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { businessName, mode },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    if (authError || !authData.user) {
      toast.error(authError?.message ?? 'Failed to create account')
      setLoading(false)
      return
    }

    if (!authData.session) {
      router.push(`/signup/check-email?email=${encodeURIComponent(email)}`)
      return
    }

    const res = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ businessName, mode }),
    })

    if (!res.ok) {
      const data = (await res.json()) as { error?: string }
      toast.error(data.error ?? 'Failed to set up account')
      setLoading(false)
      return
    }

    router.push('/dashboard')
    router.refresh()
  }

  return (
    <AuthLayout>
      <div>
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 400, color: '#1A2630', marginBottom: 4 }}>
          Create your account
        </h3>
        <p style={{ fontSize: 13, color: '#8A8070', marginBottom: 32 }}>14-day free trial, no card required</p>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Input
            label="Business name"
            type="text"
            placeholder="Acme Agency"
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            error={errors.businessName}
            autoComplete="organization"
            style={INPUT_STYLE}
            labelStyle={LABEL_STYLE}
            onFocus={onFocus}
            onBlur={onBlur}
          />
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
            onFocus={onFocus}
            onBlur={onBlur}
          />
          <Input
            label="Password"
            type="password"
            placeholder="Min. 10 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={errors.password}
            autoComplete="new-password"
            style={INPUT_STYLE}
            labelStyle={LABEL_STYLE}
            onFocus={onFocus}
            onBlur={onBlur}
          />
          <ModeSelector mode={mode} setMode={setMode} />
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
            Create account
          </button>
        </form>
        <p style={{ textAlign: 'center', fontSize: 12, color: '#7A7060', marginTop: 20 }}>
          Already have an account?{' '}
          <Link href="/login" style={{ color: '#C07B55', textDecoration: 'none' }}>
            Sign in
          </Link>
        </p>
      </div>
    </AuthLayout>
  )
}
