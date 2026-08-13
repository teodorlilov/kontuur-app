'use client'

import { Check } from 'lucide-react'
import { cn } from '@/utils/cn'
import { useSectionLoop } from '../../hooks/use-section-loop'
import { SplitBand } from './section'

/** The week that Kontuur deletes, in the words agencies use for it. */
const PAINS = [
  'A blank page for every client, every Monday',
  "Visuals that need a designer you don't have time to brief",
  'Approvals lost in WhatsApp threads and screenshots',
  "Posting times missed while you're in meetings",
  'Reports assembled by hand at month-end',
] as const

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] as const

/**
 * Ten chips, one per job the week actually contains, each landing on the day it
 * belongs to. Scatter offsets are hand-placed rather than random so the mess
 * reads as a mess and not as noise, and so it looks the same every loop.
 */
const CHIPS = [
  { label: 'Reel due today', urgent: true, day: 0, x: -6, y: -34, rot: -6 },
  { label: 'Caption still empty', urgent: false, day: 0, x: 118, y: -52, rot: 4 },
  { label: 'Client: “tweak it?”', urgent: true, day: 1, x: 152, y: 6, rot: -3 },
  { label: 'No visual yet', urgent: false, day: 1, x: -22, y: 52, rot: 7 },
  { label: 'Approvals stuck · 3', urgent: false, day: 2, x: 128, y: 62, rot: -5 },
  { label: 'Idea buried in email', urgent: true, day: 2, x: -14, y: 104, rot: 4 },
  { label: 'What to post next week?', urgent: false, day: 3, x: 64, y: 8, rot: 3 },
  { label: 'Hashtags again', urgent: true, day: 3, x: 168, y: 96, rot: 5 },
  { label: 'Report due Friday', urgent: false, day: 4, x: 40, y: 130, rot: -4 },
  { label: '9 tabs open', urgent: true, day: 4, x: 176, y: 148, rot: 6 },
] as const

/** Scattered, then composed. Two phases is all the idea needs. */
const HOLDS = [1400, 6400] as const

const ROW_HEIGHT = 54
/** Where the day rows start inside the card — header plus its padding. */
const ROWS_TOP = 62

export function Problem() {
  const { ref, phase } = useSectionLoop<HTMLDivElement>({ holds: HOLDS })
  const composed = phase === 1

  return (
    <SplitBand
      id="calm"
      eyebrow="The problem"
      title={
        <>
          Every week, every client, <em>from a blank page</em>
        </>
      }
      note="Running social for clients means doing the whole job — writing, designing, approvals, scheduling, reporting — multiplied by every brand you manage. It looks like this:"
      aside={
        <>
          <ul className="mt-5 flex list-none flex-col gap-2.5">
            {PAINS.map((pain, index) => (
              <li key={pain} className="flex gap-3 text-body text-text2">
                <span
                  aria-hidden
                  className={cn(
                    'mt-2 size-[7px] flex-none rounded-full',
                    index % 2 === 0 ? 'bg-danger' : 'bg-pending'
                  )}
                />
                {pain}
              </li>
            ))}
          </ul>
          <p
            className={cn(
              'mt-5 text-title text-ink',
              'transition-[opacity,transform] duration-500 ease-contour motion-reduce:transition-none',
              composed ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'
            )}
          >
            Kontuur deletes that week.{' '}
            <em className="relative isolate whitespace-nowrap font-display font-normal italic text-forest before:absolute before:-left-[0.06em] before:-right-[0.08em] before:bottom-[0.03em] before:-z-10 before:h-[0.44em] before:-skew-x-12 before:bg-marker before:content-['']">
              All of it.
            </em>
          </p>
        </>
      }
      visual={<ChaosStage stageRef={ref} composed={composed} />}
    />
  )
}

function ChaosStage({
  stageRef,
  composed,
}: {
  stageRef: React.Ref<HTMLDivElement>
  composed: boolean
}) {
  return (
    <div
      ref={stageRef}
      // The whole thing is an illustration of the paragraph beside it; a screen
      // reader gains nothing from ten floating chips and a fake calendar.
      aria-hidden="true"
      className="relative mx-auto h-[420px] w-full max-w-[520px]"
    >
      <div className="absolute inset-x-0 bottom-0 rounded-card border border-ink/[0.05] bg-surface p-5">
        <div className="flex items-center justify-between">
          <span className="text-label uppercase text-text3">This week</span>
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full bg-wash px-2 py-1 text-micro font-semibold text-forest',
              'transition-[opacity,transform] duration-300 ease-contour motion-reduce:transition-none',
              composed ? 'scale-100 opacity-100' : 'scale-90 opacity-0'
            )}
          >
            <Check size={11} strokeWidth={2.4} />
            Composed
          </span>
        </div>

        <div className="mt-3">
          {DAYS.map((day) => (
            <div key={day} className="flex h-[54px] items-center gap-3">
              <span className="w-8 flex-none text-caption text-text3">{day}</span>
              <span
                className={cn(
                  'slot-open h-9 flex-1 rounded-md border border-line transition-colors duration-500 ease-contour',
                  composed && 'border-transparent bg-wash [background-image:none]'
                )}
              />
            </div>
          ))}
        </div>
      </div>

      {CHIPS.map((chip, index) => (
        <span
          key={chip.label}
          style={{
            // Computed transforms — scattered coordinates on one side, the day
            // row on the other. The stagger is the index so the mess resolves
            // in a sweep rather than all at once.
            transform: composed
              ? `translate(52px, ${ROWS_TOP + chip.day * ROW_HEIGHT}px) rotate(0deg)`
              : `translate(${chip.x}px, ${chip.y}px) rotate(${chip.rot}deg)`,
            transitionDelay: `${index * (composed ? 90 : 50)}ms`,
          }}
          className={cn(
            'absolute left-0 top-0 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-caption shadow-pop',
            'transition-[transform,opacity,background-color] duration-[850ms] ease-contour motion-reduce:transition-none',
            composed
              ? 'border-transparent bg-wash text-forest opacity-0'
              : 'border-ink/[0.05] bg-surface text-text2 opacity-100'
          )}
        >
          <span
            className={cn(
              'size-[6px] flex-none rounded-full transition-colors duration-500',
              composed ? 'bg-spring' : chip.urgent ? 'bg-danger' : 'bg-pending'
            )}
          />
          {chip.label}
        </span>
      ))}
    </div>
  )
}
