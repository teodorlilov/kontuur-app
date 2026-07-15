import { renderCompositionToDataURL } from '@/lib/renderer/konva'
import { REFERENCE_MARKS } from '@/lib/renderer/reference-compositions'
import type { BrandTokens, Composition } from '@/lib/scene-graph'

export type ExportSlide = { slideIndex: number; composition: Composition }

/**
 * Render each slide to a publishable image and upload it to `post_images` at its position — the bridge
 * from the designed composition to the published post. Runs client-side, reusing the exact preview raster
 * (`renderCompositionToDataURL`), so what the operator saw is what publishes. Used by the editor's
 * "Save & export" and by wizard approve, so every operator-approved carousel gets its images.
 *
 * Sequential (each offscreen stage is disposed before the next) to avoid an N-slide memory spike; JPEG
 * q0.92 (slides are opaque) keeps files well under the upload cap; per-slide fail-soft. No-op on the
 * server (the raster returns '').
 */
export async function exportSlidesToPostImages(
  postId: string,
  slides: ExportSlide[],
  tokens: BrandTokens,
  onProgress?: (done: number, total: number) => void
): Promise<void> {
  for (let i = 0; i < slides.length; i++) {
    onProgress?.(i, slides.length)
    try {
      const dataUrl = await renderCompositionToDataURL(slides[i]!.composition, tokens, {
        marks: REFERENCE_MARKS,
        pixelRatio: 2,
        mimeType: 'image/jpeg',
        quality: 0.92,
      })
      if (!dataUrl) continue
      const blob = await (await fetch(dataUrl)).blob()
      const form = new FormData()
      form.append('file', new File([blob], `slide-${slides[i]!.slideIndex + 1}.jpg`, { type: 'image/jpeg' }))
      form.append('position', String(slides[i]!.slideIndex))
      await fetch(`/api/posts/${postId}/images`, { method: 'POST', body: form })
    } catch (e) {
      console.error('[export-slides] slide failed', i, e)
    }
  }
  onProgress?.(slides.length, slides.length)
}
