import type { CanvasDoc } from '@/types/canvas'
import { resolveDocForImage } from '@/lib/canvas/resolve-doc'
import { seedCanvasDoc, type SeedIdentity } from '@/lib/canvas/seed-doc'
import type { EditorSlide } from '../types'
import type { SlideCopy } from '@/lib/posts/slide-copy'
import type { SlideText } from '@/types/slide'

/**
 * The `SlideCopy` union as the slide/caption fields `seedCanvasDoc` and `applyCopyToDoc` take.
 *
 * One mapping, because two modules seed from copy — this one when the editor opens, `auto-compose`
 * when a fresh picture lands — and a union that grows a third member would otherwise be handled in
 * one of them and silently dropped by the other.
 */
export function copyFields(slideCopy: SlideCopy | null | undefined): {
  slide?: SlideText
  caption?: string | null
} {
  return {
    slide:
      slideCopy?.kind === 'slide'
        ? { headline: slideCopy.headline, body: slideCopy.body }
        : undefined,
    caption: slideCopy?.kind === 'caption' ? slideCopy.caption : undefined,
  }
}

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
  identity: SeedIdentity,
  /** The post or draft these slides belong to — what keys the lockup a reseeded slide gets. */
  subject: string
): Map<number, ResolvedSlide> {
  return new Map(
    slides.map((slide) => [
      slide.position,
      resolveSlide(slide, storedDoc(slide), identity, { subject, total: slides.length }),
    ])
  )
}

function resolveSlide(
  slide: EditorSlide,
  stored: CanvasDoc | null,
  identity: SeedIdentity,
  run: { subject: string; total: number }
): ResolvedSlide {
  if (stored) {
    const doc = resolveDocForImage(stored, slide.image)
    // Reference identity is the whole test: `resolveDocForImage` hands the stored doc straight back
    // when the image is its own bake, and returns a rebound copy when the art changed underneath.
    return { doc, seeded: false, matchesStored: doc === stored }
  }
  return {
    seeded: true,
    matchesStored: false,
    doc: seedCanvasDoc({
      identity,
      background: { ...slide.image },
      ...copyFields(slide.slideCopy),
      // WITH a variation, so a slide reseeded in the editor is dressed in a lockup like one seeded
      // anywhere else. Without it this path fell through to the flat fixed geometry, so opening a
      // doc-less slide showed a plainer layout than auto-compose had already produced for its
      // siblings — and saving persisted that difference.
      //
      // Keyed on the slide's own image, so the layout is stable for as long as the picture is: the
      // editor reseeds on every open, and a key that moved would redress the slide each time.
      variation: {
        subject: run.subject,
        position: slide.position,
        total: run.total,
        nonce: slide.image.storagePath,
      },
    }),
  }
}
