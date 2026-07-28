'use client'

import { Button } from '@/components/ui/button'
import type { StepperSummary } from '@/features/sources/types'

interface OnboardingSuccessProps {
  clientName: string
  summary: StepperSummary
  onGenerate: () => void
  onViewSources: () => void
}

function buildRecap(summary: StepperSummary): string {
  const parts: string[] = []
  if (summary.hasWebsite) {
    parts.push(summary.pageCount > 0 ? `Website · ${summary.pageCount} pages` : 'Website')
  }
  if (summary.feedCount > 0) {
    parts.push(`${summary.feedCount} news feed${summary.feedCount === 1 ? '' : 's'}`)
  }
  if (summary.documentCount > 0) {
    parts.push(`${summary.documentCount} document${summary.documentCount === 1 ? '' : 's'}`)
  }
  if (summary.webSearchEnabled) parts.push('Web research on')
  return parts.join('  —  ')
}

/** Full-screen overlay marking a finished client onboarding, with the generate-first-ideas payoff CTA. */
export function OnboardingSuccess({
  clientName,
  summary,
  onGenerate,
  onViewSources,
}: OnboardingSuccessProps) {
  const recap = buildRecap(summary)

  return (
    <div
      className="onboarding-success-overlay fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'var(--color-page)', animation: 'fade-in 250ms ease' }}
      role="dialog"
      aria-label="Onboarding complete"
    >
      <div className="flex flex-col items-center text-center px-6 max-w-md">
        <div
          className="flex items-center justify-center rounded-full"
          style={{
            width: 72,
            height: 72,
            background: 'var(--color-brand-light)',
            animation: 'scale-in 350ms ease both',
          }}
        >
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M4.5 12.5l5 5 10-11"
              stroke="var(--color-brand)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="48"
              strokeDashoffset="48"
              style={{ animation: 'draw-check 500ms ease 250ms forwards' }}
            />
          </svg>
        </div>

        <h2
          className="mt-6"
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 30,
            fontWeight: 400,
            color: 'var(--color-text-1)',
            letterSpacing: '-0.02em',
            animation: 'fade-up 350ms ease 150ms both',
          }}
        >
          {clientName} is ready
        </h2>

        <p
          className="mt-3 text-sm"
          style={{ color: 'var(--color-text-2)', animation: 'fade-up 350ms ease 250ms both' }}
        >
          {recap.length > 0
            ? recap
            : 'You can add sources anytime from Content sources.'}
        </p>

        <div
          className="mt-8 flex flex-col items-center gap-3"
          style={{ animation: 'fade-up 350ms ease 350ms both' }}
        >
          <Button size="lg" onClick={onGenerate}>
            Generate first post ideas
          </Button>
          <Button variant="ghost" size="sm" onClick={onViewSources}>
            Review sources instead
          </Button>
        </div>
      </div>
    </div>
  )
}
