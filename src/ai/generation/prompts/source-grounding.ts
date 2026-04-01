import { decodeUrl } from '@/utils/decode-url'

/**
 * Shared source grounding section builder for AI prompts.
 * Used by generate-post.ts and generate-carousel.ts.
 */
export function buildSourceGroundingSection(opts: {
  sourceExcerpt?: string
  sourceUrl?: string | null
  requireSourceGrounding?: boolean
  contentLabel?: string
}): string {
  const { sourceExcerpt, sourceUrl, requireSourceGrounding, contentLabel = 'caption' } = opts
  if (!requireSourceGrounding || !sourceExcerpt) return ''

  const urlLine = sourceUrl
    ? `Source link: ${decodeUrl(sourceUrl)}`
    : '(No external URL available for this source)'
  const linkInstruction = sourceUrl
    ? `If appropriate, naturally reference or link to the source article in the ${contentLabel}.`
    : 'Since there is no external URL, do not fabricate a link — just use the facts from the source.'

  return `
SOURCE MATERIAL (ground all facts in this):
<source_excerpt>
${sourceExcerpt}
</source_excerpt>
${urlLine}

CRITICAL SOURCE FIDELITY RULES:
- Every statistic, number, price, feature, or specific claim MUST come from the source material above.
- Do NOT invent facts, numbers, or statistics that are not in the source.
- If the source does not mention a detail (floor number, view, neighborhood character, building type, specific amenity), you MUST NOT mention it. Absence of information is not creative license — it is a boundary.
- Do NOT extrapolate, infer, or "fill in" details that seem plausible based on the listing type, location, or niche. If the source says "apartment in кв. Беломорски" and nothing about the view — do not mention any view.
- Prefer being less specific over being fabricated-specific. A post with fewer details that are all true is better than a vivid post with invented facts.
- Write ONLY about what the source explicitly states.
- CRITICAL: This is a social media post, NOT an article summary. Pick ONE specific angle, detail, or insight from the source — the one that would make someone stop scrolling. Do NOT try to cover every point the source mentions.
- Structure your post using the post structures listed above, NOT the structure of the source article. If the source is organized as "intro → explanation → protocol → indications," your post must NOT follow that same flow.
- If you find yourself covering more than 2-3 distinct facts from the source, you are summarizing. Stop. Cut to ONE angle and develop it with voice, personality, and the chosen post structure.
${linkInstruction}
`
}
