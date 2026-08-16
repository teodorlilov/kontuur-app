import { z } from 'zod'
import { formatZodIssues } from '@/lib/validation/format-issues'
import type { CanvasDoc } from '@/types/canvas'
import { CANVAS_DOC_VERSION, MAX_BACKGROUND_ZOOM, MAX_NODES } from './constants'
import { canvasDocSchemaV1, upgradeCanvasDoc } from './doc-v1'

const HEX = /^#[0-9a-fA-F]{6}$/
const hex = z.string().regex(HEX, 'must be a #rrggbb hex colour')

const nodeBase = {
  id: z.string().min(1),
  x: z.number(),
  y: z.number(),
  rotation: z.number().min(-180).max(180).optional(),
  opacity: z.number().min(0).max(1).optional(),
  hidden: z.boolean().optional(),
  locked: z.boolean().optional(),
}

const textNodeSchema = z.object({
  ...nodeBase,
  kind: z.literal('text'),
  role: z.enum(['headline', 'body', 'custom']),
  text: z.string(),
  width: z.number().positive(),
  fontFamily: z.string().min(1),
  fontSize: z.number().min(8).max(400),
  fontWeight: z.union([z.literal(400), z.literal(500), z.literal(600), z.literal(700)]),
  fill: hex,
  align: z.enum(['left', 'center', 'right']),
  lineHeight: z.number().min(0.8).max(3),
  uppercase: z.boolean().optional(),
  italic: z.boolean().optional(),
  highlight: hex.optional(),
  textOverridden: z.boolean().optional(),
})

const imageNodeSchema = z.object({
  ...nodeBase,
  kind: z.enum(['image', 'svg']),
  src: z.object({ publicUrl: z.string().min(1), storagePath: z.string().min(1) }),
  width: z.number().positive(),
  height: z.number().positive(),
  flipX: z.boolean().optional(),
  flipY: z.boolean().optional(),
})

const shapeNodeSchema = z.object({
  ...nodeBase,
  kind: z.enum(['rect', 'ellipse', 'line']),
  width: z.number().positive(),
  height: z.number().positive(),
  fill: hex.optional(),
  stroke: hex.optional(),
  // min(1), not min(0): a stroke of 0 draws nothing, and `line` is nothing BUT its stroke — a
  // zero-width line would be an invisible node the user cannot find. The ceiling exists for the
  // same reason fontSize is bounded: a corrupt doc must not make the exporter draw a 1e9px rule.
  strokeWidth: z.number().min(1).max(200).optional(),
  cornerRadius: z.number().min(0).max(400).optional(),
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
 * Runtime validator for a `CanvasDoc` before it is written to `post_canvas_docs.doc` — v2-only,
 * because nothing writes v1 any more. Deliberately NOT exported: every caller goes through
 * `parseCanvasDoc` (the write gate) or `safeParseCanvasDoc` (which upgrades v1 rows on the way in),
 * so no reader can bypass the upgrade by reaching for the schema directly. The parity guards below
 * fail the build if this schema and the `CanvasDoc` type drift apart.
 */
const canvasDocSchema = z.object({
  version: z.literal(CANVAS_DOC_VERSION),
  canvas: z.object({ w: z.number().int().positive(), h: z.number().int().positive() }),
  background: backgroundSchema,
  backgroundTransform: backgroundTransformSchema.optional(),
  flattenedStoragePath: z.string().min(1).nullable(),
  scrim: scrimSchema,
  nodes: z
    .array(z.discriminatedUnion('kind', [textNodeSchema, imageNodeSchema, shapeNodeSchema]))
    .max(MAX_NODES),
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

/**
 * Non-throwing read of a stored doc, whatever version it was written at: v2 parses directly, v1 is
 * validated against its own schema and upgraded. Anything else — including a version from the
 * future — is a failure the caller treats as "no doc" and reseeds from.
 *
 * Dispatching on the stored version rather than trying each schema in turn is what makes the issue
 * list useful: a broken v1 row reports against v1's rules, not v2's.
 */
export function safeParseCanvasDoc(input: unknown): CanvasDocParse {
  if (storedVersion(input) === 1) {
    const legacy = canvasDocSchemaV1.safeParse(input)
    if (legacy.success) return { success: true, doc: upgradeCanvasDoc(legacy.data) }
    return { success: false, issues: formatZodIssues(legacy.error) }
  }
  const result = canvasDocSchema.safeParse(input)
  if (result.success) return { success: true, doc: result.data }
  return { success: false, issues: formatZodIssues(result.error) }
}

function storedVersion(input: unknown): number | null {
  if (typeof input !== 'object' || input === null) return null
  const version = (input as { version?: unknown }).version
  return typeof version === 'number' ? version : null
}
