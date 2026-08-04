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

/**
 * The client-switch refetch of GET /api/clients/[id], validated at the
 * boundary. clientData is deliberately loose — its large shape is already
 * typed as ClientData and trusted from our own API, matching today's
 * behaviour; the fields new to the redesign are validated strictly.
 */
export const clientRefreshSchema = z.object({
  clientData: z.unknown().optional(),
  sources: z
    .array(
      z.object({
        id: z.string(),
        type: z.string(),
        label: z.string(),
        url: z.string().nullable(),
        pillar_ids: z.array(z.string()).nullable(),
      })
    )
    .default([]),
  connections: z
    .array(
      z.object({
        id: z.string(),
        platform: z.string(),
        account_id: z.string(),
        account_name: z.string(),
        token_expires_at: z.string().nullable(),
        created_at: z.string(),
      })
    )
    .default([]),
})

export type ClientRefresh = z.infer<typeof clientRefreshSchema>
