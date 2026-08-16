import type { CanvasDoc } from '@/types/canvas'
import { resolveDocForImage } from '@/lib/canvas/resolve-doc'
import { seedCanvasDoc, type SeedIdentity } from '@/lib/canvas/seed-doc'
import type { EditorSlide } from '../types'

export interface ResolvedSlide {
  doc: CanvasDoc
  /** Seeded from copy just now, so it still needs an autofit pass before it is first painted. */
  seeded: boolean
  /**
   * The doc is exactly what is stored, so the slide opens clean.
   *
   * False for a slide that was seeded or rebound: what the canvas shows then is not what the saved
   * image holds, and calling that "no unsaved changes" would leave the user looking at text with
   * the Save button greyed out.
   */
  matchesStored: boolean
}

/**
 * Resolve every slide's stored doc against the image currently at its position: our own baked
 * output → render over the stored clean background; a changed image → rebind to it as the new clean
 * background; no doc at all → seed from that slide's copy.
 *
 * `storedDoc` is supplied rather than read, because the two targets keep their docs in different
 * places: a post's live on the server, a wizard draft's in the surface's memory.
 */
export function resolveSlideDocs(
  slides: EditorSlide[],
  storedDoc: (slide: EditorSlide) => CanvasDoc | null,
  identity: SeedIdentity
): Map<number, ResolvedSlide> {
  return new Map(
    slides.map((slide) => [slide.position, resolveSlide(slide, storedDoc(slide), identity)])
  )
}

function resolveSlide(
  slide: EditorSlide,
  stored: CanvasDoc | null,
  identity: SeedIdentity
): ResolvedSlide {
  if (stored) {
    const doc = resolveDocForImage(stored, slide.image)
    // Reference identity is the whole test: `resolveDocForImage` hands the stored doc straight back
    // when the image is its own bake, and returns a rebound copy when the art changed underneath.
    return { doc, seeded: false, matchesStored: doc === stored }
  }
  const copy = slide.slideCopy
  return {
    seeded: true,
    matchesStored: false,
    doc: seedCanvasDoc({
      identity,
      background: { ...slide.image },
      slide: copy?.kind === 'slide' ? { headline: copy.headline, body: copy.body } : undefined,
      caption: copy?.kind === 'caption' ? copy.caption : undefined,
    }),
  }
}
