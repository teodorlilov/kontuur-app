import Konva from 'konva'
import type { CanvasDoc } from '@/types/canvas'
import { isImageNode, isShapeNode, isTextNode, visibleNodes } from '@/lib/canvas/doc-nodes'
import {
  backgroundNodeAttrs,
  imageBitmapAttrs,
  nodeGroupAttrs,
  shapeChildAttrs,
  scrimNodeAttrs,
  textGroupAttrs,
  textNodeAttrs,
} from '@/lib/canvas/node-attrs'
import { ensureFontsReady } from './fonts'
import { loadCrossOriginImage, naturalSize } from './load-image'
import { highlightBands } from './measure-fit'

/**
 * Flatten a canvas doc to a jpeg Blob on an offscreen vanilla-Konva stage at native doc size
 * (pixelRatio 1 — a viewport-scaled stage would round to 1079/1081px). No selection chrome is
 * ever exported; fonts are re-awaited here so a freshly picked family can't bake as a system
 * face. A missing asset THROWS — a save must never silently bake a hole.
 */
export async function exportDocToJpegBlob(
  doc: CanvasDoc,
  backgroundImage: HTMLImageElement,
  /**
   * Raster scale. 1 is the save path and must stay the default — the 1079/1081 rounding above is
   * exactly why. A preview passes a fraction, which shrinks the SECOND render `toBlob` performs
   * (Konva rasterizes into its own canvas, so `layer.draw()` below is a discarded first pass whose
   * cost goes with stage area × devicePixelRatio²).
   */
  pixelRatio = 1
): Promise<Blob> {
  // Hidden nodes leave here, before the load — not just before the draw. A missing asset THROWS
  // (a save must never silently bake a hole), so loading a hidden node's asset would let one broken
  // picture the user has already switched off block every save of that slide.
  const drawn = visibleNodes(doc)
  // Keyed by node id rather than by index: one ordered list means the draw loop below no longer
  // walks the assets in their own separate order.
  const [loaded] = await Promise.all([
    Promise.all(
      drawn
        .filter(isImageNode)
        .map(async (node) => {
          const image = await loadCrossOriginImage(node.src.publicUrl)
          return [node.id, image] as const
        })
    ),
    ensureFontsReady(drawn.filter(isTextNode).map((node) => node.fontFamily)),
  ])
  const assets = new Map(loaded)

  const stage = new Konva.Stage({
    container: document.createElement('div'),
    width: doc.canvas.w,
    height: doc.canvas.h,
  })
  try {
    const layer = new Konva.Layer({ listening: false })
    stage.add(layer)

    layer.add(
      new Konva.Image({
        image: backgroundImage,
        ...backgroundNodeAttrs(naturalSize(backgroundImage), doc.canvas, doc.backgroundTransform),
      })
    )
    const scrim = scrimNodeAttrs(doc.scrim, doc.canvas)
    if (scrim) layer.add(new Konva.Rect(scrim))
    // One pass in doc order — the list IS the z-order, so the exporter and the stage agree by
    // construction rather than by both remembering to draw the bands in the same sequence.
    for (const node of drawn) {
      if (isTextNode(node)) {
        // Mirror of the editor's TextNode structure: group owns position, bands under glyphs.
        const group = new Konva.Group(textGroupAttrs(node))
        for (const band of highlightBands(node)) group.add(new Konva.Rect(band))
        group.add(new Konva.Text(textNodeAttrs(node)))
        layer.add(group)
      } else if (isShapeNode(node)) {
        // Same Group + child structure, same attrs resolver — a shape cannot be drawn one way here
        // and another way on the stage.
        const attrs = shapeChildAttrs(node)
        const group = new Konva.Group(nodeGroupAttrs(node))
        group.add(
          node.kind === 'rect'
            ? new Konva.Rect(attrs)
            : node.kind === 'ellipse'
              ? new Konva.Ellipse({ ...attrs, radiusX: node.width / 2, radiusY: node.height / 2 })
              : new Konva.Line({ ...attrs, lineCap: 'round' })
        )
        layer.add(group)
      } else {
        // Group + child, mirroring the stage's ImageNode exactly — the mirror lives on the child
        // so both renderers compose the same matrix.
        const group = new Konva.Group(nodeGroupAttrs(node))
        group.add(new Konva.Image({ image: assets.get(node.id), ...imageBitmapAttrs(node) }))
        layer.add(group)
      }
    }
    layer.draw()

    return await new Promise<Blob>((resolve, reject) => {
      stage.toBlob({
        mimeType: 'image/jpeg',
        quality: 0.9,
        pixelRatio,
        callback: (blob) =>
          blob ? resolve(blob) : reject(new Error('Canvas export produced no blob')),
      })
    })
  } finally {
    stage.destroy()
  }
}
