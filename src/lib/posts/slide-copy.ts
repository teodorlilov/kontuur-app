import { parseSlides } from './parse-slides'
import type { SlideText } from '@/types/slide'
import type { PostRow } from '@/types'

/**
 * The copy one slide carries: a carousel slide's fields, or a single post's caption.
 *
 * Declared here, beside the function that produces it, rather than in the canvas editor's types.
 * It was there because the editor was the first thing to need it — and then five surfaces outside
 * the editor started passing it around, none of which open a canvas. A type whose only home is a
 * feature nobody in the chain uses is how `lib/` ends up importing `features/`.
 */
export type SlideCopy =
  | ({ kind: 'slide' } & SlideText)
  | { kind: 'caption'; caption: string | null }

/** The post fields the copy mapping needs — satisfied by persisted posts, drafts and local state. */
export type SlideCopySource = Pick<PostRow, 'post_type' | 'caption'> & {
  /** Wider than the `Json | null` column ON PURPOSE: wizard drafts and local editor state satisfy
   *  this too, and neither has been through PostgREST. */
  slides_json: unknown
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

/**
 * How many slides the post has to EDIT — what tells a slide whether it is the last one.
 *
 * Derived from the same two fields `slideCopyAt` reads, so the count and the copy can never
 * disagree about how long the carousel is. A single post is a carousel of one.
 *
 * The floor at 1 is the whole difference between this and `totalVisualSlots`
 * (lib/visual/visual-backlog.ts), which is otherwise the same expression. An empty carousel still
 * has one slide to open in the editor, and zero pictures to generate — so this floors and that one
 * must not. Two questions that share a shape; merging them behind a flag would hide which is being
 * asked at each of the nine call sites.
 */
export function slideTotal(post: SlideCopySource): number {
  return post.post_type === 'carousel' ? Math.max(parseSlides(post.slides_json).length, 1) : 1
}
