'use client'

import { useState } from 'react'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'
import { validatePassword } from '@/lib/validation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from '@/components/ui/toast'

interface FormErrors {
  password?: string
  confirmPassword?: string
}

export function SetupPasswordForm() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<FormErrors>({})

  function validate(): FormErrors {
    const next: FormErrors = {}
    const passwordError = validatePassword(password)
    if (passwordError) next.password = passwordError
    if (!confirmPassword) {
      next.confirmPassword = 'Please confirm your password'
    } else if (password !== confirmPassword) {
      next.confirmPassword = 'Passwords do not match'
    }
    return next
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length > 0) {
      setErrors(errs)
      return
    }
    setErrors({})
    setLoading(true)

    const supabase = createBrowserSupabaseClient()

    // Check that user has a session
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      toast.error('Session expired. Please use your invite link again or reset your password.')
      window.location.href = '/login'
      return
    }

    const { error } = await supabase.auth.updateUser({ password })

    if (error) {
      toast.error(error.message)
      setLoading(false)
      return
    }

    // Hard navigation ensures a single clean request through middleware,
    // avoiding race conditions with token refresh from the invite session.
    toast.success('Password set successfully')
    window.location.href = '/dashboard'
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center gap-2 mb-6">
            <div className="h-8 w-8 rounded-lg bg-brand-purple flex items-center justify-center">
              <span className="text-white text-sm font-bold">P</span>
            </div>
            <span className="text-xl font-semibold text-gray-900">PostFlow</span>
          </div>
          <h1 className="text-xl font-semibold text-gray-900">Set your password</h1>
          <p className="text-sm text-gray-500 mt-1">
            Choose a password to complete your account setup
          </p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 flex flex-col gap-4">
          <Input
            label="Password"
            type="password"
            placeholder="Min. 10 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={errors.password}
            autoComplete="new-password"
          />
          <Input
            label="Confirm password"
            type="password"
            placeholder="Re-enter your password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            error={errors.confirmPassword}
            autoComplete="new-password"
          />
          <Button type="submit" loading={loading} className="w-full mt-1">
            Set password
          </Button>
        </form>
      </div>
    </div>
  )
}
