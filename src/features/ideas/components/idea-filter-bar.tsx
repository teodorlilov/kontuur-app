'use client'

import { ChevronDown } from 'lucide-react'

export type IdeaStatusFilter = 'new' | 'all' | 'used'

interface ClientFilter {
  id: string
  name: string
  newCount: number
}

interface IdeaFilterBarProps {
  clients: ClientFilter[]
  activeClient: string
  activeStatus: IdeaStatusFilter
  totalNewCount: number
  onClientChange: (id: string) => void
  onStatusChange: (s: IdeaStatusFilter) => void
}

const STATUS_LABELS: { id: IdeaStatusFilter; label: string }[] = [
  { id: 'new', label: 'New' },
  { id: 'all', label: 'All' },
  { id: 'used', label: 'Used' },
]

/** Client dropdown and status filter bar for the ideas inbox. */
export function IdeaFilterBar({
  clients,
  activeClient,
  activeStatus,
  totalNewCount,
  onClientChange,
  onStatusChange,
}: IdeaFilterBarProps) {
  return (
    <div style={barStyle}>
      {/* Client dropdown */}
      <div style={{ position: 'relative' }}>
        <select
          value={activeClient}
          onChange={(e) => onClientChange(e.target.value)}
          style={selectStyle}
        >
          <option value="all">All clients</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}{c.newCount > 0 ? ` (${c.newCount} new)` : ''}
            </option>
          ))}
        </select>
        <ChevronDown
          size={14}
          style={{
            position: 'absolute',
            right: 12,
            top: '50%',
            transform: 'translateY(-50%)',
            pointerEvents: 'none',
            color: '#1A2630',
          }}
        />
      </div>

      {/* Status pills */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {STATUS_LABELS.map((s) => (
          <button
            key={s.id}
            onClick={() => onStatusChange(s.id)}
            style={pillStyle(activeStatus === s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Count label */}
      {totalNewCount > 0 && (
        <span style={{ fontSize: 12, color: '#8A8070', marginLeft: 'auto' }}>
          {totalNewCount} new idea{totalNewCount !== 1 ? 's' : ''}
        </span>
      )}
    </div>
  )
}

// ── Styles ──────────────────────────────────────────────────

const barStyle: React.CSSProperties = {
  padding: '12px 24px',
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  flexShrink: 0,
}

const selectStyle: React.CSSProperties = {
  appearance: 'none',
  padding: '8px 32px 8px 14px',
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 500,
  border: '1px solid rgba(44,62,80,0.16)',
  background: '#fff',
  color: '#1A2630',
  cursor: 'pointer',
  fontFamily: 'inherit',
  minWidth: 160,
}

function pillStyle(isActive: boolean): React.CSSProperties {
  return {
    padding: '6px 14px',
    borderRadius: 7,
    fontSize: 12,
    fontWeight: 500,
    border: isActive ? '1.5px solid #C07B55' : '1px solid rgba(44,62,80,0.14)',
    background: isActive ? 'rgba(192,123,85,0.08)' : '#fff',
    color: isActive ? '#C07B55' : '#8A8070',
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'all 0.15s',
  }
}
