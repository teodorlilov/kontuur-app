'use client'

import { useState } from 'react'
import { validateEmail } from '@/lib/validation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { toast } from '@/components/ui/toast'
import type { TeamMember } from '@/types/api'

interface TeamViewProps {
  members: TeamMember[]
  currentUserRole: string
  currentUserId: string
  agencyMode: 'agency' | 'solo'
}

export function TeamView({
  members: initialMembers,
  currentUserRole,
  currentUserId,
  agencyMode,
}: TeamViewProps) {
  const [members] = useState(initialMembers)
  const [email, setEmail] = useState('')
  const [emailError, setEmailError] = useState<string | null>(null)
  const [inviting, setInviting] = useState(false)
  const isAdmin = currentUserRole === 'admin'

  if (agencyMode === 'solo') {
    return (
      <div className="mt-6 text-center py-12">
        <p className="text-gray-500">Team management is available in agency mode.</p>
      </div>
    )
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    const error = validateEmail(email)
    if (error) {
      setEmailError(error)
      return
    }
    setEmailError(null)
    setInviting(true)

    try {
      const res = await fetch('/api/settings/team/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })
      const data = (await res.json()) as { error?: string; success?: boolean }
      if (!res.ok) {
        throw new Error(data.error ?? 'Failed to send invite')
      }
      toast.success(`Invite sent to ${email.trim()}`)
      setEmail('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send invite')
    } finally {
      setInviting(false)
    }
  }

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  return (
    <div className="mt-6 space-y-8">
      {/* Invite form (admin only) */}
      {isAdmin && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Invite team member</h2>
          <form onSubmit={handleInvite} className="flex gap-3 items-start">
            <div className="flex-1">
              <Input
                type="email"
                placeholder="colleague@agency.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value)
                  if (emailError) setEmailError(null)
                }}
                error={emailError ?? undefined}
                autoComplete="email"
              />
            </div>
            <Button type="submit" loading={inviting} className="shrink-0">
              Send invite
            </Button>
          </form>
          <p className="text-xs text-gray-400 mt-2">
            They will receive an email with a link to join your team.
          </p>
        </div>
      )}

      {/* Team members list */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">
            Team members
            <span className="text-gray-400 font-normal ml-2">({members.length})</span>
          </h2>
        </div>
        <div className="divide-y divide-gray-100">
          {members.map((member) => (
            <div key={member.id} className="px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                  <span className="text-sm font-medium text-gray-600">
                    {member.email.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {member.email}
                    {member.id === currentUserId && (
                      <span className="text-gray-400 font-normal ml-1">(you)</span>
                    )}
                  </p>
                  <p className="text-xs text-gray-400">Joined {formatDate(member.created_at)}</p>
                </div>
              </div>
              <Badge variant={member.role === 'admin' ? 'info' : 'default'}>
                {member.role === 'admin' ? 'Admin' : 'Member'}
              </Badge>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
