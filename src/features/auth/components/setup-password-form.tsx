'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from '@/components/ui/toast'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'
import { validatePassword } from '@/lib/validation'
import { AuthFormError, AuthPanel, FIELD_SURFACE } from './auth-panel'
import { useAuthForm } from './use-auth-form'

type Field = 'password' | 'confirmPassword'

/**
 * Where an invite link and a password-recovery link both land.
 *
 * Stays a real route rather than a dialog view: it is only reachable with a
 * live session that an email link established, so there is nothing on the
 * landing page that could open it. It wears the dialog's panel and fields so it
 * still reads as the same surface.
 */
export function SetupPasswordForm() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
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

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const next: Partial<Record<Field, string>> = {}
    const passwordError = validatePassword(password)
    if (passwordError) next.password = passwordError
    if (!confirmPassword) {
      next.confirmPassword = 'Please confirm your password'
    } else if (password !== confirmPassword) {
      next.confirmPassword = 'Passwords do not match'
    }
    if (!checkFields(next)) return

    setSubmitting(true)
    setFormError(null)

    const supabase = createBrowserSupabaseClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      toast.error('Session expired. Please use your invite link again or reset your password.')
      window.location.href = '/?auth=reset'
      return
    }

    const { error } = await supabase.auth.updateUser({ password })

    if (error) {
      rejectWith(error.message)
      return
    }

    // Hard navigation ensures a single clean request through middleware,
    // avoiding race conditions with token refresh from the invite session.
    toast.success('Password set successfully')
    window.location.href = '/dashboard'
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-paper px-5 py-12">
      <div className="w-full max-w-[432px] rounded-card border border-line bg-surface p-8 md:p-9">
        <AuthPanel
          title="Set your password"
          description="Choose a password to complete your account setup."
        >
          <form ref={formRef} onSubmit={handleSubmit} className="flex flex-col gap-4">
            {formError && <AuthFormError>{formError}</AuthFormError>}

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
            <Input
              label="Confirm password"
              type="password"
              placeholder="Re-enter your password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              error={errors.confirmPassword}
              className={FIELD_SURFACE}
            />

            <Button type="submit" size="lg" loading={submitting} className="mt-1 w-full">
              Set password
            </Button>
          </form>
        </AuthPanel>
      </div>
    </main>
  )
}
