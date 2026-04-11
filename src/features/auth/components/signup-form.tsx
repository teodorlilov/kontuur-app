'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'
import { validateEmail, validatePassword } from '@/lib/validation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from '@/components/ui/toast'
import { cn } from '@/utils/cn'
import { KontuurLogo } from '@/components/ui/kontuur-logo'

type Mode = 'agency' | 'solo'

interface FormErrors {
  email?: string
  password?: string
  businessName?: string
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

    // 1. Create auth user in browser — returns a session immediately (requires email confirmation OFF)
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
      // Email confirmation is enabled — redirect to a confirmation notice page
      router.push(`/signup/check-email?email=${encodeURIComponent(email)}`)
      return
    }

    // 2. Set up agency + user records server-side (admin client bypasses RLS)
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
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="inline-flex mb-6">
            <KontuurLogo />
          </div>
          <h1 className="text-xl font-semibold text-gray-900">Create your account</h1>
          <p className="text-sm text-gray-500 mt-1">14-day free trial, no card required</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-xl border border-gray-200 p-6 flex flex-col gap-4"
        >
          <Input
            label="Business name"
            type="text"
            placeholder="Acme Agency"
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            error={errors.businessName}
            autoComplete="organization"
          />
          <Input
            label="Email"
            type="email"
            placeholder="you@agency.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={errors.email}
            autoComplete="email"
          />
          <Input
            label="Password"
            type="password"
            placeholder="Min. 10 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={errors.password}
            autoComplete="new-password"
          />

          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-gray-700">How will you use kontuur?</p>
            <div className="flex flex-col gap-2">
              {(
                [
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
                ] as const
              ).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setMode(opt.value)}
                  className={cn(
                    'text-left px-4 py-3 rounded-lg border text-sm transition-colors',
                    mode === opt.value
                      ? 'border-brand-purple bg-brand-purple-light text-brand-purple'
                      : 'border-gray-200 text-gray-700 hover:border-gray-300'
                  )}
                >
                  <span className="font-medium block">{opt.label}</span>
                  <span className="text-xs text-gray-400 mt-0.5 block">{opt.sub}</span>
                </button>
              ))}
            </div>
          </div>

          <Button type="submit" loading={loading} className="w-full mt-1">
            Create account
          </Button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-4">
          Already have an account?{' '}
          <Link href="/login" className="text-brand-purple font-medium hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
