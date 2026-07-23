import type { CanvasDoc } from '@/types/canvas'
import { exportDocToJpegBlob } from './export-doc'
import { ensureFontsReady, injectLibraryStylesheet } from './fonts'
import { loadCrossOriginImage } from './load-image'
import { autofitDocLayers } from './measure-fit'

/**
 * Auto-compose: flatten a (typically freshly seeded) doc over its clean background. Fonts are
 * loaded and seeded layers autofit before export, so the baked layout matches what the editor
 * would show. Returns the fitted doc (what to persist) with its flattened jpeg.
 */
export async function composeDoc(doc: CanvasDoc): Promise<{ doc: CanvasDoc; blob: Blob }> {
  injectLibraryStylesheet()
  const image = await loadCrossOriginImage(doc.background.publicUrl)
  await ensureFontsReady(doc.layers.map((layer) => layer.fontFamily))
  const fitted = autofitDocLayers(doc)
  const blob = await exportDocToJpegBlob(fitted, image)
  return { doc: fitted, blob }
}
