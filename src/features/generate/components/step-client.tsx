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
          <span className="text-caption" style={{ color: 'var(--text2)' }}>
            Loading brand profile...
          </span>
        </div>
      )}

      <hr style={{ border: 'none', borderTop: '1px solid var(--line)', margin: '20px 0' }} />

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
      className="text-caption"
      type="button"
      onClick={onClick}
      style={{
        padding: '8px 16px',
        borderRadius: '22px',
        fontWeight: 500,
        cursor: 'pointer',
        border: isSelected ? '1.5px solid var(--forest-deep)' : '1.5px solid rgba(15,21,18,0.14)',
        background: isSelected ? 'var(--forest-deep)' : '#fff',
        color: isSelected ? '#f2f5f1' : 'var(--text2)',
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
      className="text-label"
      style={{
        fontWeight: 500,
        color: 'var(--text2)',
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
  border: '1px solid var(--line2)',
  borderRadius: '8px',
  fontSize: 'var(--text-body)',
  fontFamily: 'inherit',
  color: 'var(--ink)',
  background: 'var(--surface)',
  outline: 'none',
  cursor: 'pointer',
}
