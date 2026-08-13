'use client'

import { cn } from '@/utils/cn'
import { useSectionLoop } from '../../hooks/use-section-loop'
import { useTypewriter } from '../../hooks/use-typewriter'
import { SplitBand } from './section'

/** Eight weeks of reach, with the peak the AI summary is about. */
const BARS = [32, 46, 38, 60, 50, 72, 90, 56] as const
const PEAK = 6

const SUMMARY = 'Reels beat static posts 3:1 for this client — schedule more video next month.'

/** Bars draw → the summary explains them. */
const HOLDS = [1500, 6200] as const

export function Analytics() {
  const { ref, phase } = useSectionLoop<HTMLDivElement>({ holds: HOLDS })
  const summary = useTypewriter(SUMMARY, phase >= 1)

  return (
    <SplitBand
      id="analytics"
      eyebrow="Analytics"
      title={
        <>
          Know what worked, <em>without digging</em>
        </>
      }
      note="Follower trends, top posts and audience insights for every client — with an AI summary that tells you what to do next, and a client-ready report in one click."
      visual={
        <div
          ref={ref}
          aria-hidden="true"
          className="mx-auto flex w-full max-w-[560px] flex-col gap-6 rounded-card border border-ink/[0.05] bg-surface p-8"
        >
          <div className="flex items-center justify-between">
            <span className="text-label uppercase text-text3">Last 30 days</span>
            <span className="rounded-full bg-wash px-2.5 py-1 text-micro font-semibold text-forest">
              AI summary
            </span>
          </div>

          <div className="flex h-[180px] items-end gap-2.5">
            {BARS.map((height, index) => (
              <span key={index} className="relative flex flex-1 items-end justify-center">
                {index === PEAK && (
                  // Lime as a ground carrying Pine Deep ink — 10.87:1, and the
                  // one place on this page the accent is allowed to shout.
                  <span
                    className={cn(
                      'absolute -top-7 whitespace-nowrap rounded-full bg-accent px-2 py-0.5 text-micro font-semibold text-forest-deep',
                      'transition-opacity duration-500 ease-contour motion-reduce:transition-none',
                      phase >= 1 ? 'opacity-100' : 'opacity-0'
                    )}
                  >
                    Reels · 3.1×
                  </span>
                )}
                <span
                  // Height encodes the value, so it is computed.
                  style={{ height: `${height}%`, transitionDelay: `${index * 70}ms` }}
                  className={cn(
                    'w-full origin-bottom rounded-md transition-transform duration-500 ease-contour motion-reduce:transition-none',
                    index === PEAK ? 'bg-forest' : index % 2 ? 'bg-sage' : 'bg-marker',
                    phase >= 0 ? 'scale-y-100' : 'scale-y-0'
                  )}
                />
              </span>
            ))}
          </div>

          <p className="min-h-[42px] text-body text-text2">
            {summary}
            {phase === 1 && summary.length < SUMMARY.length && (
              <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-spring" />
            )}
          </p>
        </div>
      }
    />
  )
}
