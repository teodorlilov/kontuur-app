import type { CanvasDoc } from '@/types/canvas'
import type { Palette } from '@/types/visual'
import { fillCandidates, lowContrastLabels, recolourForBackdrop } from '@/lib/canvas/contrast'
import { textNodes } from '@/lib/canvas/doc-nodes'
import { buildBackdropGrid } from './backdrop-grid'
import { exportDocToJpegBlob } from './export-doc'
import { ensureFontsReady, injectLibraryStylesheet } from './fonts'
import { loadCrossOriginImage } from './load-image'
import { autofitDocText } from './measure-fit'

/**
 * How strong a rescue backdrop is, when the colours alone could not save the type.
 *
 * A wash, not a cover: enough to pull a busy photograph away from the text, little enough that the
 * picture is still the picture. The seeded backdrop's own opacity is deliberately NOT reused — it
 * is 1, because a backdrop the user switches on by hand is meant to replace the image outright.
 */
const RESCUE_OPACITY = 0.35

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
  const readable = rescueContrast(fitted, image, fillCandidates(palette))
  const blob = await exportDocToJpegBlob(readable, image)
  return { doc: readable, blob }
}

/**
 * Make the type readable against the art, by colour if that is enough and by backdrop if it is not.
 *
 * The editor can afford to stop after the repaint: what it cannot fix it REPORTS, in a warning at
 * the top of the window, and a person decides. Nobody is watching this path. A slide whose headline
 * no palette colour can rescue would simply ship that way — and it is the common path, because most
 * posts are never opened in the editor at all.
 *
 * So the second pass exists for exactly the case the first one gives up on: switch a wash on and
 * measure AGAIN, because the wash changes what is behind the text and therefore which colour wins.
 * If it still fails, the doc ships as it is — there is nothing further to try that would not be
 * guessing, and the editor's warning is waiting whenever the post is opened.
 */
function rescueContrast(
  doc: CanvasDoc,
  image: HTMLImageElement,
  candidates: readonly string[]
): CanvasDoc {
  const grid = buildBackdropGrid(doc, image)
  // No grid means the pixels could not be read at all (a tainted canvas); the doc is left alone
  // rather than washed on a suspicion.
  if (!grid) return doc

  const repainted = recolourForBackdrop(doc, grid, candidates)
  if (doc.backdrop.enabled || lowContrastLabels(repainted, grid).length === 0) return repainted

  const washed: CanvasDoc = {
    ...repainted,
    backdrop: { ...repainted.backdrop, enabled: true, opacity: RESCUE_OPACITY },
  }
  const washedGrid = buildBackdropGrid(washed, image)
  return washedGrid ? recolourForBackdrop(washed, washedGrid, candidates) : washed
}
