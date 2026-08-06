'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'
import { validateEmail, validatePassword } from '@/lib/validation'
import { cn } from '@/utils/cn'
import { Input } from '@/components/ui/input'
import { toast } from '@/components/ui/toast'
import { AuthLayout } from '@/features/auth/components/auth-layout'

type Mode = 'agency' | 'solo'

interface FormErrors {
  email?: string
  password?: string
  businessName?: string
}

interface ModeSelectorProps {
  mode: Mode
  setMode: (m: Mode) => void
}

function ModeSelector({ mode, setMode }: ModeSelectorProps) {
  const options = [
    {
      value: 'agency' as Mode,
      label: 'I manage social media for clients',
      sub: 'Agency mode — manage multiple clients',
    },
    {
      value: 'solo' as Mode,
      label: 'I manage my own business socials',
      sub: 'Solo mode — simplified for one brand',
    },
  ]
  return (
    <div className="flex flex-col gap-2">
      {/* tracking: a 10px caps question spaced wider than the label role's 0.16em (1.6px),
          so it reads as a section header rather than as a field label. */}
      <p className="text-label font-medium text-ink tracking-[2px] uppercase">
        How will you use kontuur?
      </p>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => setMode(opt.value)}
          className={cn(
            'text-left px-3.5 py-3 rounded-xs border bg-surface cursor-pointer',
            mode === opt.value ? 'border-forest-deep' : 'border-ink/14 hover:border-spring-text'
          )}
          style={{ transition: 'border-color 0.15s' }}
        >
          <span className="text-body font-medium text-ink block">{opt.label}</span>
          <span className="text-caption text-text2 mt-0.5 block">{opt.sub}</span>
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
        <h3 className="text-headline font-display font-normal text-ink mb-1">
          Create your account
        </h3>
        <p className="text-body text-text2 mb-8">14-day free trial, no card required</p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input
            label="Business name"
            type="text"
            placeholder="Acme Agency"
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            error={errors.businessName}
            autoComplete="organization"
            labelVariant="caps"
          />
          <Input
            label="Email"
            type="email"
            placeholder="you@agency.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={errors.email}
            autoComplete="email"
            labelVariant="caps"
          />
          <Input
            label="Password"
            type="password"
            placeholder="Min. 10 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={errors.password}
            autoComplete="new-password"
            labelVariant="caps"
          />
          <ModeSelector mode={mode} setMode={setMode} />
          <button
            type="submit"
            disabled={loading}
            className={cn(
              'text-label font-semibold uppercase font-sans',
              'w-full flex items-center justify-center gap-1.5 px-0 py-[13px] mt-2',
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
            Create account
          </button>
        </form>
        <p className="text-caption text-center text-text2 mt-5">
          Already have an account?{' '}
          <Link href="/login" className="text-spring-text no-underline">
            Sign in
          </Link>
        </p>
      </div>
    </AuthLayout>
  )
}
