import { countDeltaVerdict } from '@/features/analytics/lib/compute/delta-verdict'
import { formatCount, signedCount } from '@/features/analytics/lib/compute/format'
import type { PostPlatform } from '@/lib/meta/platforms'
import type { StatPillTone } from '@/features/dashboard/types'

interface FollowersTileInput {
  network: PostPlatform
  /** Latest follower count in the window; null when the sync has never captured one. */
  total: number | null
  /** Followers gained minus lost over the window; null when neither side was captured. */
  net: number | null
  /** Instagram's accounts reached over the window. Pages have none. */
  reach: number | null
  /** Facebook's page engagements over the window — the nearest thing a Page has to reach. */
  engagements: number | null
}

/** What the Followers stat card renders: the figure, its pill, and the footer's fact. */
export interface FollowersTile {
  value: number
  pill?: { text: string; tone: StatPillTone }
  footer: string
}

const WINDOW = 'last 7 days'

/**
 * The Followers tile's words, from the analytics report's own ledger.
 *
 * The delta reuses the console's verdict (`countDeltaVerdict`): a move colours and states its
 * count, a change inside the noise band stays grey but still prints the number — a quiet verdict
 * never hides the absolute, and a flat week says so rather than printing "+0" — and no
 * comparison at all means no pill. The window is the report's
 * rolling seven full days ending yesterday, so the copy says "last 7 days", not "this week":
 * a Monday-to-today window would be empty every Monday. Null when the report has no follower
 * total to show, which the card treats as "render the tile that was there before".
 */
export function followersTile(input: FollowersTileInput): FollowersTile | null {
  if (input.total === null) return null

  const verdict =
    input.net === null
      ? { kind: 'none' as const }
      : countDeltaVerdict(input.total, input.total - input.net)
  const pill =
    verdict.kind === 'move'
      ? {
          text: `${verdict.diff > 0 ? '▲' : '▼'} ${signedCount(verdict.diff)} · ${WINDOW}`,
          tone: verdict.diff > 0 ? ('positive' as const) : ('danger' as const),
        }
      : verdict.kind === 'quiet'
        ? {
            text: `${verdict.diff === 0 ? 'No change' : signedCount(verdict.diff)} · ${WINDOW}`,
            tone: 'muted' as const,
          }
        : undefined

  const fact =
    input.network === 'instagram'
      ? input.reach === null
        ? null
        : `Reach ${formatCount(input.reach)}`
      : input.engagements === null
        ? null
        : `${formatCount(input.engagements)} engagements`

  return { value: input.total, pill, footer: fact ? `${fact} · ${WINDOW}` : WINDOW }
}
