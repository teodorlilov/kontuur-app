import { z } from 'zod'

/**
 * Meta Graph / Instagram Business Login response shapes.
 *
 * These are third-party responses, so they are parsed rather than asserted: the
 * OAuth callback writes their contents straight into social_connections, and a
 * shape change at Meta's end used to surface as `undefined` in the database
 * instead of an error at the boundary.
 *
 * Every schema is permissive about extra keys (Meta adds fields freely) and
 * strict about the ones we store.
 */

/**
 * Business Login wraps the token in a data array ({"data":[{access_token,...}]});
 * the legacy flat shape ({access_token,...}) still appears on some responses.
 * `user_id` arrives as a number or a string depending on the shape, so it is
 * coerced — everything downstream stores it as text.
 */
export const igShortLivedTokenSchema = z.looseObject({
  access_token: z.string().min(1),
  user_id: z.union([z.string(), z.number()]).transform(String),
})

/** The Business Login wrapper. Tried first; the flat schema above is the fallback. */
export const igShortLivedWrappedSchema = z.looseObject({
  data: z.array(igShortLivedTokenSchema).min(1),
})

export const igLongLivedTokenSchema = z.looseObject({
  access_token: z.string().min(1),
  token_type: z.string().optional(),
  expires_in: z.number(),
})

export const fbTokenResponseSchema = z.looseObject({
  access_token: z.string().min(1),
  token_type: z.string().optional(),
  expires_in: z.number().optional(),
})

export const igUserSchema = z.looseObject({
  id: z.string(),
  username: z.string().optional(),
  name: z.string().optional(),
})

export const fbPageSchema = z.looseObject({
  id: z.string(),
  name: z.string(),
  access_token: z.string(),
})

/** Meta returns `{ error: { message } }` with a 200 on some failures, so both arms are optional. */
export const fbPagesResponseSchema = z.looseObject({
  data: z.array(fbPageSchema).optional(),
  error: z.looseObject({ message: z.string() }).optional(),
})

export const fbBusinessPagesResponseSchema = z.looseObject({
  data: z
    .array(z.looseObject({ owned_pages: z.looseObject({ data: z.array(fbPageSchema) }).optional() }))
    .optional(),
})

/** ig_refresh_token response; `error` arrives instead of a token when the refresh is rejected. */
export const igRefreshResponseSchema = z.looseObject({
  access_token: z.string().optional(),
  expires_in: z.number().optional(),
  error: z.looseObject({ message: z.string().optional() }).optional(),
})

export type IGShortLivedToken = { access_token: string; user_id: string }
export type IGLongLivedToken = z.infer<typeof igLongLivedTokenSchema>
export type FBTokenResponse = z.infer<typeof fbTokenResponseSchema>
export type FBPage = z.infer<typeof fbPageSchema>
export type IGRefreshResponse = z.infer<typeof igRefreshResponseSchema>
