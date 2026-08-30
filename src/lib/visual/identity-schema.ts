import { z } from 'zod'
import { formatZodIssues } from '@/lib/validation/format-issues'
import type { VisualIdentity } from '@/types/visual'
import { BRAND_STYLE_IDS, DEFAULT_BRAND_STYLE_ID } from './brand-styles'
import { FONT_FAMILY_NAMES } from '@/lib/canvas/font-library'
import type { ColorScheme } from './color-scheme'
import type { SeedIdentity } from '@/lib/canvas/seed-doc'
import { HEX_COLOR } from '@/lib/validation'

const hex = z.string().regex(HEX_COLOR, 'must be a #rrggbb hex colour')

/**
 * A client's type pairing. Constrained to the library, never a free string: Konva writes
 * `fontFamily` straight into `ctx.font` with no fallback list, so an off-library name is never
 * requested from the CDN, never awaited, and silently rendered in the OS default — which then bakes
 * into the exported JPEG with no error anywhere.
 */
const fontChoice = z.object({
  display: z.enum(FONT_FAMILY_NAMES),
  body: z.enum(FONT_FAMILY_NAMES),
})

const paletteSchema = z.object({
  surface: hex,
  ink: hex,
  accent: hex,
  'accent-deep': hex,
  line: hex,
})

/**
 * The ground/accent pair, over the wire. One definition because three boundaries now carry it — the
 * draft-visual request, the post insert, and back out on the generate response — and a colour pair
 * that validates differently at each of them is a pair that desynchronises at one of them.
 */
export const colorSchemeSchema = z.object({ ground: hex, accent: hex })

const _schemeForward: ColorScheme = null as unknown as z.infer<typeof colorSchemeSchema>
const _schemeBackward: z.infer<typeof colorSchemeSchema> = null as unknown as ColorScheme
void _schemeForward
void _schemeBackward

/**
 * What a surface needs to SEED a canvas doc — the palette, the brand style, and the client's name.
 *
 * Deliberately NOT `visualIdentitySchema`. That one validates the stored `brand_visual_identity.identity`
 * blob, and the client's name is not part of it — it lives on `clients` and duplicating it into the
 * blob would give one fact two homes that drift. But the two shapes were being conflated: the canvas
 * route hand-built `{ palette, style }` in two places, the client re-derived the same pair through
 * `safeParseVisualIdentity`, and when `clientName` was added to `SeedIdentity` the stored-blob schema
 * silently stripped it — so the `quote` lockup got its byline on wizard drafts and lost it on every
 * persisted post, which made the picker stop recognising an approved draft's own layout.
 *
 * One schema, both directions guarded, so a field added to `SeedIdentity` fails the build until every
 * wire that carries it is updated.
 */
export const seedIdentitySchema = z.object({
  palette: paletteSchema,
  style: z.string().optional(),
  clientName: z.string().min(1).optional(),
  fonts: fontChoice.optional(),
})

const _seedForward: SeedIdentity = null as unknown as z.infer<typeof seedIdentitySchema>
const _seedBackward: z.infer<typeof seedIdentitySchema> = null as unknown as SeedIdentity
void _seedForward
void _seedBackward

/** The seed identity for a client, from their stored kit and their name. The ONE place it is built. */
export function toSeedIdentity(identity: VisualIdentity, clientName: string): SeedIdentity {
  return {
    palette: identity.palette,
    style: identity.style,
    clientName,
    ...(identity.fonts ? { fonts: identity.fonts } : {}),
  }
}

/** Non-throwing parse of a seed identity off the wire; null when the body carries nothing usable. */
export function parseSeedIdentity(value: unknown): SeedIdentity | null {
  if (value === null || value === undefined) return null
  const parsed = seedIdentitySchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

/**
 * Runtime validator for a `VisualIdentity` blob before it is written to `brand_visual_identity.identity`
 * — the single write-gate. Rejects a kit missing a colour role or a non-hex value. `style` defaults so
 * pre-style `{ palette }` rows keep parsing. The parity guards below fail the build if this schema and
 * the `VisualIdentity` type drift apart.
 */
export const visualIdentitySchema = z.object({
  palette: paletteSchema,
  style: z.enum(BRAND_STYLE_IDS).default(DEFAULT_BRAND_STYLE_ID),
  palette_description: z.string().min(1).optional(),
  fonts: fontChoice.optional(),
})

type SchemaIdentity = z.infer<typeof visualIdentitySchema>
const _forward: VisualIdentity = null as unknown as SchemaIdentity
const _backward: SchemaIdentity = null as unknown as VisualIdentity
void _forward
void _backward

type VisualIdentityParse =
  | { success: true; identity: VisualIdentity }
  | { success: false; issues: string[] }

/** Non-throwing parse: the validated identity, or a flat list of `path: message` issues. */
export function safeParseVisualIdentity(input: unknown): VisualIdentityParse {
  const result = visualIdentitySchema.safeParse(input)
  if (result.success) return { success: true, identity: result.data }
  return { success: false, issues: formatZodIssues(result.error) }
}
