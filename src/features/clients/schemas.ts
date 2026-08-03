import { z } from 'zod'
import { visualIdentitySchema } from '@/lib/visual/identity-schema'
import type { SourceStrategy } from '@/types/sources'
import type { SourceKind } from '@/types/visual'

/**
 * The one declaration of the client write shape, shared by both write paths — the `createClient`
 * and `updateClient` actions.
 *
 * Every boundary parses with these schemas rather than trusting its caller, and `z.object` strips
 * unknown keys, so an unexpected field can never reach an `update()` call.
 */

const sourceStrategySchema = z.object({
  require_source_grounding: z.boolean().optional(),
})

const sourceKindSchema = z.enum(['default', 'website', 'manual'])

// Fails the build if SourceStrategy and the schema drift apart — the guard convention from
// src/lib/visual/identity-schema.ts.
type SchemaSourceStrategy = z.infer<typeof sourceStrategySchema>
const _sourceStrategyForward: SourceStrategy = null as unknown as SchemaSourceStrategy
const _sourceStrategyBackward: SchemaSourceStrategy = null as unknown as SourceStrategy
void _sourceStrategyForward
void _sourceStrategyBackward

type SchemaSourceKind = z.infer<typeof sourceKindSchema>
const _sourceKindForward: SourceKind = null as unknown as SchemaSourceKind
const _sourceKindBackward: SchemaSourceKind = null as unknown as SourceKind
void _sourceKindForward
void _sourceKindBackward

/**
 * Brand profile fields, all optional so a caller can send only what changed.
 *
 * Deliberately no format constraints beyond type: this guards the boundary against malformed
 * input, it is not a place to introduce new business rules. A stricter rule here would reject
 * saves on rows that predate it and lock users out of their own settings.
 */
export const brandProfileInputSchema = z.object({
  tone: z.string().nullable().optional(),
  target_audience: z.string().nullable().optional(),
  social_goals: z.string().nullable().optional(),
  content_pillars: z.string().nullable().optional(),
  avoid_topics: z.string().nullable().optional(),
  default_post_type: z.string().optional(),
  default_carousel_slides: z.number().int().positive().optional(),
  weekly_mix_json: z.record(z.string(), z.number()).optional(),
  language_formality: z.string().optional(),
  secondary_language: z.string().nullable().optional(),
  is_health_niche: z.boolean().optional(),
  source_strategy: sourceStrategySchema.optional(),
  language_notes: z.string().nullable().optional(),
})

/** Posting schedule fields, all optional. */
export const scheduleInputSchema = z.object({
  is_active: z.boolean().optional(),
  frequency_type: z.string().optional(),
  frequency_value: z.number().int().positive().optional(),
  auto_generate_day: z.string().optional(),
  auto_generate_time: z.string().optional(),
})

/** Core client columns, all optional — shared by the create and update shapes. */
const clientFieldsSchema = z.object({
  niche: z.string().nullable().optional(),
  posts_per_week: z.number().int().positive().optional(),
  language: z.string().optional(),
  website_url: z.string().nullable().optional(),
  contact_email: z.string().nullable().optional(),
})

/** Input to the `updateClient` server action. Every group is optional: only dirty groups are sent. */
export const updateClientSchema = clientFieldsSchema.extend({
  name: z.string().trim().min(1, 'Client name is required').optional(),
  brand_profile: brandProfileInputSchema.optional(),
  posting_schedule: scheduleInputSchema.optional(),
  visual_identity: visualIdentitySchema.optional(),
})

/** Input to the `createClient` action — the onboarding path. Name is the only required field. */
export const createClientSchema = clientFieldsSchema.extend({
  name: z.string().trim().min(1, 'Client name is required'),
  brand_profile: brandProfileInputSchema.optional(),
  posting_schedule: scheduleInputSchema.optional(),
  visual_identity: visualIdentitySchema.optional(),
  visual_identity_source: sourceKindSchema.optional(),
})

export type UpdateClientInput = z.infer<typeof updateClientSchema>
export type CreateClientInput = z.infer<typeof createClientSchema>
export type BrandProfileInput = z.infer<typeof brandProfileInputSchema>
export type ScheduleInput = z.infer<typeof scheduleInputSchema>

/** Flattens a ZodError into `path: message` lines for a single boundary log. */
export function formatIssues(error: z.ZodError): string {
  return error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')
}
