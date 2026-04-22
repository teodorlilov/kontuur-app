'use client'

import { ChevronRight } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { PLATFORMS } from '@/utils/constants'

interface StepClientProps {
  clients: { id: string; name: string }[]
  selectedClient: string
  selectedPlatform: string
  brandProfileLoading: boolean
  onClientChange: (id: string) => void
  onPlatformChange: (platform: string) => void
  onNext: () => void
}

/** Step 1: client selector + platform pills. */
export function StepClient({
  clients,
  selectedClient,
  selectedPlatform,
  brandProfileLoading,
  onClientChange,
  onPlatformChange,
  onNext,
}: StepClientProps) {
  const canNext = !!selectedClient && !brandProfileLoading

  return (
    <>
      <CardHeading title="Client & platform" subtitle="Choose which client and platform to generate for" />

      <FieldLabel>Client</FieldLabel>
      <select
        value={selectedClient}
        onChange={(e) => onClientChange(e.target.value)}
        style={SELECT_STYLE}
      >
        {clients.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>

      {brandProfileLoading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '8px' }}>
          <Spinner size="sm" />
          <span style={{ fontSize: '12px', color: 'var(--color-muted)' }}>Loading brand profile...</span>
        </div>
      )}

      <hr style={{ border: 'none', borderTop: '0.5px solid var(--color-border-1)', margin: '20px 0' }} />

      <FieldLabel>Platform</FieldLabel>
      <div style={{ display: 'flex', gap: '7px', flexWrap: 'wrap' }}>
        {PLATFORMS.map((p) => (
          <PlatformPill
            key={p}
            label={p}
            isSelected={selectedPlatform === p}
            onClick={() => onPlatformChange(p)}
          />
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '24px' }}>
        <PrimaryButton onClick={onNext} disabled={!canNext}>
          Next <ChevronRight size={14} />
        </PrimaryButton>
      </div>
    </>
  )
}

function PlatformPill({
  label,
  isSelected,
  onClick,
}: {
  label: string
  isSelected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '8px 16px',
        borderRadius: '22px',
        fontSize: '12px',
        fontWeight: 500,
        cursor: 'pointer',
        border: isSelected ? '1.5px solid var(--sidebar-bg)' : '1.5px solid var(--color-border-2)',
        background: isSelected ? 'var(--sidebar-bg)' : 'var(--color-surface)',
        color: isSelected ? 'var(--sidebar-text-active)' : 'var(--color-muted)',
        fontFamily: 'inherit',
        transition: 'all 0.15s',
      }}
    >
      {label}
    </button>
  )
}

/* ─── Shared form primitives ─── */

function CardHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <>
      <h2
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: '22px',
          fontWeight: 400,
          color: 'var(--color-text-1)',
          marginBottom: '4px',
        }}
      >
        {title}
      </h2>
      <p style={{ fontSize: '13px', color: 'var(--color-muted)', marginBottom: '24px', lineHeight: 1.55 }}>
        {subtitle}
      </p>
    </>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: '10px',
        fontWeight: 500,
        color: 'var(--color-text-2)',
        letterSpacing: '0.8px',
        textTransform: 'uppercase',
        marginBottom: '7px',
      }}
    >
      {children}
    </div>
  )
}

function PrimaryButton({
  children,
  onClick,
  disabled,
  variant = 'slate',
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
  variant?: 'slate' | 'terra'
}) {
  const bg = variant === 'terra' ? 'var(--color-terracotta)' : 'var(--sidebar-bg)'

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '11px 26px',
        background: disabled ? 'rgba(44,62,80,0.3)' : bg,
        color: 'var(--sidebar-text-active)',
        border: 'none',
        borderRadius: '9px',
        fontSize: '13px',
        fontWeight: 500,
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: 'inherit',
        display: 'flex',
        alignItems: 'center',
        gap: '7px',
        transition: 'background 0.15s',
      }}
    >
      {children}
    </button>
  )
}

const SELECT_STYLE: React.CSSProperties = {
  width: '100%',
  padding: '10px 13px',
  border: '0.5px solid var(--color-border-2)',
  borderRadius: '8px',
  fontSize: '13px',
  fontFamily: 'inherit',
  color: 'var(--color-text-1)',
  background: 'var(--color-surface)',
  outline: 'none',
  cursor: 'pointer',
}

export { CardHeading, FieldLabel, PrimaryButton, SELECT_STYLE }
