'use client'

import { Check } from 'lucide-react'
import { cn } from '@/utils/cn'

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
      className="px-4 md:px-8"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        minHeight: '52px',
        background: 'var(--surface)',
        borderBottom: '1px solid var(--line)',
        flexShrink: 0,
        gap: 8,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', minWidth: 0, flexShrink: 1 }}>
        <div
          className="hidden font-display text-title font-normal text-ink md:block"
          style={{
            // A logotype, not type: the 3px is letterform spacing in a wordmark,
            // so it does not answer to --text-title's tracking.
            letterSpacing: '3px',
            paddingRight: '16px',
            borderRight: '1px solid var(--line)',
            marginRight: '8px',
          }}
        >
          KONTUUR
        </div>
        <span
          className="min-w-0 truncate text-caption text-text2"
          style={{ whiteSpace: 'nowrap' }}
        >
          {subtitle}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, overflow: 'hidden' }}>
        <StepIndicator steps={steps} activeIndex={activeIndex} />
        <button
          type="button"
          onClick={onCancel}
          className="cursor-pointer border-none bg-none px-0 py-1.5 font-sans text-caption text-text2"
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
              className={cn(
                'hidden text-micro sm:inline',
                isActive ? 'font-medium' : 'font-normal',
                isDone || isActive ? 'text-ink' : 'text-text3'
              )}
            >
              {step.label}
            </span>
            {i < steps.length - 1 && (
              <div
                style={{
                  width: '16px',
                  height: '1px',
                  background: isDone ? 'var(--forest)' : 'var(--line)',
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
          // Deep Pine, not spring: white on spring is 3.38:1 and fails.
          background: 'var(--forest)',
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
        // The wizard's lime: the step you are standing on. This is how lime
        // reaches /generate and /clients/new, which have no sidebar.
        background: isActive ? 'var(--accent)' : 'var(--sunken)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <span
        className={cn(
          // tracking-normal because --text-label carries +0.16em for multi-character
          // labels; on a single centred digit that is trailing space.
          'text-label font-semibold tracking-normal',
          isActive ? 'text-forest-deep' : 'text-text3'
        )}
      >
        {index + 1}
      </span>
    </div>
  )
}

function ProgressLine({ percent }: { percent: number }) {
  return (
    <div style={{ height: '2px', background: 'var(--line)', flexShrink: 0 }}>
      <div
        style={{
          height: '100%',
          // Deep Pine, deliberately not lime: a 2px lime line on --line is ~1.3:1
          // and would vanish. See DESIGN.md § Don't paint a lime rule on light.
          background: 'var(--forest)',
          // scaleX, not width — animating width lays out every frame, which
          // DESIGN.md rules out. transform-origin pins the growth to the left.
          width: '100%',
          transformOrigin: 'left',
          transform: `scaleX(${percent / 100})`,
          transition: 'transform 0.4s var(--ease-contour)',
        }}
      />
    </div>
  )
}
