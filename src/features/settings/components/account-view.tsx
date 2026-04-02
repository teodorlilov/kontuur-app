'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { toast } from '@/components/ui/toast'

interface AgencyInfo {
  id: string
  name: string
  plan: string
  mode: string
  subscription_status: string
  trial_ends_at: string
  plan_client_limit: number
}

interface AccountViewProps {
  agency: AgencyInfo
  currentUserRole: string
}

export function AccountView({ agency, currentUserRole }: AccountViewProps) {
  const [name, setName] = useState(agency.name)
  const [saving, setSaving] = useState(false)
  const isAdmin = currentUserRole === 'admin'
  const hasChanged = name.trim() !== agency.name

  async function handleSave() {
    if (!name.trim()) {
      toast.error('Agency name is required')
      return
    }
    setSaving(true)

    try {
      const res = await fetch('/api/settings/account', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      })
      const data = await res.json() as { error?: string; success?: boolean }
      if (!res.ok) {
        throw new Error(data.error ?? 'Failed to update')
      }
      toast.success('Agency name updated')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update')
    } finally {
      setSaving(false)
    }
  }

  function formatPlanLabel(plan: string): string {
    return plan.charAt(0).toUpperCase() + plan.slice(1)
  }

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    })
  }

  return (
    <div className="mt-6 space-y-8">
      {/* Agency name */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Agency name</h2>
        <div className="flex gap-3 items-start">
          <div className="flex-1">
            <Input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!isAdmin}
              placeholder="Your agency name"
            />
          </div>
          {isAdmin && (
            <Button
              onClick={handleSave}
              loading={saving}
              disabled={!hasChanged || !name.trim()}
              className="shrink-0"
            >
              Save
            </Button>
          )}
        </div>
        {!isAdmin && (
          <p className="text-xs text-gray-400 mt-2">
            Only admins can change the agency name.
          </p>
        )}
      </div>

      {/* Plan info */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Plan</h2>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">Current plan</span>
            <Badge variant="info">{formatPlanLabel(agency.plan)}</Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">Status</span>
            <span className="text-sm font-medium text-gray-900">
              {agency.subscription_status === 'trialing' ? 'Trial' : formatPlanLabel(agency.subscription_status)}
            </span>
          </div>
          {agency.subscription_status === 'trialing' && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">Trial ends</span>
              <span className="text-sm font-medium text-gray-900">
                {formatDate(agency.trial_ends_at)}
              </span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">Client limit</span>
            <span className="text-sm font-medium text-gray-900">
              {agency.plan_client_limit}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">Mode</span>
            <span className="text-sm font-medium text-gray-900">
              {agency.mode === 'solo' ? 'Solo' : 'Agency'}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
