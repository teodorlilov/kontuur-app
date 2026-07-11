import { z } from 'zod'
import type { BrandTokens } from '@/lib/scene-graph'

const displayTypeSchema = z.object({
  family: z.string().min(1),
  weights: z.array(z.number().int()).min(1),
  tracking: z.number(),
  case: z.enum(['none', 'upper']),
  lineHeight: z.number().positive(),
})

const bodyTypeSchema = z.object({
  family: z.string().min(1),
  weights: z.array(z.number().int()).min(1),
  tracking: z.number(),
  lineHeight: z.number().positive(),
})

/**
 * Runtime validator for a `BrandTokens` blob before it is written to `brand_kits.tokens` (§1).
 * Rejects a kit missing any of the five colour roles or any structural field. The compile-time parity
 * guard below keeps this schema and the `BrandTokens` type from drifting.
 */
export const brandTokensSchema = z.object({
  color: z.object({
    surface: z.string(),
    ink: z.string(),
    accent: z.string(),
    'accent-deep': z.string(),
    line: z.string(),
  }),
  type: z.object({
    display: displayTypeSchema,
    body: bodyTypeSchema,
    scale: z.number().positive(),
    baseSize: z.number().positive(),
  }),
  space: z.object({
    steps: z.array(z.number()).min(1),
    radius: z.number(),
    hairline: z.number(),
  }),
  grid: z.object({
    marginX: z.number(),
    marginY: z.number(),
    baseline: z.number(),
  }),
})

// Parity guards — fail the build if the schema and the BrandTokens type diverge in either direction.
type SchemaTokens = z.infer<typeof brandTokensSchema>
const _forward: BrandTokens = null as unknown as SchemaTokens
const _backward: SchemaTokens = null as unknown as BrandTokens
void _forward
void _backward

/** Parse unknown input into `BrandTokens`, throwing a `ZodError` if it is invalid. */
export function parseBrandTokens(input: unknown): BrandTokens {
  return brandTokensSchema.parse(input)
}

export type BrandTokensParse =
  | { success: true; tokens: BrandTokens }
  | { success: false; issues: string[] }

/** Non-throwing parse: the validated tokens, or a flat list of `path: message` issues. */
export function safeParseBrandTokens(input: unknown): BrandTokensParse {
  const result = brandTokensSchema.safeParse(input)
  if (result.success) return { success: true, tokens: result.data }
  return {
    success: false,
    issues: result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
  }
}
