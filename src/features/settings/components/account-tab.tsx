'use client'

import { useState, useSyncExternalStore } from 'react'
import { useRouter } from 'next/navigation'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Field, FormSection, RailBox, RailStat, RailText, SaveBar } from '@/components/ui/form'
import { StatusPill } from '@/components/ui/status-pill'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { toast } from '@/components/ui/toast'
import { getGroupedTimezones } from '@/lib/timezones'
import { formatClockTime } from '@/utils/date-helpers'
import { WorkspaceDangerZone } from './workspace-danger-zone'
import type { AgencyInfo } from '@/types/api'

const MINUTE_MS = 60_000
const CLOCK_TICK_MS = 10_000

function subscribeToClock(onChange: () => void) {
  const timer = setInterval(onChange, CLOCK_TICK_MS)
  return () => clearInterval(timer)
}

/**
 * The current minute, or null on the server and until hydration.
 *
 * A server-rendered clock is the hydration mismatch `lib/timezones.ts` already paid for once:
 * the browser's minute never matches the one the HTML carried. So the server snapshot is null and
 * the hint gains its clock only once React is running here. The snapshot is the minute as a
 * number, so the 10s tick re-renders nothing until the minute actually turns.
 */
function useCurrentMinute(): number | null {
  return useSyncExternalStore(
    subscribeToClock,
    () => Math.floor(Date.now() / MINUTE_MS),
    () => null
  )
}

interface AccountTabProps {
  /** The two columns this form edits — the billing columns never reach the browser. */
  agency: Pick<AgencyInfo, 'name' | 'timezone'>
  currentUserRole: string
}

/**
 * The timezone field's hint: what the setting decides, led by the time it is there right now so a
 * wrong zone is caught by its clock rather than by a missed generation day. Clockless until the
 * browser knows the minute — see `useCurrentMinute`.
 */
function timezoneHint(timezone: string, minute: number | null): string {
  const purpose = 'Decides the correct day for scheduled generation.'
  if (minute === null) return purpose
  return `It's ${formatClockTime(new Date(minute * MINUTE_MS), timezone)} there right now. ${purpose}`
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
  const minute = useCurrentMinute()

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
        <Field label="Timezone" span={6} hint={timezoneHint(timezone, minute)}>
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
  /** From copy.ts on the server page (`deleteWorkspaceRefusal`, `cancelPlanConsequence`, `deleteWorkspaceNotice`); the rail only shows them. */
  refusal: string | null
  cancelConsequence: string
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
  cancelConsequence,
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
            cancelConsequence={cancelConsequence}
            notice={notice}
          />
        </RailBox>
      )}
    </>
  )
}
