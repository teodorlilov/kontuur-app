import { z } from 'zod'
import type { CanvasDoc } from '@/types/canvas'
import { CANVAS_DOC_VERSION, MAX_BACKGROUND_ZOOM } from './constants'

const HEX = /^#[0-9a-fA-F]{6}$/
const hex = z.string().regex(HEX, 'must be a #rrggbb hex colour')

const textLayerSchema = z.object({
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
  textOverridden: z.boolean().optional(),
})

const scrimSchema = z.object({
  enabled: z.boolean(),
  color: hex,
  opacity: z.number().min(0).max(1),
  mode: z.enum(['full', 'bottom']),
})

const backgroundSchema = z.object({
  publicUrl: z.string().min(1),
  storagePath: z.string().min(1),
})

const backgroundTransformSchema = z.object({
  zoom: z.number().min(1).max(MAX_BACKGROUND_ZOOM),
  offsetX: z.number().min(0).max(1),
  offsetY: z.number().min(0).max(1),
})

/**
 * Runtime validator for a `CanvasDoc` before it is written to `post_canvas_docs.doc` — the single
 * write-gate. Readers safeParse and treat failures as "no doc" (reseed), never a hard error. The
 * parity guards below fail the build if this schema and the `CanvasDoc` type drift apart.
 */
export const canvasDocSchema = z.object({
  version: z.literal(CANVAS_DOC_VERSION),
  canvas: z.object({ w: z.number().int().positive(), h: z.number().int().positive() }),
  background: backgroundSchema,
  backgroundTransform: backgroundTransformSchema.optional(),
  flattenedStoragePath: z.string().min(1).nullable(),
  scrim: scrimSchema,
  layers: z.array(textLayerSchema).max(20),
})

type SchemaDoc = z.infer<typeof canvasDocSchema>
const _forward: CanvasDoc = null as unknown as SchemaDoc
const _backward: SchemaDoc = null as unknown as CanvasDoc
void _forward
void _backward

/** Parse unknown input into a `CanvasDoc`, throwing a `ZodError` if it is invalid. */
export function parseCanvasDoc(input: unknown): CanvasDoc {
  return canvasDocSchema.parse(input)
}

export type CanvasDocParse =
  | { success: true; doc: CanvasDoc }
  | { success: false; issues: string[] }

/** Non-throwing parse: the validated doc, or a flat list of `path: message` issues. */
export function safeParseCanvasDoc(input: unknown): CanvasDocParse {
  const result = canvasDocSchema.safeParse(input)
  if (result.success) return { success: true, doc: result.data }
  return {
    success: false,
    issues: result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
  }
}
