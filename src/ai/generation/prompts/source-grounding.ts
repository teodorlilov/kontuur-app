import { decodeUrl } from '@/utils/decode-url'
import { sanitizePromptField, sanitizeSourceText } from '@/ai/utils/sanitize'
import type { PostType } from '@/types/api'

/**
 * The one place that decides which source text grounds a post — fed to BOTH the
 * writer prompt and the judge's fabrication check, which previously each wrote
 * their own `sourceFullText || sourceExcerpt` and could silently diverge.
 *
 * English clients: the capped full source text, as always. Non-English clients:
 * the planner's native-language excerpt is the primary — composing while
 * reading 4000 chars of English is the documented translationese failure mode —
 * and for carousels (5 slides need more facts than 12 sentences) the English
 * full text rides along as background the writer may take NO facts from. The
 * judge checks claims against `primary` only: a fact lifted from background is
 * exactly what it should flag.
 */
export function selectGroundingText(
  source: { sourceExcerpt?: string; sourceFullText?: string },
  language: string,
  format: PostType
): { primary?: string; background?: string } {
  const isEnglish = language.trim().toLowerCase() === 'english'
  if (isEnglish) return { primary: source.sourceFullText || source.sourceExcerpt }

  const primary = source.sourceExcerpt || source.sourceFullText
  const background =
    format === 'carousel' && source.sourceExcerpt && source.sourceFullText
      ? source.sourceFullText
      : undefined
  return { primary, background }
}

/**
 * Shared source grounding section builder for AI prompts.
 * One builder for both formats, so the single and carousel user prompts in
 * prompt-builder.ts cannot drift on how they present source material.
 */
export function buildGroundingPrompt(opts: {
  primary?: string
  background?: string
  sourceUrl?: string | null
  contentLabel?: string
}): string {
  const { primary, background, sourceUrl, contentLabel = 'caption' } = opts
  const sourceText = primary
  // Source text present is the only condition: a post written from a source is
  // always checked against it. This used to be gated behind a client toggle that
  // could not change the outcome — with source text the gate was forced open,
  // without it there was nothing to check — so the setting was removed entirely.
  if (!sourceText) {
    return `FACTUAL GROUNDING (no source material available):
- Do NOT invent specific statistics, case studies, customer quotes, or measurable results.
- You may describe common patterns and well-established knowledge in this field.
- Prefer fewer claims that are defensible over vivid but fabricated details.`
  }

  const urlLine = sourceUrl
    ? `${decodeUrl(sourceUrl)}`
    : '(No external URL available for this source)'
  const linkInstruction = sourceUrl
    ? `If appropriate, naturally reference or link to the source article in the ${contentLabel}.`
    : 'Since there is no external URL, do not fabricate a link — just use the facts from the source.'

  // Delimited and escaped, not interpolated bare. This text is a scraped page or feed
  // body — the one input to generation that an outsider can write. Untagged it reads as
  // prose the model may take instructions from; tagged and escaped it can only be data,
  // which is what the DEFENSIVE_DATA_CLAUSE in the system prompt then refers to.
  // Length is budgeted upstream (source-gathering), so nothing is truncated here.
  return `
SOURCE MATERIAL (use as primary context):
<source_text>
${sanitizeSourceText(sourceText)}
</source_text>
Source URL: ${sanitizePromptField(urlLine)}
${background ? `\nBACKGROUND CONTEXT (for understanding only — every fact, number and claim you use MUST come from the Source Text above, NONE from this background):\n<background_text>\n${sanitizeSourceText(background)}\n</background_text>\n` : ''}
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
