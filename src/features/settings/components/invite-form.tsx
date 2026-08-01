'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { validateEmail } from '@/lib/validation'
import { Button } from '@/components/ui/button'
import { Field, FormSection } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { toast } from '@/components/ui/toast'

/**
 * Only two roles are real: every permission check in the app tests for `admin`, and anything
 * else behaves as a plain member. Offering a third would not change what it can do.
 */
const ROLE_OPTIONS = [
  { value: 'member', label: 'Member' },
  { value: 'admin', label: 'Admin' },
]

/** Invites a colleague into the workspace with a chosen role. */
export function InviteForm() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('member')
  const [emailError, setEmailError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  async function handleSubmit() {
    const error = validateEmail(email)
    if (error) {
      setEmailError(error)
      return
    }
    setEmailError(null)
    setSending(true)

    try {
      const res = await fetch('/api/settings/team/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), role }),
      })
      const data = (await res.json()) as { error?: string; success?: boolean }
      if (!res.ok) throw new Error(data.error ?? 'Failed to send invite')
      toast.success(`Invite sent to ${email.trim()}`)
      setEmail('')
      setRole('member')
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send invite')
    } finally {
      setSending(false)
    }
  }

  return (
    <FormSection
      legend="Invite a team member"
      description="They'll get an email with a join link."
    >
      <Field label="Email" span={6} error={emailError ?? undefined}>
        <Input
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value)
            if (emailError) setEmailError(null)
          }}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          placeholder="colleague@agency.com"
        />
      </Field>
      <Field label="Role" span={3}>
        <Select value={role} onChange={(e) => setRole(e.target.value)} options={ROLE_OPTIONS} />
      </Field>
      <div className="col-span-12 flex items-end lg:col-span-3">
        <Button onClick={handleSubmit} loading={sending} disabled={!email} className="w-full">
          Send invite
        </Button>
      </div>
      <p className="col-span-12 -mt-1.5 text-xs text-text3">
        Members can draft and review. Admins can also change workspace settings and remove people.
      </p>
    </FormSection>
  )
}
