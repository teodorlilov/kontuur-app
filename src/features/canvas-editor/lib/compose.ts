import type { CanvasDoc } from '@/types/canvas'
import type { Palette } from '@/types/visual'
import { fillCandidates, recolourForBackdrop } from '@/lib/canvas/contrast'
import { textNodes } from '@/lib/canvas/doc-nodes'
import { buildBackdropGrid } from './backdrop-grid'
import { exportDocToJpegBlob } from './export-doc'
import { ensureFontsReady, injectLibraryStylesheet } from './fonts'
import { loadCrossOriginImage } from './load-image'
import { autofitDocText } from './measure-fit'

/**
 * Auto-compose: flatten a (typically freshly seeded) doc over its clean background. Fonts are
 * loaded and seeded text autofits before export, so the baked layout matches what the editor
 * would show. Returns the doc to persist with its flattened jpeg.
 *
 * The contrast pass runs HERE rather than only in the editor, because this is the path every
 * generated slide takes — most posts are published without the editor ever being opened, and
 * `seedCanvasDoc` picks `palette.ink` without knowing what the model drew underneath it. Doing it
 * only on demand would mean contrast is handled when somebody goes looking, which is not the same
 * as contrast being handled.
 *
 * After the autofit, not before: autofit changes `fontSize`, which changes the box height, which
 * changes which band of the picture the text actually sits over.
 */
export async function composeDoc(
  doc: CanvasDoc,
  palette: Palette
): Promise<{ doc: CanvasDoc; blob: Blob }> {
  injectLibraryStylesheet()
  const image = await loadCrossOriginImage(doc.background.publicUrl)
  await ensureFontsReady(textNodes(doc).map((node) => node.fontFamily))
  const fitted = autofitDocText(doc)
  const grid = buildBackdropGrid(fitted, image)
  const readable = grid ? recolourForBackdrop(fitted, grid, fillCandidates(palette)) : fitted
  const blob = await exportDocToJpegBlob(readable, image)
  return { doc: readable, blob }
}
