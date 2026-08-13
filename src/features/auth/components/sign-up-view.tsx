'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'
import { validateEmail, validatePassword } from '@/lib/validation'
import { cn } from '@/utils/cn'
import { useAuthDialog } from './auth-dialog-provider'
import { AuthFormError, AuthLink, AuthPanel, FIELD_SURFACE } from './auth-panel'
import { SignUpBenefitsPanel } from './sign-up-benefits-panel'
import { useAuthForm } from './use-auth-form'

type Mode = 'agency' | 'solo'
type Field = 'businessName' | 'email' | 'password'

const MODES = [
  {
    value: 'agency',
    label: 'I manage social media for clients',
    sub: 'Agency — many brands, one calendar',
  },
  {
    value: 'solo',
    label: 'I manage my own business socials',
    sub: 'Solo — simplified for one brand',
  },
] as const satisfies readonly { value: Mode; label: string; sub: string }[]

interface ModeSelectorProps {
  mode: Mode
  onChange: (mode: Mode) => void
}

/**
 * Agency or solo. Not in the mock, and not optional either: it decides whether
 * signup provisions a client, a brand profile and a posting schedule alongside
 * the agency, so asking later would mean a second onboarding step.
 */
function ModeSelector({ mode, onChange }: ModeSelectorProps) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-caption font-medium text-ink">How will you use Kontuur?</legend>
      {MODES.map((option) => {
        const selected = mode === option.value
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              'rounded-md border px-3.5 py-2.5 text-left transition-colors duration-150 ease-contour',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-spring',
              selected ? 'border-forest bg-wash' : 'border-line2 bg-surface hover:border-text3/45'
            )}
          >
            <span className="block text-body font-medium text-ink">{option.label}</span>
            <span className="mt-0.5 block text-caption text-text2">{option.sub}</span>
          </button>
        )
      })}
    </fieldset>
  )
}

export function SignUpView() {
  const router = useRouter()
  const { open } = useAuthDialog()
  const [businessName, setBusinessName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<Mode>('agency')
  const {
    formRef,
    errors,
    formError,
    submitting,
    setSubmitting,
    setFormError,
    checkFields,
    rejectWith,
  } = useAuthForm<Field>()

  const filled = [businessName, email, password].filter(Boolean).length

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const next: Partial<Record<Field, string>> = {}
    if (!businessName) next.businessName = 'Business name is required'
    const emailError = validateEmail(email)
    if (emailError) next.email = emailError
    const passwordError = validatePassword(password)
    if (passwordError) next.password = passwordError
    if (!checkFields(next)) return

    setSubmitting(true)
    setFormError(null)

    const supabase = createBrowserSupabaseClient()
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { businessName, mode },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    if (error || !data.user) {
      rejectWith(error?.message ?? 'Failed to create account')
      return
    }

    // No session means the Supabase project has email confirmation on, so the
    // account exists but cannot be provisioned until they click the link.
    if (!data.session) {
      router.push(`/signup/check-email?email=${encodeURIComponent(email)}`)
      return
    }

    const response = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ businessName, mode }),
    })

    if (!response.ok) {
      const body = (await response.json()) as { error?: string }
      rejectWith(body.error ?? 'Failed to set up account')
      return
    }

    router.push('/dashboard')
    router.refresh()
  }

  return (
    <div className="grid md:grid-cols-2">
      <div className="p-8 md:p-9">
        <AuthPanel
          asDialog
          title="Create your free account"
          description="14-day trial · no card required"
        >
          <form ref={formRef} onSubmit={handleSubmit} className="flex flex-col gap-4">
            {formError && <AuthFormError>{formError}</AuthFormError>}

            <Input
              label="Business name"
              type="text"
              placeholder="Acme Agency"
              autoComplete="organization"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              error={errors.businessName}
              className={FIELD_SURFACE}
            />
            <Input
              label="Work email"
              type="email"
              placeholder="you@agency.com"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              error={errors.email}
              className={FIELD_SURFACE}
            />
            <Input
              label="Password"
              type="password"
              placeholder="Min. 10 characters"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={errors.password}
              className={FIELD_SURFACE}
            />

            <ModeSelector mode={mode} onChange={setMode} />

            <Button type="submit" size="lg" loading={submitting} className="mt-1 w-full">
              Create free account
            </Button>
          </form>

          <p className="mt-3.5 text-center text-caption text-text3">
            By creating an account you agree to our{' '}
            <a href="/terms" className="text-spring-text underline-offset-4 hover:underline">
              Terms
            </a>{' '}
            and{' '}
            <a href="/privacy" className="text-spring-text underline-offset-4 hover:underline">
              Privacy policy
            </a>
            .
          </p>
          <p className="mt-4 text-center text-caption text-text2">
            Already have an account? <AuthLink onClick={() => open('signin')}>Sign in</AuthLink>
          </p>
        </AuthPanel>
      </div>

      <SignUpBenefitsPanel filled={filled} />
    </div>
  )
}
