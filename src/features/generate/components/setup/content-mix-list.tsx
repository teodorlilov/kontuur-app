import { cn } from '@/utils/cn'
import { getPillarColor } from '@/components/ui/colors/identity-colors'
import type { PillarAllocation } from '@/features/generate/lib/run-plan'

interface ContentMixListProps {
  allocation: PillarAllocation[]
  /** Priority briefs riding ahead of the researched mix; 0 hides the row. */
  briefCount?: number
}

/**
 * The run's content mix on Pine Deep — the briefs row, then one row per pillar
 * with its count always visible and the coverage caveat as an annotation under
 * the row. Shared by the generate run panel and the sources rail so the two
 * surfaces cannot drift apart in vocabulary.
 */
export function ContentMixList({ allocation, briefCount = 0 }: ContentMixListProps) {
  // A run smaller than its covered pillars cannot honestly name which pillar
  // gets each post — the server rotates the marginal posts by weight and
  // recent history. A number would hop between configurations and read as a
  // promise, so those runs state the rotation rule instead of a count.
  const fedRows = allocation.filter((a) => a.coverage !== 'none')
  const rotates = fedRows.length > 0 && fedRows.some((a) => a.count === 0)

  return (
    <div>
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
      {allocation.map(({ pillar, count, coverage }) => (
        <div key={pillar.id}>
          <div className="flex items-center gap-2 py-1 text-caption">
            <span
              aria-hidden
              className={cn(
                'size-2 flex-none rounded-full',
                // Hatching says absence — an unfed pillar's dot is an empty
                // slot, not a coloured mark.
                coverage === 'none' &&
                  'slot-open-inv shadow-[inset_0_0_0_1px_rgba(242,245,241,0.3)]'
              )}
              // The identity hue lightened toward the on-dark off-white:
              // Forest at full strength is 1.2:1 on Pine Deep — invisible.
              // Computed because the palette is a token list, not classes.
              style={
                coverage !== 'none'
                  ? {
                      background: `color-mix(in srgb, ${getPillarColor(pillar.pillar).hex} 45%, var(--ink-inv))`,
                    }
                  : undefined
              }
            />
            <span className={cn('min-w-0 flex-1 truncate', coverage === 'none' && 'text-ink-inv/45')}>
              {pillar.pillar}
              {/* Compressed to a tag: the full "if nothing lands" sentence per row
                  drowned the list when most pillars shared the state — the panel
                  footnote explains it once. */}
              {coverage === 'web' && <span className="text-micro text-ink-inv/45"> · web only</span>}
            </span>
            <span
              className={cn(
                'flex-none tabular-nums',
                !rotates && count > 0 ? 'text-ink-inv/70' : 'text-ink-inv/45'
              )}
            >
              {coverage === 'none'
                ? '—'
                : rotates
                  ? 'takes turns'
                  : count === 0
                    ? '—'
                    : `${count} post${count === 1 ? '' : 's'}`}
            </span>
          </div>
          {coverage === 'none' && (
            <p className="mb-1 ml-4 text-micro text-pending-lite">skipped — nothing feeds it</p>
          )}
        </div>
      ))}
      {rotates && (
        <p className="mt-2 text-micro text-ink-inv/60">
          Too few posts to cover every pillar each run — covered pillars take turns, weighted by
          their share.
        </p>
      )}
    </div>
  )
}
