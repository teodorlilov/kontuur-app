import { ensurePillarIds, type WeightedPillar } from '@/lib/clients/content-pillars'
import { normalizeForCompare } from '@/utils/format'
import { describeClearedPillarScoping } from '@/features/clients/lib/pillar-notice'
import { describeLanguage } from '@/features/clients/lib/client-draft'
import type { BrandDraft, ClientDraft } from '@/features/clients/lib/client-draft'
import type { UrlAnalysisResponse } from '@/types/api'

export type SuggestionId = 'niche' | 'audience' | 'tone' | 'language' | 'avoid' | 'pillars'

export interface BrandSuggestion {
  id: SuggestionId
  label: string
  /** What the form holds now, rendered for the row. Empty when the field has never been filled. */
  current: string
  /** What this read produced. Never empty — a field the read could not fill is not a suggestion. */
  suggested: string
  /** Applied to the open drafts if the row is accepted. Split by group, as the form stores them. */
  patch: { client?: Partial<ClientDraft>; brand?: Partial<BrandDraft> }
  /**
   * Both sides again, structurally, on the one row whose value is a weighted set rather than a
   * sentence. Four pillars joined into a line are unreadable as a comparison — the strings above
   * stay because the difference check and the empty check are still done on them.
   */
  parts?: { current: readonly WeightedPillar[]; suggested: readonly WeightedPillar[] }
  /** What accepting this row costs elsewhere. Shown only while the row is ticked. */
  warning?: string
}

/** The drafts a suggestion is measured against — the two groups a website read can speak to. */
interface CurrentDrafts {
  client: Pick<ClientDraft, 'niche' | 'language'>
  brand: Pick<BrandDraft, 'targetAudience' | 'tone' | 'avoidTopics' | 'languageFormality'> & {
    contentPillars: readonly WeightedPillar[]
  }
}

/**
 * Turns one website read into the changes it proposes for an existing client.
 *
 * Only fields the read actually produced *and* that differ from what is on the form become rows:
 * a list that restates six values the client already has reads as six decisions to make, and
 * hides the one that matters. Nothing here mutates a draft — the caller applies the rows a human
 * ticked.
 *
 * Two fields the read returns are deliberately absent. The business name, because a re-read is
 * not a rename and a model that misreads a page title should not be able to propose one. The
 * health-niche flag, because it gates medical guidelines and published disclaimers: turning that
 * off belongs in the Basic info toggle where its consequence is spelled out, not in a list where
 * "Apply" ticks it away.
 */
export function buildBrandSuggestions(
  analysis: UrlAnalysisResponse,
  current: CurrentDrafts,
  /** Effective pillar ids of each scoped content source, for the pillar row's consequence line. */
  restrictedSourcePillarIds: ReadonlyArray<readonly string[]> = []
): BrandSuggestion[] {
  const suggestions: BrandSuggestion[] = []

  const add = (
    id: SuggestionId,
    label: string,
    currentValue: string,
    suggested: string,
    patch: BrandSuggestion['patch'],
    extra?: Pick<BrandSuggestion, 'parts' | 'warning'>
  ) => {
    if (!suggested.trim()) return
    if (equivalent(currentValue, suggested)) return
    suggestions.push({ id, label, current: currentValue, suggested, patch, ...extra })
  }

  add('niche', 'Niche', current.client.niche, analysis.detected_niche, {
    client: { niche: analysis.detected_niche },
  })

  const audience = analysis.detected_target_audience.join(', ')
  add('audience', 'Target audience', current.brand.targetAudience, audience, {
    brand: { targetAudience: audience },
  })

  add('tone', 'Brand tone', current.brand.tone, analysis.detected_tone, {
    brand: { tone: analysis.detected_tone },
  })

  // Formality travels with the language it was measured in, the same pairing the onboarding draft
  // makes — a Bulgarian site's register is not a claim about the English copy it replaces.
  const formality = analysis.detected_language_formality || 'neutral'
  add(
    'language',
    'Language',
    describeLanguage(current.client.language, current.brand.languageFormality),
    analysis.detected_language && describeLanguage(analysis.detected_language, formality),
    { client: { language: analysis.detected_language }, brand: { languageFormality: formality } }
  )

  add('avoid', 'Topics to avoid', current.brand.avoidTopics, analysis.detected_avoid_topics ?? '', {
    brand: { avoidTopics: analysis.detected_avoid_topics ?? '' },
  })

  const pillars = adoptPillarIds(analysis.detected_content_pillars, current.brand.contentPillars)
  add(
    'pillars',
    'Content pillars',
    describePillars(current.brand.contentPillars),
    describePillars(pillars),
    { brand: { contentPillars: pillars } },
    {
      parts: { current: current.brand.contentPillars, suggested: pillars },
      warning:
        describeClearedPillarScoping(
          restrictedSourcePillarIds,
          pillars.map((p) => p.id)
        ) ?? undefined,
    }
  )

  return suggestions
}

/**
 * Gives a suggested pillar the id its existing namesake already has.
 *
 * Every content source stores `pillar_ids`, so a pillar that survives a re-read under the same
 * name but a fresh uuid silently drops every source assigned to it back to feeds-all. Matching on
 * the name is what keeps "Case studies at 30%, now 40%" a weight change rather than a new pillar.
 */
function adoptPillarIds(
  suggested: ReadonlyArray<{ pillar: string; weight: number }>,
  existing: readonly WeightedPillar[]
): WeightedPillar[] {
  const byName = new Map(existing.map((p) => [normalizeForCompare(p.pillar), p.id]))
  return ensurePillarIds(
    suggested.map((p) => ({
      id: byName.get(normalizeForCompare(p.pillar)),
      pillar: p.pillar,
      weight: p.weight,
    }))
  )
}

/** One line naming the split, so a row can be read without expanding it. */
function describePillars(pillars: readonly WeightedPillar[]): string {
  return pillars.map((p) => `${p.pillar} ${p.weight}%`).join(' · ')
}

/** Whitespace and case are not a change worth asking about. */
function equivalent(a: string, b: string): boolean {
  return normalizeForCompare(a) === normalizeForCompare(b)
}
