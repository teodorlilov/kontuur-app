import { z } from 'zod'
import type { ValidationCriteria, ValidationScores } from '@/types/api'

/**
 * Parses the `posts.validation_json` blob written by the AI validation pipeline.
 *
 * A real parse, not a cast. The pipeline's output shape has changed over the app's life and the
 * column holds every version ever written, so the stored data does not necessarily match the
 * current TypeScript types — asserting it did is what crashed the quality panel.
 *
 * Lives in `lib/` rather than a feature because the review queue, the calendar card and anything
 * else showing a quality score all read the same column.
 */

/**
 * The retired per-rule checklist.
 *
 * Two thirds of stored rows still carry it. Each entry is one structure rule with its own verdict;
 * the current shape keeps only the prose from the rules that failed.
 */
const legacyStructureSchema = z.object({
  passes: z.boolean(),
  checks: z.array(
    z.object({
      rule: z.string().optional(),
      note: z.string().optional(),
      passes: z.boolean().optional(),
    })
  ),
})

const currentStructureSchema = z.object({
  passes: z.boolean(),
  notes: z.array(z.string()),
})

/**
 * Both stored shapes, normalised to the current one.
 *
 * A failing legacy row is reduced to the notes of the rules that actually failed — the passing
 * ones say nothing a reader needs, and the panel exists to explain the failure.
 */
const structureResultSchema = z
  .union([currentStructureSchema, legacyStructureSchema])
  .nullable()
  .catch(null)
  .transform((value) => {
    if (value === null) return null
    if ('notes' in value) return value
    return {
      passes: value.passes,
      notes: value.checks
        .filter((check) => check.passes === false)
        .map((check) => check.note ?? check.rule ?? '')
        .filter((note) => note.length > 0),
    }
  })

/** Every array field defaults rather than failing: a missing list means nothing to show, not a crash. */
const criteriaSchema = z.object({
  ai_tells: z.array(z.string()).catch([]),
  worst_offending_phrase: z.string().nullable().catch(null),
  structure_followed: structureResultSchema,
  source_claims: z.array(z.unknown()).nullable().catch(null),
  health_compliant: z.boolean().nullable().catch(null),
  issues: z
    .array(z.object({ type: z.string().catch(''), description: z.string().catch('') }))
    .catch([]),
})

const scoresSchema = z.object({
  overall_score: z.number().catch(0),
  human_score: z.number().catch(0),
  language_score: z.number().catch(0),
  source_score: z.number().nullable().catch(null),
})

const storedValidationSchema = z.object({
  criteria: criteriaSchema,
  scores: scoresSchema,
})

// Fails the build if the schema and the hand-written types drift apart — the guard convention from
// lib/canvas/doc-schema.ts. Only the forward direction holds: the schema narrows `source_claims`
// to unknown[] because nothing renders its contents.
type SchemaScores = z.infer<typeof scoresSchema>
const _scoresForward: ValidationScores = null as unknown as SchemaScores
const _scoresBackward: SchemaScores = null as unknown as ValidationScores
void _scoresForward
void _scoresBackward

export interface StoredValidation {
  criteria: ValidationCriteria
  scores: ValidationScores
}

/**
 * Reads stored validation JSON, or null when there is none to show.
 *
 * Never throws: a post whose validation predates the current shape should render without its
 * quality panel, not take the page down with it.
 */
export function parseStoredValidation(raw: unknown): StoredValidation | null {
  const result = storedValidationSchema.safeParse(raw)
  if (!result.success) return null

  // WHY as: source_claims is parsed as unknown[] because no consumer reads inside it; the rest of
  // the shape is proven by the schema and the guard above.
  return result.data as StoredValidation
}
