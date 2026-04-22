'use client'

import { Check } from 'lucide-react'

interface WizardStep {
  key: string
  label: string
}

interface WizardShellProps {
  steps: WizardStep[]
  currentStepIndex: number
  subtitle: string
  cancelLabel: string
  onCancel: () => void
  children: React.ReactNode
}

/** Shared topbar chrome with step indicators, progress line, and cancel button. */
export function WizardShell({
  steps,
  currentStepIndex,
  subtitle,
  cancelLabel,
  onCancel,
  children,
}: WizardShellProps) {
  const progressPercent = ((currentStepIndex + 1) / steps.length) * 100

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Topbar
        steps={steps}
        activeIndex={currentStepIndex}
        subtitle={subtitle}
        cancelLabel={cancelLabel}
        onCancel={onCancel}
      />
      <ProgressLine percent={progressPercent} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>{children}</div>
    </div>
  )
}

function Topbar({
  steps,
  activeIndex,
  subtitle,
  cancelLabel,
  onCancel,
}: {
  steps: WizardStep[]
  activeIndex: number
  subtitle: string
  cancelLabel: string
  onCancel: () => void
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 32px',
        height: '52px',
        background: 'var(--color-surface)',
        borderBottom: '0.5px solid var(--color-border-1)',
        flexShrink: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '15px',
            fontWeight: 400,
            color: 'var(--color-text-1)',
            letterSpacing: '3px',
            paddingRight: '16px',
            borderRight: '0.5px solid var(--color-border-1)',
            marginRight: '8px',
          }}
        >
          KONTUUR
        </div>
        <span style={{ fontSize: '12px', color: 'var(--color-muted)' }}>{subtitle}</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
        <StepIndicator steps={steps} activeIndex={activeIndex} />
        <button
          type="button"
          onClick={onCancel}
          style={{
            fontSize: '12px',
            color: 'var(--color-muted)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontFamily: 'var(--font-sans)',
            padding: '6px 0',
          }}
        >
          {cancelLabel}
        </button>
      </div>
    </div>
  )
}

function StepIndicator({ steps, activeIndex }: { steps: WizardStep[]; activeIndex: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      {steps.map((step, i) => {
        const isDone = i < activeIndex
        const isActive = i === activeIndex
        return (
          <div key={step.key} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <StepDot isDone={isDone} isActive={isActive} index={i} />
            <span
              style={{
                fontSize: '11px',
                fontWeight: isActive ? 500 : 400,
                color: isDone || isActive ? 'var(--color-text-1)' : 'var(--color-text-3)',
              }}
            >
              {step.label}
            </span>
            {i < steps.length - 1 && (
              <div
                style={{
                  width: '16px',
                  height: '0.5px',
                  background: isDone ? 'var(--status-ok)' : 'var(--color-border-1)',
                  marginLeft: '2px',
                  marginRight: '2px',
                }}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

function StepDot({
  isDone,
  isActive,
  index,
}: {
  isDone: boolean
  isActive: boolean
  index: number
}) {
  if (isDone) {
    return (
      <div
        style={{
          width: '16px',
          height: '16px',
          borderRadius: '50%',
          background: 'var(--status-ok)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Check size={9} color="#fff" strokeWidth={2.5} />
      </div>
    )
  }

  return (
    <div
      style={{
        width: '16px',
        height: '16px',
        borderRadius: '50%',
        background: isActive ? 'var(--color-terracotta)' : 'rgba(44,62,80,0.15)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <span
        style={{
          fontSize: '9px',
          fontWeight: 600,
          color: isActive ? '#fff' : 'var(--color-text-3)',
        }}
      >
        {index + 1}
      </span>
    </div>
  )
}

function ProgressLine({ percent }: { percent: number }) {
  return (
    <div style={{ height: '2px', background: 'var(--color-border-1)', flexShrink: 0 }}>
      <div
        style={{
          height: '100%',
          background: 'var(--color-terracotta)',
          width: `${percent}%`,
          transition: 'width 0.4s ease',
        }}
      />
    </div>
  )
}
