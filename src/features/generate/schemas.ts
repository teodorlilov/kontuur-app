import { z } from 'zod'

/** Input for logging an explicitly discarded wizard draft. */
export const discardedDraftSchema = z.object({
  clientId: z.uuid(),
  clientSourceId: z.uuid().nullable(),
  pillar: z.string().max(200).nullable(),
  sourceUrl: z.string().max(2000).nullable(),
  sourceType: z.string().max(40).nullable(),
  platform: z.string().max(40).nullable(),
})

export type DiscardedDraftInput = z.infer<typeof discardedDraftSchema>
