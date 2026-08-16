import type { CanvasBackgroundRef, CanvasDoc } from '@/types/canvas'

/**
 * Bind a stored doc to a new clean background: the image becomes the doc's background and the
 * stored pan/zoom resets, because that crop was measured against the art it replaces.
 */
export function rebindDocToImage(doc: CanvasDoc, image: CanvasBackgroundRef): CanvasDoc {
  return {
    ...doc,
    background: { publicUrl: image.publicUrl, storagePath: image.storagePath },
    backgroundTransform: undefined,
  }
}

/**
 * The rebind rule every compose path shares: an image that IS this doc's own baked output renders
 * over the stored clean background (pan/zoom kept); anything else means the art changed underneath
 * (regenerate, re-upload) and becomes the new clean background.
 */
export function resolveDocForImage(doc: CanvasDoc, image: CanvasBackgroundRef): CanvasDoc {
  return doc.flattenedStoragePath === image.storagePath ? doc : rebindDocToImage(doc, image)
}
