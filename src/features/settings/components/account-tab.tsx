'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Field, FormSection, RailBox, RailStat, RailText, SaveBar } from '@/components/ui/form'
import { StatusPill } from '@/components/ui/status-pill'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { toast } from '@/components/ui/toast'
import { getGroupedTimezones } from '@/lib/timezones'
import { WorkspaceDangerZone } from './workspace-danger-zone'
import type { AgencyInfo } from '@/types/api'

interface AccountTabProps {
  /** The two columns this form edits — the billing columns never reach the browser. */
  agency: Pick<AgencyInfo, 'name' | 'timezone'>
  currentUserRole: string
}

/**
 * Name, branding and the defaults every client inherits.
 *
 * Only fields with a column behind them appear here: a control that cannot persist what it shows
 * is worse than an absent one.
 */
export function AccountTab({ agency, currentUserRole }: AccountTabProps) {
  const router = useRouter()
  const isAdmin = currentUserRole === 'admin'
  const [name, setName] = useState(agency.name)
  const [timezone, setTimezone] = useState(agency.timezone)
  const [saving, setSaving] = useState(false)

  const dirty = name.trim() !== agency.name || timezone !== agency.timezone

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
      const data = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Failed to update')
      toast.success('Workspace updated')
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update')
    } finally {
      setSaving(false)
    }
  }

  function handleDiscard() {
    setName(agency.name)
    setTimezone(agency.timezone)
  }

  return (
    <>
      <FormSection>
        <Field label="Agency name" span={6} required>
          <Input value={name} onChange={(e) => setName(e.target.value)} disabled={!isAdmin} />
        </Field>
        <Field label="Logo" span={6}>
          <div className="flex items-center gap-3">
            <Avatar name={agency.name} size="lg" color="brand" />
            {/* Disabled rather than a button that reports failure on click: there is no
                logo column and no storage bucket behind it yet. */}
            <Button variant="secondary" size="sm" disabled>
              Upload
            </Button>
            <StatusPill tone="warn">Coming soon</StatusPill>
          </div>
        </Field>
      </FormSection>

      <FormSection legend="Defaults" description="Applied to every client in this workspace.">
        <Field label="Timezone" span={6} hint="Decides the correct day for scheduled generation.">
          <Select
            value={timezone}
            onChange={(value) => setTimezone(value)}
            disabled={!isAdmin}
            options={getGroupedTimezones().flatMap((group) => group.options)}
          />
        </Field>
      </FormSection>

      {isAdmin && (
        <SaveBar
          dirty={dirty}
          label="Agency workspace"
          saving={saving}
          onSave={handleSave}
          onDiscard={handleDiscard}
        />
      )}
    </>
  )
}

interface AccountRailProps {
  clientCount: number
  memberCount: number
  isAdmin: boolean
  agencyName: string
  agencyMode: 'agency' | 'solo'
  /** From `deleteWorkspaceRefusal` / `deleteWorkspaceNotice` on the server page; the rail only shows them. */
  refusal: string | null
  notice: string | null
}

/** Context rail for the Account panel. The danger box is admins' only; its state lives in the leaf. */
export function AccountRail({
  clientCount,
  memberCount,
  isAdmin,
  agencyName,
  agencyMode,
  refusal,
  notice,
}: AccountRailProps) {
  return (
    <>
      <RailBox title="Applies to">
        <RailStat label="Clients" value={clientCount} />
        <RailText>
          The timezone above decides which day autonomous generation runs on for all of them.
        </RailText>
      </RailBox>

      {isAdmin && (
        <RailBox title="Danger zone">
          <WorkspaceDangerZone
            agencyName={agencyName}
            clientCount={clientCount}
            memberCount={memberCount}
            agencyMode={agencyMode}
            refusal={refusal}
            notice={notice}
          />
        </RailBox>
      )}
    </>
  )
}
