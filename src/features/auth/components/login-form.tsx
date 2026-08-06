'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'
import { validateEmail } from '@/lib/validation'
import { cn } from '@/utils/cn'
import { Input } from '@/components/ui/input'
import { toast } from '@/components/ui/toast'
import { AuthLayout } from '@/features/auth/components/auth-layout'

interface LoginFormPanelProps {
  email: string
  setEmail: (v: string) => void
  password: string
  setPassword: (v: string) => void
  errors: { email?: string; password?: string }
  loading: boolean
  onSubmit: (e: React.SyntheticEvent<HTMLFormElement>) => void
}

function LoginFormPanel({
  email,
  setEmail,
  password,
  setPassword,
  errors,
  loading,
  onSubmit,
}: LoginFormPanelProps) {
  return (
    <div>
      <h3 className="text-headline font-display font-normal text-ink mb-1.5">Welcome back</h3>
      <p className="text-body text-text2 mb-8">Sign in to your account</p>
      <form onSubmit={onSubmit} className="flex flex-col gap-0">
        <div className="mb-[18px]">
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
        </div>
        <div className="mb-1.5">
          <Input
            label="Password"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={errors.password}
            autoComplete="current-password"
            labelVariant="caps"
          />
        </div>
        <div className="text-right mb-[18px]">
          <Link href="/forgot-password" className="text-micro text-text2 no-underline">
            Forgot password?
          </Link>
        </div>
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
          Sign in
        </button>
      </form>
      <p className="text-caption text-center text-text2 mt-5">
        No account?{' '}
        <Link href="/signup" className="text-spring-text no-underline">
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
