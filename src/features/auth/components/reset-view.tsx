'use client'

import { useState } from 'react'
import { Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { validateEmail } from '@/lib/validation'
import { useAuthDialog } from './auth-dialog-provider'
import { AuthFormError, AuthLink, AuthPanel, FIELD_SURFACE } from './auth-panel'
import { useAuthForm } from './use-auth-form'

export function ResetView() {
  const { open } = useAuthDialog()
  const [email, setEmail] = useState('')
  const {
    formRef,
    errors,
    formError,
    submitting,
    setSubmitting,
    setFormError,
    checkFields,
    rejectWith,
  } = useAuthForm<'email'>()

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const emailError = validateEmail(email)
    if (!checkFields(emailError ? { email: emailError } : {})) return

    setSubmitting(true)
    setFormError(null)

    const response = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })

    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string }
      rejectWith(body.error ?? 'Something went wrong. Please try again.')
      return
    }

    // The route answers 200 whether or not that address has an account, so this
    // view can promise nothing it would have to take back.
    open('sent')
  }

  return (
    <AuthPanel
      asDialog
      title="Reset your password"
      description="We'll email you a link to set a new one."
    >
      <form ref={formRef} onSubmit={handleSubmit} className="flex flex-col gap-4">
        {formError && <AuthFormError>{formError}</AuthFormError>}

        <Input
          label="Email"
          type="email"
          placeholder="you@agency.com"
          autoComplete="email"
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={errors.email}
          className={FIELD_SURFACE}
        />

        <Button type="submit" size="lg" loading={submitting} className="mt-1 w-full">
          Send reset link
        </Button>
      </form>

      <p className="mt-5 text-center text-caption text-text2">
        <AuthLink onClick={() => open('signin')}>Back to sign in</AuthLink>
      </p>
    </AuthPanel>
  )
}

export function ResetSentView() {
  const { open } = useAuthDialog()

  return (
    <AuthPanel
      asDialog
      title="Check your inbox"
      // Deliberately says nothing about whether the address is registered — the
      // route behind it does not either. See docs/TECH-DEBT.md §6.5.
      description="If an account exists for that address, a reset link is on its way."
    >
      <div className="flex flex-col items-center gap-6">
        <span className="grid size-12 place-items-center rounded-full bg-wash text-forest">
          <Check size={22} strokeWidth={1.8} aria-hidden />
        </span>
        <p className="text-center text-caption text-text2">
          <AuthLink onClick={() => open('signin')}>Back to sign in</AuthLink>
        </p>
      </div>
    </AuthPanel>
  )
}
