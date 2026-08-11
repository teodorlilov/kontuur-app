'use client'

import Link from 'next/link'
import { cn } from '@/utils/cn'
import { Button } from '@/components/ui/button'
import { getPillarColor } from '@/components/ui/colors/pillar-colors'
import type { RunPlan } from '@/features/generate/lib/run-plan'

interface RunPanelProps {
  runPlan: RunPlan
  /** Researched posts — what the pillar allocation splits. */
  postCount: number
  /** Priority briefs riding on top; the server writes postCount + briefCount. */
  briefCount: number
  metaLine: string
  clientId: string
  generating: boolean
  onGenerate: () => void
}

/**
 * The dark capsule answering "what will this run produce". On Pine Deep the
 * lime relationship inverts and New Growth becomes the figure — the count and
 * the Generate button are the field band's one lime answer: the commitment.
 */
export function RunPanel({
  runPlan,
  postCount,
  briefCount,
  metaLine,
  clientId,
  generating,
  onGenerate,
}: RunPanelProps) {
  const { publishState, webResearchActive, starvedPillars, skipMode } = runPlan
  // The headline promises what actually lands — briefs write extra posts.
  const totalCount = postCount + briefCount

  return (
    <aside className="surface-dark-capsule flex flex-col overflow-hidden rounded-card bg-forest-deep text-ink-inv shadow-dark lg:sticky lg:top-6">
      <div className="border-b border-white/10 p-5 pb-4">
        <p className="text-label font-semibold uppercase text-ink-inv/55">This run</p>
        <p className="mt-2 text-metric font-semibold tabular-nums text-accent">
          {totalCount} post{totalCount === 1 ? '' : 's'}
        </p>
        <p className="mt-1 text-caption text-ink-inv/70">{metaLine}</p>
      </div>

      <div className="flex flex-col p-5 pt-4">
        <CapsuleRow label="Drafts land in" value="Review queue" />
        {/* No idea-flow special case. This said "From your brief" and suppressed the
            good state, which was true when an idea bypassed research entirely. An
            idea is now a locked priority brief planned in the same pass as every
            other topic — including a focus web query of its own — so the panel was
            reporting no research while a live search decided the outcome. */}
        <CapsuleRow
          label="Research"
          value={webResearchActive ? 'Sources + web' : 'Sources only'}
          good={webResearchActive}
        />
        <CapsuleRow label="Visuals" value="Composed per slide" />
        <CapsuleRow
          label="Publishing"
          value={
            publishState.kind === 'connected' ? (
              'Connected'
            ) : publishState.kind === 'manual' ? (
              'Manual — copy out'
            ) : (
              <Link
                href={`/clients/${clientId}/edit?tab=accounts`}
                className="text-accent underline decoration-accent/40 underline-offset-2"
              >
                Connect first
              </Link>
            )
          }
          good={publishState.kind === 'connected'}
        />

        <div className="mt-4 border-t border-white/10 pt-4">
          <p className="mb-2 text-label font-semibold uppercase text-ink-inv/45">Content mix</p>
              {/* Briefs first — they are written ahead of the researched mix,
                  and with this row the mix sums to the headline count. */}
              {briefCount > 0 && (
                <div className="flex items-center gap-2 py-1 text-caption">
                  <span aria-hidden className="size-2 flex-none rounded-full bg-ink-inv/60" />
                  <span className="min-w-0 flex-1 truncate">Priority briefs</span>
                  <span className="flex-none tabular-nums text-ink-inv/70">
                    {briefCount} post{briefCount === 1 ? '' : 's'}
                  </span>
                </div>
              )}
              {runPlan.allocation.map(({ pillar, count, hasSources }) => (
                <div key={pillar.id} className="flex items-center gap-2 py-1 text-caption">
                  <span
                    aria-hidden
                    className={cn(
                      'size-2 flex-none rounded-full',
                      // Hatching says absence — a starved pillar's dot is an
                      // empty slot, not a coloured mark.
                      !hasSources && 'slot-open-inv shadow-[inset_0_0_0_1px_rgba(242,245,241,0.3)]'
                    )}
                    // The identity hue lightened toward the on-dark off-white:
                    // Forest at full strength is 1.2:1 on Pine Deep — invisible.
                    // Computed because the palette is a token list, not classes.
                    style={
                      hasSources
                        ? {
                            background: `color-mix(in srgb, ${getPillarColor(pillar.pillar).hex} 45%, var(--ink-inv))`,
                          }
                        : undefined
                    }
                  />
                  <span className={cn('min-w-0 flex-1 truncate', !hasSources && 'text-ink-inv/45')}>
                    {pillar.pillar}
                  </span>
                  <span
                    className={cn(
                      'flex-none tabular-nums',
                      hasSources && count > 0 ? 'text-ink-inv/70' : 'text-ink-inv/45'
                    )}
                  >
                    {!hasSources ? 'no sources' : count === 0 ? '—' : `${count} post${count === 1 ? '' : 's'}`}
                  </span>
                </div>
              ))}
              <p className="mt-3 text-micro text-ink-inv/60">
                {starvedPillars.length === 0 ? (
                  'Weighted by this client’s pillars. Research decides the final split.'
                ) : (
                  <>
                    {starvedPillars.length} pillar{starvedPillars.length === 1 ? ' has' : 's have'} no
                    sources of {starvedPillars.length === 1 ? 'its' : 'their'} own.{' '}
                    {skipMode === 'soft'
                      ? 'Web research will look; if nothing lands, it is skipped. '
                      : 'Web research is off for this client, so it will be skipped. '}
                    <Link
                      href={`/clients/${clientId}/sources`}
                      className="text-spring-lite underline decoration-spring-lite/40 underline-offset-2"
                    >
                      Add a source
                    </Link>
                  </>
                )}
              </p>
        </div>
      </div>

      <div className="mt-auto p-5 pt-0">
        <Button
          size="lg"
          loading={generating}
          onClick={onGenerate}
          // 0 is expressible (briefs-only runs) but not runnable: a zero-post run
          // opens a generation_runs row just to fail with a misleading error.
          disabled={totalCount === 0}
          className="w-full bg-accent text-forest-deep hover:bg-accent-deep hover:shadow-none"
        >
          Generate {totalCount} post{totalCount === 1 ? '' : 's'}
        </Button>
        <p className="mt-3 text-center text-micro text-ink-inv/55">
          Nothing publishes from here. You review every draft first.
        </p>
      </div>
    </aside>
  )
}

function CapsuleRow({
  label,
  value,
  good,
}: {
  label: string
  value: React.ReactNode
  good?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 text-caption">
      <span className="text-ink-inv/55">{label}</span>
      {/* Living Green Lite is the green that stays legible on Pine Deep. */}
      <span className={cn('text-right font-medium', good ? 'text-spring-lite' : 'text-ink-inv')}>
        {value}
      </span>
    </div>
  )
}
