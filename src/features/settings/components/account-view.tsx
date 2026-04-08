'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { toast } from '@/components/ui/toast'
import { GROUPED_TIMEZONES } from '@/lib/timezones'

interface AgencyInfo {
  id: string
  name: string
  plan: string
  mode: string
  subscription_status: string
  trial_ends_at: string
  plan_client_limit: number
  timezone: string
}

interface AccountViewProps {
  agency: AgencyInfo
  currentUserRole: string
}

export function AccountView({ agency, currentUserRole }: AccountViewProps) {
  const [name, setName] = useState(agency.name)
  const [timezone, setTimezone] = useState(agency.timezone)
  const [saving, setSaving] = useState(false)
  const isAdmin = currentUserRole === 'admin'
  const hasChanged = name.trim() !== agency.name || timezone !== agency.timezone

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
        body: JSON.stringify({ name: name.trim(), timezone }),
      })
      const data = await res.json() as { error?: string; success?: boolean }
      if (!res.ok) {
        throw new Error(data.error ?? 'Failed to update')
      }
      toast.success('Settings saved')
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
      {/* Agency name + timezone */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <h2 className="text-base font-semibold text-gray-900">Agency settings</h2>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Agency name</label>
          <Input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={!isAdmin}
            placeholder="Your agency name"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Timezone</label>
          <select
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            disabled={!isAdmin}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-purple/30 focus:border-brand-purple disabled:opacity-50 disabled:bg-gray-50"
          >
            {GROUPED_TIMEZONES.map((group) => (
              <optgroup key={group.region} label={group.region}>
                {group.options.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <p className="text-xs text-gray-400 mt-1">
            Used to determine the correct day for autonomous content generation.
          </p>
        </div>
        {isAdmin ? (
          <Button
            onClick={handleSave}
            loading={saving}
            disabled={!hasChanged}
          >
            Save
          </Button>
        ) : (
          <p className="text-xs text-gray-400">Only admins can change agency settings.</p>
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
