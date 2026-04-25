'use client'

import { MessageSquare, Pencil } from 'lucide-react'
import { WizardTopbar } from './wizard-topbar'
import type { ClientIdea } from '@/types/api'

export type GenerateStep = 'client' | 'priority' | 'type' | 'loading' | 'results'

interface GenerateShellProps {
  currentStep: GenerateStep
  onCancel: () => void
  onStepClick: (step: GenerateStep) => void
  sourceIdea?: ClientIdea
  showTopbar?: boolean
  children: React.ReactNode
}

/** Topbar chrome with step indicators for the generate flow. */
export function GenerateShell({ currentStep, onCancel, onStepClick, sourceIdea, showTopbar = true, children }: GenerateShellProps) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {showTopbar && (
        <WizardTopbar currentStep={currentStep} onStepClick={onStepClick} onCancel={onCancel} />
      )}
      {sourceIdea && showTopbar && (
        <IdeaBanner idea={sourceIdea} onEdit={() => onStepClick('client')} />
      )}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>{children}</div>
    </div>
  )
}

function IdeaBanner({ idea, onEdit }: { idea: ClientIdea; onEdit: () => void }) {
  const truncated = idea.ideaText.length > 80
    ? `${idea.ideaText.slice(0, 80)}…`
    : idea.ideaText

  return (
    <div
      style={{
        background: '#fff',
        borderBottom: '0.5px solid rgba(44,62,80,0.10)',
        padding: '10px 28px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        flexShrink: 0,
      }}
    >
      <span
        style={{
          fontSize: 10,
          fontWeight: 500,
          color: '#8A8070',
          letterSpacing: 0.5,
          textTransform: 'uppercase',
          flexShrink: 0,
        }}
      >
        From idea
      </span>

      <span style={clientPillStyle}>{idea.clientName}</span>

      {idea.platform && (
        <span style={platformPillStyle}>{idea.platform}</span>
      )}

      <span style={ideaPillStyle}>
        <MessageSquare size={10} />
        &ldquo;{truncated}&rdquo;
      </span>

      <button onClick={onEdit} style={editButtonStyle}>
        <Pencil size={10} />
        Edit
      </button>
    </div>
  )
}

const clientPillStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 500,
  padding: '3px 9px',
  borderRadius: 5,
  background: 'rgba(44,62,80,0.07)',
  color: '#1A2630',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
}

const platformPillStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 500,
  padding: '3px 9px',
  borderRadius: 5,
  background: 'rgba(192,123,85,0.12)',
  color: '#C07B55',
}

const ideaPillStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 500,
  padding: '3px 9px',
  borderRadius: 5,
  background: 'rgba(44,94,138,0.08)',
  color: '#2C5F8A',
  flex: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  maxWidth: 400,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
}

const editButtonStyle: React.CSSProperties = {
  marginLeft: 'auto',
  fontSize: 11,
  fontWeight: 500,
  color: '#8A8070',
  background: 'none',
  border: '0.5px solid rgba(44,62,80,0.14)',
  borderRadius: 6,
  padding: '4px 10px',
  cursor: 'pointer',
  fontFamily: 'inherit',
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  gap: 5,
}
