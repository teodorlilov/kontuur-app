import { decodeUrl } from '@/utils/decode-url'

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
- CRITICAL: Ground the content in what the source actually says about: WHO this helps (conditions, indications, use cases), HOW it works (mechanism, key features), and WHAT outcome it delivers. For a single post, pick the angle from this arc that is most compelling for the audience. For multi-slide content, map distinct aspects of this arc across slides — do not fill slides with sub-details of the same mechanism point.
${linkInstruction}
`
}
