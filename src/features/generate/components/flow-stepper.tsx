'use client'

import { Check } from 'lucide-react'
import { cn } from '@/utils/cn'

export type FlowStep = 'setup' | 'generating' | 'review' | 'done'

const STEPS: Array<{ n: 1 | 2 | 3; label: string }> = [
  { n: 1, label: 'Set up' },
  { n: 2, label: 'Generating' },
  { n: 3, label: 'Review' },
]

/** Where the flow stands, as a 1-based rail position. Done sits on step 3. */
export function stepIndex(step: FlowStep): 1 | 2 | 3 {
  if (step === 'setup') return 1
  if (step === 'generating') return 2
  return 3
}

interface FlowStepperProps {
  step: FlowStep
  /** Fires only for step 1, and only when the flow is past it (not on Done). */
  onStepOneClick: () => void
}

/**
 * The header's three-step rail. The current step's plate is the header band's
 * one New Growth answer — where you are standing; the wordmark beside it is
 * the constant and exempt from the count (DESIGN.md § The Standing Place Rule).
 * A 22px plate clears the Small Present Rule's 16px floor and carries Pine
 * Deep at 10.87:1.
 */
export function FlowStepper({ step, onStepOneClick }: FlowStepperProps) {
  const here = stepIndex(step)

  return (
    <nav aria-label="Generation progress" className="flex min-w-0 flex-1 items-center gap-2">
      {STEPS.map(({ n, label }) => {
        const isCurrent = n === here && step !== 'done'
        const isDone = n < here || step === 'done'
        const clickable = n === 1 && isDone && step !== 'done'
        const Tag = clickable ? 'button' : 'span'
        return (
          <span key={n} className="contents">
            <Tag
              type={clickable ? 'button' : undefined}
              onClick={clickable ? onStepOneClick : undefined}
              aria-current={isCurrent ? 'step' : undefined}
              className={cn(
                'flex items-center gap-2 rounded-sm px-2 py-1.5 text-caption',
                isCurrent ? 'font-medium text-ink' : isDone ? 'text-text2' : 'text-text3',
                clickable &&
                  'transition-colors duration-150 ease-contour hover:bg-wash hover:text-ink',
                // On a phone the whole rail does not fit beside Cancel, and two
                // dimmed numerals say less than one named step.
                !isCurrent && 'max-md:hidden'
              )}
            >
              <span
                className={cn(
                  'grid size-[22px] flex-none place-items-center rounded-full text-micro font-semibold leading-none tabular-nums',
                  isCurrent
                    ? 'bg-accent text-forest-deep'
                    : isDone
                      ? 'bg-wash text-forest'
                      : 'bg-sunken text-text2'
                )}
              >
                {isDone ? <Check aria-hidden className="size-2.5" strokeWidth={2.4} /> : n}
              </span>
              {label}
            </Tag>
            {n < 3 && (
              <span
                aria-hidden
                className={cn(
                  'h-px w-6 flex-none max-md:hidden',
                  isDone ? 'bg-forest' : 'bg-line2'
                )}
              />
            )}
          </span>
        )
      })}
    </nav>
  )
}
