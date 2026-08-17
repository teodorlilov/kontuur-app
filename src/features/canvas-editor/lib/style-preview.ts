import type { CanvasDoc } from '@/types/canvas'
import { applyStyleToDoc } from '@/lib/canvas/apply-style'
import { isStyledRole, textNodes } from '@/lib/canvas/doc-nodes'
import { exportDocToJpegBlob } from './export-doc'
import { ensureFontsReady, injectLibraryStylesheet } from './fonts'
import { loadCrossOriginImage } from './load-image'
import { autofitDocText } from './measure-fit'

/**
 * Preview raster scale: a 1080px doc becomes ~378px, which covers a ~160px tile at 2× DPR with
 * headroom. The point of the fraction is the SECOND render — `toBlob` rasterizes into its own
 * canvas, and that cost scales with stage area times devicePixelRatio squared.
 */
const PREVIEW_SCALE = 0.35

/**
 * Whether a slide can receive another slide's look at all.
 *
 * `applyStyleToDoc` matches by ROLE — headline to headline, body to body — and never touches a text
 * layer the user added themselves. A doc with no roled text would therefore come back byte-identical,
 * so the panel offers it disabled rather than as a tick that silently does nothing.
 */
export function takesStyle(doc: CanvasDoc): boolean {
  return textNodes(doc).some(isStyledRole)
}

/**
 * What a slide becomes when another slide's look is carried onto it.
 *
 * The autofit is the whole doc, not just the restyled nodes — deliberately, because that is what
 * the server-side pass this replaces did (`composeDoc` autofits before export), and a preview that
 * disagreed with the result would be worse than no preview.
 */
export function styledDoc(target: CanvasDoc, source: CanvasDoc): CanvasDoc {
  return autofitDocText(applyStyleToDoc(target, source))
}

/**
 * Render one styled doc to an object URL for the preview grid.
 *
 * The caller owns revoking the URL. Callers must also run these SEQUENTIALLY: each builds a whole
 * offscreen Konva stage and rasterizes it on the main thread, so a `Promise.all` over a ten-slide
 * carousel is ten stages at once — the same reason the compose pipeline holds a semaphore of 1.
 */
export async function renderStylePreview(doc: CanvasDoc): Promise<string> {
  injectLibraryStylesheet()
  const background = await loadCrossOriginImage(doc.background.publicUrl)
  await ensureFontsReady(textNodes(doc).map((node) => node.fontFamily))
  const blob = await exportDocToJpegBlob(doc, background, PREVIEW_SCALE)
  return URL.createObjectURL(blob)
}
