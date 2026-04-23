'use client'

import { useState } from 'react'
import { validateEmail } from '@/lib/validation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { toast } from '@/components/ui/toast'

const ROLE_OPTIONS = [
  { value: 'member', label: 'Member' },
  { value: 'admin', label: 'Admin' },
  { value: 'viewer', label: 'Viewer' },
]

interface InviteFormProps {
  onInviteSent?: () => void
}

/** Email + role invite form for team settings. */
export function InviteForm({ onInviteSent }: InviteFormProps) {
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
        // API currently ignores role — included for forward compatibility
        body: JSON.stringify({ email: email.trim(), role }),
      })
      const data = (await res.json()) as { error?: string; success?: boolean }
      if (!res.ok) throw new Error(data.error ?? 'Failed to send invite')
      toast.success(`Invite sent to ${email.trim()}`)
      setEmail('')
      setRole('member')
      onInviteSent?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send invite')
    } finally {
      setSending(false)
    }
  }

  return (
    <div style={{ padding: '20px 22px' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <Input
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
              if (emailError) setEmailError(null)
            }}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            placeholder="colleague@agency.com"
            error={emailError ?? undefined}
          />
        </div>
        <div style={{ width: 126, flexShrink: 0 }}>
          <Select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            options={ROLE_OPTIONS}
          />
        </div>
        <Button onClick={handleSubmit} loading={sending} disabled={!email} style={{ flexShrink: 0 }}>
          Send invite
        </Button>
      </div>
    </div>
  )
}
