'use client'

import { WizardShell } from '@/components/ui/wizard-shell'
import type { OnboardingStep } from '@/features/onboarding/types'

interface OnboardingShellProps {
  currentStep: OnboardingStep
  onCancel: () => void
  children: React.ReactNode
}

const STEPS = [
  { key: 'entry', label: 'Start' },
  { key: 'loading', label: 'Analyzing' },
  { key: 'interview', label: 'Interview' },
  { key: 'review', label: 'Review' },
] as const

const STEP_ORDER: Record<string, number> = {
  entry: 0,
  loading: 1,
  interview: 2,
  generating: 2,
  review: 3,
}

/** Topbar chrome with step indicator and progress line for the onboarding flow. */
export function OnboardingShell({ currentStep, onCancel, children }: OnboardingShellProps) {
  const activeIndex = STEP_ORDER[currentStep] ?? 0

  return (
    <WizardShell
      steps={STEPS as unknown as { key: string; label: string }[]}
      currentStepIndex={activeIndex}
      subtitle="New client onboarding"
      cancelLabel="Cancel onboarding"
      onCancel={onCancel}
    >
      {children}
    </WizardShell>
  )
}
