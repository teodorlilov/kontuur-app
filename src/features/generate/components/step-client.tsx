'use client'

import { Spinner } from '@/components/ui/spinner'
import { PLATFORMS } from '@/utils/constants'

interface StepClientProps {
  clients: { id: string; name: string }[]
  selectedClient: string
  selectedPlatform: string
  brandProfileLoading: boolean
  onClientChange: (id: string) => void
  onPlatformChange: (platform: string) => void
}

/** Step 1: client selector + platform pills (content only, no heading or footer). */
export function StepClient({
  clients,
  selectedClient,
  selectedPlatform,
  brandProfileLoading,
  onClientChange,
  onPlatformChange,
}: StepClientProps) {
  return (
    <>
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
        border: isSelected ? '1.5px solid #1A2630' : '1.5px solid rgba(44,62,80,0.14)',
        background: isSelected ? '#1A2630' : '#fff',
        color: isSelected ? '#ECE8E1' : '#8A8070',
        fontFamily: 'inherit',
        transition: 'all 0.15s',
      }}
    >
      {label}
    </button>
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
