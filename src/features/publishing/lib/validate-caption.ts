/**
 * Instagram caption limits, enforced before a byte reaches Meta. Checked at
 * schedule time so the calendar shows the problem, and again at publish time as
 * the backstop — a caption Meta would reject burns a publish attempt for
 * nothing and returns an unhelpful platform error string.
 */

export const CAPTION_MAX_CHARS = 2200
export const CAPTION_MAX_HASHTAGS = 30
export const CAPTION_MAX_MENTIONS = 20

/** Returns the reason a caption cannot be published to Instagram, or null when it can. */
export function validateInstagramCaption(caption: string): string | null {
  // Instagram counts unicode code points, not UTF-16 units — Cyrillic and emoji
  // captions would otherwise fail early or slip past.
  const length = [...caption].length
  if (length > CAPTION_MAX_CHARS) {
    return `Caption is ${length.toLocaleString()} characters — Instagram allows ${CAPTION_MAX_CHARS.toLocaleString()}`
  }
  const hashtags = caption.match(/#[\p{L}\p{N}_]+/gu)?.length ?? 0
  if (hashtags > CAPTION_MAX_HASHTAGS) {
    return `Caption has ${hashtags} hashtags — Instagram allows ${CAPTION_MAX_HASHTAGS}`
  }
  const mentions = caption.match(/@[\p{L}\p{N}_.]+/gu)?.length ?? 0
  if (mentions > CAPTION_MAX_MENTIONS) {
    return `Caption has ${mentions} mentions — Instagram allows ${CAPTION_MAX_MENTIONS}`
  }
  return null
}

/**
 * Alt text for the image container, derived from the caption. Meta caps alt
 * text well above this, but a full caption pasted as alt text reads as spam to
 * screen readers — one sentence is the useful amount.
 */
export function altTextFromCaption(caption: string): string | undefined {
  const firstLine = caption.split('\n')[0]?.trim() ?? ''
  if (!firstLine) return undefined
  const points = [...firstLine]
  return points.length <= 125 ? firstLine : `${points.slice(0, 124).join('')}…`
}
