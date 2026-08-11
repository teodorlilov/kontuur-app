import type { ResearchTopic } from '@/ai/research/types'
import type { Theme } from './types'

/** Longest a derived theme title runs before it is cut. */
const THEME_TITLE_MAX = 60

/**
 * A theme title derived from the user's own words, for the case where planning
 * produced no topic for a brief.
 *
 * Breaks on a word boundary. Distinct from `truncateText`, which is character-exact
 * because one of its callers truncates URLs — a title cut mid-word becomes the
 * draft's heading in the review queue, which is what `ideaText.slice(0, 60)` used
 * to produce.
 */
export function toThemeTitle(text: string): string {
  const cleaned = text.replace(/\s+/g, ' ').trim()
  if (cleaned.length <= THEME_TITLE_MAX) return cleaned

  const cut = cleaned.slice(0, THEME_TITLE_MAX)
  const lastSpace = cut.lastIndexOf(' ')
  // A single word longer than the cap has no boundary to break on; keep the hard cut
  // rather than returning an empty title.
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trimEnd() + '…'
}

/**
 * Adapt a planned topic into the shape generation writes from.
 *
 * Lives in `generation/` rather than `research/` because this is the consumer
 * adapting to the producer: research owns the stable contract, and generation is
 * what needs it in a different shape. It is also the only edge between the two
 * modules — they are otherwise fully decoupled — so its direction is deliberate.
 *
 * Previously written out at each call site, which is how the two copies drifted:
 * one coalesced `pillar` to undefined and the other did not.
 */
export function toTheme(topic: ResearchTopic): Theme {
  return {
    description: topic.suggested_theme,
    count: 1,
    pillar: topic.pillar ?? undefined,
    sourceUrl: topic.source_url,
    sourceTitle: topic.source_title,
    sourceType: topic.source_type ?? undefined,
    sourceExcerpt: topic.source_excerpt,
    sourceFullText: topic.source_full_text,
    clientSourceId: topic.client_source_id ?? null,
  }
}
