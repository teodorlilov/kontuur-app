import Konva from 'konva'
import type { CanvasDoc } from '@/types/canvas'
import { backgroundNodeAttrs, scrimNodeAttrs, textNodeAttrs } from '@/lib/canvas/node-attrs'
import { ensureFontsReady } from './fonts'

/**
 * Flatten a canvas doc to a jpeg Blob on an offscreen vanilla-Konva stage at native doc size
 * (pixelRatio 1 — a viewport-scaled stage would round to 1079/1081px). No selection chrome is
 * ever exported; fonts are re-awaited here so a freshly picked family can't bake as a system face.
 */
export async function exportDocToJpegBlob(
  doc: CanvasDoc,
  backgroundImage: HTMLImageElement
): Promise<Blob> {
  await ensureFontsReady(doc.layers.map((layer) => layer.fontFamily))

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
        ...backgroundNodeAttrs(
          { width: backgroundImage.naturalWidth, height: backgroundImage.naturalHeight },
          doc.canvas,
          doc.backgroundTransform
        ),
      })
    )
    const scrim = scrimNodeAttrs(doc.scrim, doc.canvas)
    if (scrim) layer.add(new Konva.Rect(scrim))
    for (const textLayer of doc.layers) {
      layer.add(new Konva.Text(textNodeAttrs(textLayer)))
    }
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
