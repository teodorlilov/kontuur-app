export interface ContentSectionOpts {
  /** Tag name for the caption/post in single mode */
  singleTag: string
  /** Tag name for the caption in carousel mode (defaults to singleTag) */
  captionTag?: string
  /** Tag name for slides in carousel mode */
  slidesTag?: string
  /** Text before the single post (e.g. "Post:") */
  singleIntro?: string
  /** Text before the carousel content (e.g. "Evaluate the carousel...") */
  carouselIntro?: string
}

/**
 * Builds the content section for validation prompts.
 * Shared across quality, language, and source grounding validators.
 * Handles both single posts and carousels.
 */
export function buildContentSection(
  text: string,
  slides: Array<{ headline: string; body: string }> | undefined,
  opts: ContentSectionOpts,
): string {
  const isCarousel = !!slides?.length

  if (!isCarousel) {
    const intro = opts.singleIntro ? `\n${opts.singleIntro}` : ''
    return `${intro}\n<${opts.singleTag}>\n${text}\n</${opts.singleTag}>`
  }

  const captionTag = opts.captionTag ?? opts.singleTag

  const slidesText = slides!
    .map((s, i) => `[SLIDE ${i + 1}]\nHeadline: ${s.headline}\nBody: ${s.body}`)
    .join('\n\n')

  const intro = opts.carouselIntro ? `\n${opts.carouselIntro}` : ''
  const slidesSection = opts.slidesTag
    ? `\n\n<${opts.slidesTag}>\n${slidesText}\n</${opts.slidesTag}>`
    : ''

  return `${intro}\n\n[CAPTION]\n<${captionTag}>\n${text}\n</${captionTag}>${slidesSection}`
}
