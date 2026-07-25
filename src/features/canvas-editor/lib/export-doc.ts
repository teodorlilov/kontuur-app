import Konva from 'konva'
import type { CanvasDoc } from '@/types/canvas'
import {
  backgroundNodeAttrs,
  elementNodeAttrs,
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
 * face. A missing element asset THROWS — a save must never silently bake a hole.
 */
export async function exportDocToJpegBlob(
  doc: CanvasDoc,
  backgroundImage: HTMLImageElement
): Promise<Blob> {
  const [elementImages] = await Promise.all([
    Promise.all((doc.elements ?? []).map((element) => loadCrossOriginImage(element.src.publicUrl))),
    ensureFontsReady(doc.layers.map((layer) => layer.fontFamily)),
  ])

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
    const drawElements = (aboveText: boolean) => {
      ;(doc.elements ?? []).forEach((element, index) => {
        if (Boolean(element.aboveText) !== aboveText) return
        layer.add(new Konva.Image({ image: elementImages[index], ...elementNodeAttrs(element) }))
      })
    }
    drawElements(false)
    for (const textLayer of doc.layers) {
      // Mirror of the editor's TextNode structure: group owns position, bands under glyphs.
      const group = new Konva.Group(textGroupAttrs(textLayer))
      for (const band of highlightBands(textLayer)) group.add(new Konva.Rect(band))
      group.add(new Konva.Text(textNodeAttrs(textLayer)))
      layer.add(group)
    }
    drawElements(true)
    layer.draw()

    return await new Promise<Blob>((resolve, reject) => {
      stage.toBlob({
        mimeType: 'image/jpeg',
        quality: 0.9,
        pixelRatio: 1,
        callback: (blob) => (blob ? resolve(blob) : reject(new Error('Canvas export produced no blob'))),
      })
    })
  } finally {
    stage.destroy()
  }
}
