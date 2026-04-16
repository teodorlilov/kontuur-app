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
  const sourceText = sourceExcerpt || sourceFullText
  if (!requireSourceGrounding || !sourceText) return ''

  const urlLine = sourceUrl
    ? `${decodeUrl(sourceUrl)}`
    : '(No external URL available for this source)'
  const linkInstruction = sourceUrl
    ? `If appropriate, naturally reference or link to the source article in the ${contentLabel}.`
    : 'Since there is no external URL, do not fabricate a link — just use the facts from the source.'

  return `
SOURCE MATERIAL (use as primary context):
Source Text: ${sourceText}
Source URL: ${urlLine}

SOURCE GROUNDING RULES:
- Use this source as the primary context and inspiration for the post.
- Every specific statistic, number, price, or claim you include MUST come from the source or the client's own known expertise — do NOT invent facts.
- If the source describes services, treatments, or claims outside this client's scope: extract the underlying audience concern or theme (e.g. "managing chronic pain", "faster recovery") and reframe it using what this client actually offers. Do NOT refuse to write the post.
- Do NOT transcribe the source verbatim — adapt its insight to this client's voice, services, and audience.
- Prefer fewer specific details that are all accurate over a vivid post with invented claims.
- Ground the content in what the source says about: WHO this helps, HOW it works, and WHAT outcome it delivers — pick the angle most relevant to this client.
${linkInstruction}
`
}
