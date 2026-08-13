'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'
import { validateEmail } from '@/lib/validation'
import { useAuthDialog } from './auth-dialog-provider'
import { AuthFormError, AuthLink, AuthPanel, FIELD_SURFACE } from './auth-panel'
import { useAuthForm } from './use-auth-form'

interface SignInViewProps {
  /** A message carried in from /auth/callback, e.g. an expired confirmation link. */
  initialError?: string
}

export function SignInView({ initialError }: SignInViewProps) {
  const { open } = useAuthDialog()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const {
    formRef,
    errors,
    formError,
    submitting,
    setSubmitting,
    setFormError,
    checkFields,
    rejectWith,
  } = useAuthForm<'email' | 'password'>(initialError)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const next: Partial<Record<'email' | 'password', string>> = {}
    const emailError = validateEmail(email)
    if (emailError) next.email = emailError
    if (!password) next.password = 'Password is required'
    if (!checkFields(next)) return

    setSubmitting(true)
    setFormError(null)

    const supabase = createBrowserSupabaseClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      rejectWith(error.message)
      return
    }

    // A full load rather than a router push: the session cookie was just set and
    // every server component on the far side has to be rendered against it.
    // `submitting` is deliberately left on — the page is on its way out.
    window.location.href = '/dashboard'
  }

  return (
    <AuthPanel asDialog title="Welcome back" description="Sign in to review this week's drafts.">
      <form ref={formRef} onSubmit={handleSubmit} className="flex flex-col gap-4">
        {formError && <AuthFormError>{formError}</AuthFormError>}

        <Input
          label="Email"
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
          placeholder="••••••••"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
          className={FIELD_SURFACE}
        />

        <Button type="submit" size="lg" loading={submitting} className="mt-1 w-full">
          Sign in
        </Button>
      </form>

      <p className="mt-5 text-center text-caption text-text2">
        <AuthLink onClick={() => open('reset')}>Forgot your password?</AuthLink>
      </p>
      <p className="mt-4 text-center text-caption text-text2">
        Don&apos;t have an account yet? <AuthLink onClick={() => open('signup')}>Sign up</AuthLink>
      </p>
    </AuthPanel>
  )
}
