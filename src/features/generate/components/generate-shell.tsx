'use client'

import { WizardShell } from '@/components/ui/wizard-shell'

export type GenerateStep = 'client' | 'priority' | 'type' | 'loading' | 'results'

const STEPS = [
  { key: 'client', label: 'Client' },
  { key: 'priority', label: 'Priority' },
  { key: 'type', label: 'Post type' },
  { key: 'loading', label: 'Generating' },
  { key: 'results', label: 'Results' },
]

const STEP_INDEX: Record<GenerateStep, number> = {
  client: 0,
  priority: 1,
  type: 2,
  loading: 3,
  results: 4,
}

interface GenerateShellProps {
  currentStep: GenerateStep
  onCancel: () => void
  children: React.ReactNode
}

/** Topbar chrome with 5-step indicator and progress line for the generate flow. */
export function GenerateShell({ currentStep, onCancel, children }: GenerateShellProps) {
  return (
    <WizardShell
      steps={STEPS}
      currentStepIndex={STEP_INDEX[currentStep]}
      subtitle="Generate posts"
      cancelLabel="Cancel"
      onCancel={onCancel}
    >
      {children}
    </WizardShell>
  )
}
