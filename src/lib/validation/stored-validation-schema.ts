import { z } from 'zod'
import type {
  LanguageResult,
  SlopDetection,
  SourceGroundingResult,
  ValidationCriteria,
  ValidationScores,
} from '@/types/api'

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
  // Nullable, not `.catch(0)`: on a 0-10 scale, 0 is the strongest possible
  // negative claim — the same lie as a fabricated pass, inverted.
  overall_score: z.number().nullable().catch(null),
  human_score: z.number().nullable().catch(null),
  language_score: z.number().nullable().catch(null),
  source_score: z.number().nullable().catch(null),
})

/**
 * The evidence trail (2026-08): language fixes, slop and grounding used to live
 * only in the wizard's memory, so the review queue could not show them. They
 * are stored trimmed — the applied corrections themselves are already baked
 * into the saved copy, so `corrected_text`/`corrected_slides` stay out.
 * Every field is optional and degrades to absent: rows written before this
 * shape (or with a malformed section) parse exactly as they did before.
 */
const storedLanguageSchema = z.object({
  passes: z.boolean().catch(true),
  language_score: z.number().nullable().catch(null),
  issues: z
    .array(
      z.object({
        type: z.string().catch(''),
        original_text: z.string().catch(''),
        issue_description: z.string().catch(''),
        suggested_fix: z.string().catch(''),
        // Absent on rows stored before the stamp existed — the panel treats
        // "unknown" as applied, matching what it claimed for those rows anyway.
        applied: z.boolean().optional().catch(undefined),
      })
    )
    .catch([]),
})

const storedSlopSchema = z.object({
  reads_as_human: z.boolean().nullable().catch(null),
  ai_tells_found: z.array(z.string()).catch([]),
  worst_offending_phrase: z.string().nullable().catch(null),
  human_authenticity_score: z.number().nullable().catch(null),
})

const storedGroundingSchema = z.object({
  grounded: z.boolean().catch(true),
  grounding_score: z.number().catch(0),
  flagged_claims: z
    .array(
      z.object({
        // Malformed status degrades to the warn rendering, never to a false "matched".
        status: z.enum(['grounded', 'ungrounded', 'partially_grounded']).catch('partially_grounded'),
        claim: z.string().catch(''),
        source_evidence: z.string().nullable().catch(null),
      })
    )
    .catch([]),
})

const storedValidationSchema = z.object({
  criteria: criteriaSchema,
  scores: scoresSchema,
  language: storedLanguageSchema.optional().catch(undefined),
  slop: storedSlopSchema.optional().catch(undefined),
  sourceGrounding: storedGroundingSchema.optional().catch(undefined),
})

// Fails the build if the schema and the hand-written types drift apart — the guard convention from
// lib/canvas/doc-schema.ts. Both directions hold for the scores; it is `criteriaSchema` that
// narrows `source_claims` to unknown[] (nothing renders its contents), which is why the cast in
// parseStoredValidation carries a WHY.
type SchemaScores = z.infer<typeof scoresSchema>
const _scoresForward: ValidationScores = null as unknown as SchemaScores
const _scoresBackward: SchemaScores = null as unknown as ValidationScores
void _scoresForward
void _scoresBackward

// Same drift guard for the slop section — it is stored whole, so both
// directions must hold.
type SchemaSlop = z.infer<typeof storedSlopSchema>
const _slopForward: SlopDetection = null as unknown as SchemaSlop
const _slopBackward: SchemaSlop = null as unknown as SlopDetection
void _slopForward
void _slopBackward

/** Language and grounding minus the corrections already applied to the copy. */
export type StoredLanguage = Pick<LanguageResult, 'passes' | 'language_score' | 'issues'>
export type StoredGrounding = Pick<
  SourceGroundingResult,
  'grounded' | 'grounding_score' | 'flagged_claims'
>

export interface StoredValidation {
  criteria: ValidationCriteria
  scores: ValidationScores
  language?: StoredLanguage
  slop?: SlopDetection
  sourceGrounding?: StoredGrounding
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

/**
 * The write side of this module: what generation persists into
 * `posts.validation_json`. One builder for every writer (wizard stream, cron,
 * rewrite) so the stored shape cannot drift between them.
 */
export function buildStoredValidation(validation: {
  criteria: ValidationCriteria
  scores: ValidationScores
  language: LanguageResult
  slop: SlopDetection
  sourceGrounding?: SourceGroundingResult
}): StoredValidation {
  return {
    criteria: validation.criteria,
    scores: validation.scores,
    language: {
      passes: validation.language.passes,
      language_score: validation.language.language_score,
      issues: validation.language.issues,
    },
    slop: validation.slop,
    ...(validation.sourceGrounding
      ? {
          sourceGrounding: {
            grounded: validation.sourceGrounding.grounded,
            grounding_score: validation.sourceGrounding.grounding_score,
            flagged_claims: validation.sourceGrounding.flagged_claims,
          },
        }
      : {}),
  }
}
