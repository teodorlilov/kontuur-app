import { z } from 'zod'
import type { VisualIdentity } from '@/types/visual'
import { BRAND_STYLE_IDS, DEFAULT_BRAND_STYLE_ID } from './brand-styles'

const HEX = /^#[0-9a-fA-F]{6}$/
const hex = z.string().regex(HEX, 'must be a #rrggbb hex colour')

const paletteSchema = z.object({
  surface: hex,
  ink: hex,
  accent: hex,
  'accent-deep': hex,
  line: hex,
})

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
})

type SchemaIdentity = z.infer<typeof visualIdentitySchema>
const _forward: VisualIdentity = null as unknown as SchemaIdentity
const _backward: SchemaIdentity = null as unknown as VisualIdentity
void _forward
void _backward

/** Parse unknown input into `VisualIdentity`, throwing a `ZodError` if it is invalid. */
export function parseVisualIdentity(input: unknown): VisualIdentity {
  return visualIdentitySchema.parse(input)
}

export type VisualIdentityParse =
  | { success: true; identity: VisualIdentity }
  | { success: false; issues: string[] }

/** Non-throwing parse: the validated identity, or a flat list of `path: message` issues. */
export function safeParseVisualIdentity(input: unknown): VisualIdentityParse {
  const result = visualIdentitySchema.safeParse(input)
  if (result.success) return { success: true, identity: result.data }
  return {
    success: false,
    issues: result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
  }
}
