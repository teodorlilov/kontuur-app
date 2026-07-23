import { parseSlides } from '@/components/posts/parse-slides'
import type { SlideCopy } from '../types'

/** The post fields the copy mapping needs — satisfied by persisted posts, drafts and local state. */
export interface SlideCopySource {
  post_type: string
  slides_json: unknown
  caption: string | null
}

/**
 * The copy that seeds/refreshes a slide's text overlay: the carousel slide at the position, or the
 * caption for single posts. The single source for every surface (wizard, review, calendar).
 */
export function slideCopyAt(post: SlideCopySource, position: number): SlideCopy | null {
  if (post.post_type !== 'carousel') return { kind: 'caption', caption: post.caption }
  const slide = parseSlides(post.slides_json)[position]
  return slide ? { kind: 'slide', headline: slide.headline, body: slide.body } : null
}
