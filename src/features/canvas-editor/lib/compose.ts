import type { CanvasDoc } from '@/types/canvas'
import { textNodes } from '@/lib/canvas/doc-nodes'
import { exportDocToJpegBlob } from './export-doc'
import { ensureFontsReady, injectLibraryStylesheet } from './fonts'
import { loadCrossOriginImage } from './load-image'
import { autofitDocText } from './measure-fit'

/**
 * Auto-compose: flatten a (typically freshly seeded) doc over its clean background. Fonts are
 * loaded and seeded text autofits before export, so the baked layout matches what the editor
 * would show. Returns the fitted doc (what to persist) with its flattened jpeg.
 */
export async function composeDoc(doc: CanvasDoc): Promise<{ doc: CanvasDoc; blob: Blob }> {
  injectLibraryStylesheet()
  const image = await loadCrossOriginImage(doc.background.publicUrl)
  await ensureFontsReady(textNodes(doc).map((node) => node.fontFamily))
  const fitted = autofitDocText(doc)
  const blob = await exportDocToJpegBlob(fitted, image)
  return { doc: fitted, blob }
}
