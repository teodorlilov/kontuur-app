'use client'

import { WizardTopbar } from './wizard-topbar'

export type GenerateStep = 'client' | 'priority' | 'type' | 'loading' | 'results'

interface GenerateShellProps {
  currentStep: GenerateStep
  onCancel: () => void
  onStepClick: (step: GenerateStep) => void
  children: React.ReactNode
}

/** Topbar chrome with step indicators for the generate flow. Hidden on results step. */
export function GenerateShell({ currentStep, onCancel, onStepClick, children }: GenerateShellProps) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {currentStep !== 'results' && (
        <WizardTopbar currentStep={currentStep} onStepClick={onStepClick} onCancel={onCancel} />
      )}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>{children}</div>
    </div>
  )
}
