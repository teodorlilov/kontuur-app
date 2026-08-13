'use client'

import { Check } from 'lucide-react'
import { cn } from '@/utils/cn'
import { useSectionLoop } from '../../hooks/use-section-loop'
import { SplitBand } from './section'

/**
 * The graduated capsule rhythm from the dashboard's coverage strip — Surface
 * Lime, Sage, then Pine Deep. Decoration keyed to the row's own place in the
 * list, which is fixed, so it never reads as data (DESIGN.md § Stable Rhythm).
 */
const ROWS = [
  {
    time: 'Mon 09:00',
    title: '5 seasonal specials worth trying',
    platforms: ['IG'],
    tier: 'bg-lime text-ink',
  },
  {
    time: 'Tue 12:30',
    title: 'Protein myths, part two',
    platforms: ['IG', 'FB'],
    tier: 'bg-sage text-ink',
  },
  {
    time: 'Thu 11:00',
    title: 'Behind the seams — atelier week',
    platforms: ['IG'],
    tier: 'surface-dark text-ink-inv',
  },
] as const

/** Nothing published → one → two → all three. */
const HOLDS = [1300, 1300, 1300, 5200] as const

export function Autopilot() {
  const { ref, phase } = useSectionLoop<HTMLDivElement>({ holds: HOLDS })

  return (
    <SplitBand
      id="autopilot"
      eyebrow="Autopilot"
      title={
        <>
          Schedule once. It <em>publishes itself</em>
        </>
      }
      note="Approved posts go out to Instagram and Facebook at exactly the right time, every time — while you're doing literally anything else. The calendar shows every client's week at a glance."
      visual={
        <div
          ref={ref}
          aria-hidden="true"
          className="mx-auto flex w-full max-w-[560px] flex-col gap-3 rounded-card border border-ink/[0.05] bg-surface p-8"
        >
          {ROWS.map((row, index) => {
            const published = phase > index
            const dark = row.tier.startsWith('surface-dark')
            return (
              <div
                key={row.time}
                className={cn(
                  'flex flex-wrap items-center gap-3 rounded-panel px-4 py-3.5',
                  row.tier
                )}
              >
                <span
                  className={cn(
                    'text-caption tabular-nums',
                    dark ? 'text-ink-inv/70' : 'text-text2'
                  )}
                >
                  {row.time}
                </span>
                <span className="min-w-0 flex-1 truncate text-body font-medium">{row.title}</span>
                <span className="flex gap-1">
                  {row.platforms.map((platform) => (
                    <span
                      key={platform}
                      className={cn(
                        'rounded-xs px-1.5 py-0.5 text-micro font-semibold',
                        dark ? 'bg-ink-inv/12 text-ink-inv' : 'bg-surface/70 text-forest'
                      )}
                    >
                      {platform}
                    </span>
                  ))}
                </span>
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-micro font-semibold transition-colors duration-500 ease-contour',
                    published
                      ? dark
                        ? 'bg-accent text-forest-deep'
                        : 'bg-forest text-white'
                      : dark
                        ? 'bg-ink-inv/12 text-ink-inv/70'
                        : 'bg-surface/70 text-text2'
                  )}
                >
                  {published && <Check size={10} strokeWidth={2.6} aria-hidden />}
                  {published ? 'Published' : 'Scheduled'}
                </span>
              </div>
            )
          })}

          <p className="mt-2 text-caption text-text3">You were asleep for two of these.</p>
        </div>
      }
    />
  )
}
