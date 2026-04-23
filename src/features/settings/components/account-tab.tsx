'use client'

import { useState } from 'react'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { GROUPED_TIMEZONES } from '@/lib/timezones'
import { fieldBaseStyle } from '@/components/ui/field-styles'
import { SectionCard } from './section-card'
import { PlanSection } from './plan-section'
import { DangerZone } from './danger-zone'
import type { AgencyInfo } from '@/types/api'

const LANGUAGE_OPTIONS = [
  { value: 'Bulgarian', label: 'Bulgarian' },
  { value: 'English', label: 'English' },
  { value: 'Greek', label: 'Greek' },
]

const settingsFieldStyle: React.CSSProperties = {
  ...fieldBaseStyle,
  height: 36,
}

interface AccountTabProps {
  agency: AgencyInfo
  currentUserRole: string
}

/** Account tab: agency settings, plan, danger zone. */
export function AccountTab({ agency, currentUserRole }: AccountTabProps) {
  const [name, setName] = useState(agency.name)
  const [timezone, setTimezone] = useState(agency.timezone)
  const [language, setLanguage] = useState('Bulgarian')
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
      const data = (await res.json()) as { error?: string; success?: boolean }
      if (!res.ok) throw new Error(data.error ?? 'Failed to update')
      toast.success('Settings saved')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update')
    } finally {
      setSaving(false)
    }
  }

  function handleCancel() {
    setName(agency.name)
    setTimezone(agency.timezone)
  }

  return (
    <>
      <PageHeader title="Account" subtitle="Agency workspace settings and plan details" />

      <SectionCard title="Agency settings" subtitle="Workspace name, branding, and operational preferences">
        <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <LogoUpload agencyName={agency.name} />
          <Divider />
          <Field label="Agency name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!isAdmin}
              style={settingsFieldStyle}
            />
          </Field>
          <Field label="Timezone" hint="Used to determine the correct day for scheduled content and autonomous generation.">
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              disabled={!isAdmin}
              style={settingsFieldStyle}
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
          </Field>
          <Field label="Default content language" hint="Fallback language for clients that don't have a language configured.">
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              // No DB column for agency default_language yet — UI-only
              disabled={!isAdmin}
              style={settingsFieldStyle}
            >
              {LANGUAGE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </Field>

          {isAdmin && (
            <div style={{ display: 'flex', gap: 8, paddingTop: 4 }}>
              <Button onClick={handleSave} loading={saving} disabled={!hasChanged}>
                Save changes
              </Button>
              <Button variant="secondary" onClick={handleCancel} disabled={!hasChanged}>
                Cancel
              </Button>
            </div>
          )}
        </div>
      </SectionCard>

      <PlanSection agency={agency} />
      <DangerZone workspaceName={agency.name} isAdmin={isAdmin} />
    </>
  )
}

function PageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div
        style={{
          fontFamily: 'var(--font-display, Georgia, serif)',
          fontSize: 22,
          fontWeight: 400,
          color: 'var(--color-text-1)',
          marginBottom: 4,
        }}
      >
        {title}
      </div>
      <div style={{ fontSize: 13, color: 'var(--color-muted)' }}>{subtitle}</div>
    </div>
  )
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-1)', display: 'block', marginBottom: 5 }}>
        {label}
      </label>
      {children}
      {hint && <div style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: 5 }}>{hint}</div>}
    </div>
  )
}

function LogoUpload({ agencyName }: { agencyName: string }) {
  return (
    <div>
      <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-1)', display: 'block', marginBottom: 8 }}>
        Agency logo
      </label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <Avatar name={agencyName} size="lg" color="brand" />
        <div>
          <button
            onClick={() => toast.info('Logo upload coming soon')}
            style={{
              padding: '7px 14px',
              background: 'none',
              border: '0.5px solid rgba(44,62,80,0.18)',
              borderRadius: 8,
              fontSize: 11,
              fontWeight: 500,
              color: 'var(--color-muted)',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Upload logo
          </button>
          <div style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: 5 }}>
            PNG, JPG or SVG &middot; max 1 MB
          </div>
        </div>
      </div>
    </div>
  )
}

function Divider() {
  return <div style={{ height: 0.5, background: 'rgba(44,62,80,0.07)' }} />
}
