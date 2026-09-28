'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { z } from 'zod'
import { validateEmail } from '@/lib/validation'
import { Button } from '@/components/ui/button'
import { Field, FormSection } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { toast } from '@/components/ui/toast'
import { readRouteBody } from '@/utils/read-route-body'

/**
 * Only two roles are real: every permission check in the app tests for `admin`, and anything
 * else behaves as a plain member. Offering a third would not change what it can do.
 */
const ROLE_OPTIONS = [
  { value: 'member', label: 'Member' },
  { value: 'admin', label: 'Admin' },
]

/**
 * The invite route's success body, as far as the form reads it: the notice of an invite that went
 * out with something unfinished (src/app/api/settings/team/invite/route.ts). A 200 means the email
 * went out, so a body that is not this shape reads as no notice rather than as a failure.
 */
const inviteAnswerSchema = z.object({ notice: z.string().nullable() }).catch({ notice: null })

/**
 * Invites a colleague into the workspace with a chosen role. A submit while one is sending returns
 * at once: the button is disabled then, but Enter in the address field is not, and a held Enter
 * would otherwise post the same invite in parallel. An invite that answers ok went out, so the
 * form resets; its notice, when it has one, says what could not be finished, in place of the
 * success toast.
 */
export function InviteForm() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('member')
  const [emailError, setEmailError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  async function handleSubmit() {
    if (sending) return
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
      const { notice } = await readRouteBody(res, inviteAnswerSchema, 'Failed to send invite')
      if (notice) toast.error(notice)
      else toast.success(`Invite sent to ${email.trim()}`)
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
    <FormSection legend="Invite a team member" description="They'll get an email with a join link.">
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
        <Select value={role} onChange={(value) => setRole(value)} options={ROLE_OPTIONS} />
      </Field>
      <div className="col-span-12 flex items-end lg:col-span-3">
        <Button onClick={handleSubmit} loading={sending} disabled={!email} className="w-full">
          Send invite
        </Button>
      </div>
      <p className="col-span-12 -mt-1.5 text-caption text-text3">
        Members can draft and review. Admins can also change workspace settings and remove people.
      </p>
    </FormSection>
  )
}
