'use client'

import { Wordmark } from '@/components/layout/wordmark'
import { cn } from '@/utils/cn'

interface OnboardingShellProps {
  /** Review widens the column: the draft reads as one column while it is written, then opens to two. */
  wide?: boolean
  onCancel: () => void
  children: React.ReactNode
}

/**
 * The frame around adding a client.
 *
 * No step indicator: the flow is two steps — paste a site, check what it drafted — and a stepper
 * over two steps is chrome describing itself. This replaced `WizardShell`, whose progress line and
 * numbered dots were built for the five-step interview, and whose letter-spaced "KONTUUR" text
 * predated the real `Wordmark` component.
 */
export function OnboardingShell({ wide = false, onCancel, children }: OnboardingShellProps) {
  return (
    <div className="min-h-dvh bg-paper">
      <div
        className={cn(
          'mx-auto px-4 pb-32 pt-6 md:px-8',
          // Snaps rather than transitions: animating max-width on the container holding the whole
          // document is the layout thrash DESIGN.md rules out, and the sheet fades in on its own.
          wide ? 'max-w-[1180px]' : 'max-w-[840px]'
        )}
      >
        <div className="mb-4 flex h-10 items-center justify-between">
          <Wordmark href="/clients" />
          <button
            type="button"
            onClick={onCancel}
            className={cn(
              'rounded-sm px-2.5 py-2 text-caption text-text2',
              'transition-colors duration-150 ease-contour hover:bg-wash hover:text-ink',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-spring'
            )}
          >
            Cancel
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
