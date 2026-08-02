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
      className="px-4 md:px-7"
      style={{
        height: '54px',
        background: '#fff',
        borderBottom: '1px solid rgba(15,21,18,0.10)',
        display: 'flex',
        alignItems: 'center',
        flexShrink: 0,
        boxShadow: '0 1px 0 rgba(15,21,18,0.05)',
      }}
    >
      <div className="hidden md:block">
        <LogoMark />
      </div>
      <StepStrip steps={STEPS} currentIndex={currentIndex} onStepClick={onStepClick} />
      <CancelButton onClick={onCancel} />
    </div>
  )
}

function LogoMark() {
  return (
    <div
      className="text-body"
      style={{
        fontFamily: 'var(--font-display, Georgia, serif)',
        letterSpacing: '3px',
        color: 'var(--ink)',
        paddingRight: '20px',
        borderRight: '1px solid rgba(15,21,18,0.10)',
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
        cursor: onClick ? 'pointer' : 'default',
        transition: 'all 0.15s',
      }}
    >
      <StepCircle state={state} number={number} />
      <span
        className="text-caption hidden sm:inline"
        style={{
          fontWeight: 500,
          color:
            state === 'done'
              ? 'var(--text2)'
              : state === 'active'
                ? 'var(--forest-deep)'
                : 'rgba(15,21,18,0.5)',
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
      className="text-label tracking-normal"
      style={{
        width: '22px',
        height: '22px',
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 600,
        flexShrink: 0,
        background:
          state === 'done'
            ? 'rgba(46,158,104,0.12)'
            : state === 'active'
              ? 'var(--spring-text)'
              : 'rgba(15,21,18,0.07)',
        color:
          state === 'done' ? 'var(--spring-text)' : state === 'active' ? '#fff' : 'var(--text2)',
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
        background: isDone ? 'rgba(46,158,104,0.25)' : 'rgba(15,21,18,0.10)',
      }}
    />
  )
}

function CancelButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      className="text-caption"
      type="button"
      onClick={onClick}
      style={{
        marginLeft: 'auto',
        fontWeight: 500,
        color: 'var(--text2)',
        background: 'none',
        border: '1px solid rgba(15,21,18,0.14)',
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
