'use client'

import type { GenerateStep } from './generate-shell'

const STEPS: Array<{ key: GenerateStep; label: string }> = [
  { key: 'client', label: 'Client & platform' },
  { key: 'priority', label: 'Priority posts' },
  { key: 'type', label: 'Post type' },
  { key: 'loading', label: 'Generating' },
  { key: 'results', label: 'Results' },
]

export const STEP_ORDER: Record<GenerateStep, number> = {
  client: 0,
  priority: 1,
  type: 2,
  loading: 3,
  results: 4,
}

interface WizardTopbarProps {
  currentStep: GenerateStep
  onStepClick: (step: GenerateStep) => void
  onCancel: () => void
}

/** 54px topbar with step circles, connectors, and cancel button. */
export function WizardTopbar({ currentStep, onStepClick, onCancel }: WizardTopbarProps) {
  const currentIndex = STEP_ORDER[currentStep]

  return (
    <div
      style={{
        height: '54px',
        background: '#fff',
        borderBottom: '0.5px solid rgba(44,62,80,0.10)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 28px',
        flexShrink: 0,
        boxShadow: '0 1px 0 rgba(44,62,80,0.05)',
      }}
    >
      <LogoMark />
      <StepStrip steps={STEPS} currentIndex={currentIndex} onStepClick={onStepClick} />
      <CancelButton onClick={onCancel} />
    </div>
  )
}

function LogoMark() {
  return (
    <div
      style={{
        fontFamily: 'var(--font-display, Georgia, serif)',
        fontSize: '13px',
        letterSpacing: '3px',
        color: '#1A2630',
        paddingRight: '20px',
        borderRight: '0.5px solid rgba(44,62,80,0.10)',
        marginRight: '20px',
        flexShrink: 0,
      }}
    >
      KONTUUR
    </div>
  )
}

function StepStrip({
  steps,
  currentIndex,
  onStepClick,
}: {
  steps: Array<{ key: GenerateStep; label: string }>
  currentIndex: number
  onStepClick: (step: GenerateStep) => void
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
      {steps.map((step, i) => {
        const state = i < currentIndex ? 'done' : i === currentIndex ? 'active' : 'idle'
        const canClick = i < currentIndex
        return (
          <div key={step.key} style={{ display: 'contents' }}>
            <StepItem
              label={step.label}
              number={i + 1}
              state={state}
              onClick={canClick ? () => onStepClick(step.key) : undefined}
            />
            {i < steps.length - 1 && <StepConnector isDone={i < currentIndex} />}
          </div>
        )
      })}
    </div>
  )
}

function StepItem({
  label,
  number,
  state,
  onClick,
}: {
  label: string
  number: number
  state: 'done' | 'active' | 'idle'
  onClick?: () => void
}) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '6px 14px',
        borderRadius: '7px',
        flexShrink: 0,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'all 0.15s',
      }}
    >
      <StepCircle state={state} number={number} />
      <span
        style={{
          fontSize: '12px',
          fontWeight: 500,
          color: state === 'done' ? '#8A8070' : state === 'active' ? '#1A2630' : 'rgba(138,128,112,0.5)',
        }}
      >
        {label}
      </span>
    </div>
  )
}

function StepCircle({ state, number }: { state: 'done' | 'active' | 'idle'; number: number }) {
  return (
    <div
      style={{
        width: '22px',
        height: '22px',
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '10px',
        fontWeight: 600,
        flexShrink: 0,
        background:
          state === 'done' ? 'rgba(90,138,74,0.12)' : state === 'active' ? '#C07B55' : 'rgba(44,62,80,0.07)',
        color: state === 'done' ? '#5A8A4A' : state === 'active' ? '#fff' : '#8A8070',
      }}
    >
      {state === 'done' ? '✓' : number}
    </div>
  )
}

function StepConnector({ isDone }: { isDone: boolean }) {
  return (
    <div
      style={{
        flex: 1,
        height: '1px',
        margin: '0 4px',
        minWidth: '16px',
        maxWidth: '52px',
        background: isDone ? 'rgba(90,138,74,0.25)' : 'rgba(44,62,80,0.10)',
      }}
    />
  )
}

function CancelButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        marginLeft: 'auto',
        fontSize: '12px',
        fontWeight: 500,
        color: '#8A8070',
        background: 'none',
        border: '0.5px solid rgba(44,62,80,0.14)',
        borderRadius: '7px',
        cursor: 'pointer',
        padding: '6px 14px',
        fontFamily: 'inherit',
        transition: 'all 0.15s',
        flexShrink: 0,
      }}
    >
      Cancel
    </button>
  )
}
