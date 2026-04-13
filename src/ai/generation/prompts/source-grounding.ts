import { decodeUrl } from '@/utils/decode-url'

/**
 * Source grounding rules shown to the generator.
 * Exported so the validation criteria checklist uses the same text.
 * What the generator was told to follow — the validator must check.
 */
export const SOURCE_GROUNDING_RULES =
  `- Every statistic, number, price, feature, or specific claim MUST come from the source material.
- Do NOT invent facts, numbers, or statistics that are not in the source. Absence of information is not creative license — it is a boundary.
- Pick ONE specific angle from the source — do not summarize. Structure the post using the post structures, NOT the source's structure. If covering more than 2-3 facts, stop and refocus.` as const

/**
 * Shared source grounding section builder for AI prompts.
 * Used by generate-post.ts and generate-carousel.ts.
 */
export function buildGroundingPrompt(opts: {
  sourceExcerpt?: string
  sourceFullText?: string
  sourceUrl?: string | null
  requireSourceGrounding?: boolean
  contentLabel?: string
}): string {
  const { sourceExcerpt, sourceFullText, sourceUrl, requireSourceGrounding, contentLabel = 'caption' } = opts
  const sourceText = sourceFullText || sourceExcerpt
  if (!requireSourceGrounding || !sourceText) return ''

  const urlLine = sourceUrl
    ? `${decodeUrl(sourceUrl)}`
    : '(No external URL available for this source)'
  const linkInstruction = sourceUrl
    ? `If appropriate, naturally reference or link to the source article in the ${contentLabel}.`
    : 'Since there is no external URL, do not fabricate a link — just use the facts from the source.'

  return `
SOURCE MATERIAL (ground all facts in this):
Source Text: ${sourceText}
Source URL: ${urlLine}

CRITICAL SOURCE FIDELITY RULES:
- Every statistic, number, price, feature, or specific claim MUST come from the source material above.
- Do NOT invent facts, numbers, or statistics that are not in the source.
- If the source does not mention a specific detail, you MUST NOT mention it. Absence of information is not creative license — it is a boundary.
- Do NOT extrapolate or "fill in" details that seem plausible but are not stated in the source.
- Prefer being less specific over being fabricated-specific. A post with fewer details that are all true is better than a vivid post with invented facts.
- Write ONLY about what the source explicitly states.
- CRITICAL: Pick ONE specific angle from the source — do not summarize. Structure the post using the post structures above, NOT the source's structure. If covering more than 2-3 facts, stop and refocus.
${linkInstruction}
`
}
