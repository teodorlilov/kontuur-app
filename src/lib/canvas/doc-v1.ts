import { z } from 'zod'
import type { CanvasDoc, CanvasImageNode, CanvasNode, CanvasTextNode } from '@/types/canvas'
import { MAX_BACKGROUND_ZOOM } from './constants'
import { backdropFromScrim, legacyScrimSchema } from './legacy-scrim'
import { HEX_COLOR } from '@/lib/validation'

/**
 * Everything about the retired v1 doc shape, in one file so it can be deleted whole once no v1 rows
 * remain. v1 kept two bands — `layers` (text, always on top) and `elements` (assets, below unless
 * `aboveText`) — which made z-order un-general. v2 replaced both with one ordered `nodes` list.
 *
 * Nothing writes v1 any more. `safeParseCanvasDoc` is the only caller: it upgrades on read, and the
 * next save persists v2. See TECH-DEBT for the retirement condition.
 */

const hex = z.string().regex(HEX_COLOR, 'must be a #rrggbb hex colour')

const textLayerSchemaV1 = z.object({
  id: z.string().min(1),
  role: z.enum(['headline', 'body', 'custom']),
  text: z.string(),
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  fontFamily: z.string().min(1),
  fontSize: z.number().min(8).max(400),
  fontWeight: z.union([z.literal(400), z.literal(500), z.literal(600), z.literal(700)]),
  fill: hex,
  align: z.enum(['left', 'center', 'right']),
  lineHeight: z.number().min(0.8).max(3),
  rotation: z.number().min(-180).max(180).optional(),
  uppercase: z.boolean().optional(),
  italic: z.boolean().optional(),
  highlight: hex.optional(),
  textOverridden: z.boolean().optional(),
})

const elementSchemaV1 = z.object({
  id: z.string().min(1),
  kind: z.enum(['image', 'svg']),
  src: z.object({ publicUrl: z.string().min(1), storagePath: z.string().min(1) }),
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
  rotation: z.number().min(-180).max(180).optional(),
  opacity: z.number().min(0).max(1).optional(),
  /** v1's only z-order control: promote this element in front of the whole text band. */
  aboveText: z.boolean().optional(),
})

/** The v1 doc as it still sits in `post_canvas_docs.doc` rows saved before the v2 cutover. */
export const canvasDocSchemaV1 = z.object({
  version: z.literal(1),
  canvas: z.object({ w: z.number().int().positive(), h: z.number().int().positive() }),
  background: z.object({ publicUrl: z.string().min(1), storagePath: z.string().min(1) }),
  backgroundTransform: z
    .object({
      zoom: z.number().min(1).max(MAX_BACKGROUND_ZOOM),
      offsetX: z.number().min(0).max(1),
      offsetY: z.number().min(0).max(1),
    })
    .optional(),
  flattenedStoragePath: z.string().min(1).nullable(),
  scrim: legacyScrimSchema,
  elements: z.array(elementSchemaV1).max(20).optional(),
  layers: z.array(textLayerSchemaV1).max(20),
})

export type CanvasDocV1 = z.infer<typeof canvasDocSchemaV1>
type CanvasTextLayerV1 = z.infer<typeof textLayerSchemaV1>
type CanvasElementV1 = z.infer<typeof elementSchemaV1>

function textNodeFrom(layer: CanvasTextLayerV1): CanvasTextNode {
  return { ...layer, kind: 'text' }
}

// Field-by-field rather than spread-and-omit, so the one v1 field with no v2 counterpart
// (`aboveText`, now expressed as position in the ordering below) is visibly dropped rather than
// silently carried into a doc the write gate would reject.
function imageNodeFrom(element: CanvasElementV1): CanvasImageNode {
  return {
    id: element.id,
    kind: element.kind,
    src: element.src,
    x: element.x,
    y: element.y,
    width: element.width,
    height: element.height,
    ...(element.rotation === undefined ? {} : { rotation: element.rotation }),
    ...(element.opacity === undefined ? {} : { opacity: element.opacity }),
  }
}

/**
 * Upgrade a v1 doc to v2, preserving exactly what v1 drew: elements below the text band, then the
 * text in its own order, then the elements that opted in front of it.
 */
export function upgradeCanvasDoc(doc: CanvasDocV1): CanvasDoc {
  const elements = doc.elements ?? []
  const nodes: CanvasNode[] = [
    ...elements.filter((element) => !element.aboveText).map(imageNodeFrom),
    ...doc.layers.map(textNodeFrom),
    ...elements.filter((element) => element.aboveText).map(imageNodeFrom),
  ]
  return {
    version: 2,
    canvas: doc.canvas,
    background: doc.background,
    ...(doc.backgroundTransform === undefined
      ? {}
      : { backgroundTransform: doc.backgroundTransform }),
    flattenedStoragePath: doc.flattenedStoragePath,
    backdrop: backdropFromScrim(doc.scrim),
    nodes,
  }
}
