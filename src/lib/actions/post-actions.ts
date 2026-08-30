'use server'

import 'server-only'
import { revalidateTag } from 'next/cache'
import { validateInstagramCaption } from '@/features/publishing/lib/validate-caption'
import { z } from 'zod'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { resolveActionAuth, fetchOwnedPost, verifyPostsOwnership } from '@/lib/auth/helpers'
import { parseStoredValidation } from '@/lib/validation/stored-validation-schema'
import { parsePostUpdate, type UpdatePostInput } from '@/lib/validation/post-update-schema'
import { DISCARD_REASONS } from '@/lib/validation'
import type { ActionResult } from './types'

const deletePostOptionsSchema = z.object({ reason: z.enum(DISCARD_REASONS).optional() }).optional()

const savePostCopySchema = z.object({
  caption: z.string(),
  slides_json: z.unknown(),
})

const persistRewriteSchema = z.object({
  caption: z.string(),
  slides_json: z.unknown(),
  quality_score_avg: z.number().nullable(),
  validation: z.unknown(),
})

/** Update a post's fields. */
export async function updatePost(postId: string, fields: UpdatePostInput): Promise<ActionResult> {
  // Parsed before auth, matching `savePostCopy` below: a malformed payload is the
  // caller's own bug and says nothing about the post, so there is nothing to leak by
  // answering it first.
  const parsed = parsePostUpdate(fields)
  if (!parsed.ok) return { ok: false, error: parsed.error }

  const auth = await resolveActionAuth()
  if (!auth.ok) return { ok: false, error: auth.error }
  const { supabase, agencyId } = auth

  const post = await fetchOwnedPost(supabase, postId, agencyId)
  if (!post) return { ok: false, error: 'Post not found' }

  const { error } = await supabase.from('posts').update(parsed.updates).eq('id', postId)
  if (error) return { ok: false, error: error.message }

  revalidateTag('client-post-stats', 'max')
  return { ok: true, data: undefined }
}

/** Clear any active change request on a post by setting token status to 'resolved'. */
export async function resolveChangeRequest(postId: string): Promise<ActionResult> {
  const auth = await resolveActionAuth()
  if (!auth.ok) return { ok: false, error: auth.error }
  const { supabase, agencyId } = auth

  const post = await fetchOwnedPost(supabase, postId, agencyId)
  if (!post) return { ok: false, error: 'Post not found' }

  const { error } = await supabase
    .from('post_approval_tokens')
    .update({ status: 'resolved' })
    .eq('post_id', postId)
    .eq('status', 'changes_requested')
  // Reporting success on a dropped write leaves the change request showing as
  // open on every surface that reads the token.
  if (error) return { ok: false, error: error.message }

  revalidateTag('client-post-stats', 'max')
  return { ok: true, data: undefined }
}

/**
 * Persist working-copy edits (caption + slides) on a post. Deliberately does
 * NOT revalidate 'client-post-stats': copy edits change no count or stat that
 * tag protects, and this runs on every autosave flush — busting the
 * layout-wide cache per typing pause forced a full route-tree re-render each
 * time. Status transitions keep going through updatePost, which revalidates.
 */
export async function savePostCopy(
  postId: string,
  edits: { caption: string; slides_json: unknown }
): Promise<ActionResult> {
  const parsed = savePostCopySchema.safeParse(edits)
  if (!parsed.success) return { ok: false, error: 'Invalid edits' }

  const auth = await resolveActionAuth()
  if (!auth.ok) return { ok: false, error: auth.error }
  const { supabase, agencyId } = auth

  const post = await fetchOwnedPost(supabase, postId, agencyId)
  if (!post) return { ok: false, error: 'Post not found' }

  const updates: Record<string, unknown> = {
    caption: parsed.data.caption,
    slides_json: parsed.data.slides_json,
  }
  const { error } = await supabase.from('posts').update(updates).eq('id', postId)
  if (error) return { ok: false, error: error.message }

  return { ok: true, data: undefined }
}

/**
 * Persist a rewrite: the fresh copy, its score, the rewrite bookkeeping and
 * the full stored validation. The evidence is validated AND trimmed in one
 * step by parseStoredValidation — building it here keeps the zod schema out
 * of the client bundle. rewrite_count increments server-side so a stale
 * client copy cannot regress it.
 */
export async function persistRewrite(
  postId: string,
  input: {
    caption: string
    slides_json: unknown
    quality_score_avg: number | null
    validation: unknown
  }
): Promise<ActionResult<{ rewriteCount: number }>> {
  const parsed = persistRewriteSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Invalid rewrite payload' }
  const stored = parseStoredValidation(parsed.data.validation)
  if (!stored) return { ok: false, error: 'Invalid rewrite validation' }

  const auth = await resolveActionAuth()
  if (!auth.ok) return { ok: false, error: auth.error }
  const { supabase, agencyId } = auth

  const post = await fetchOwnedPost(supabase, postId, agencyId)
  if (!post) return { ok: false, error: 'Post not found' }

  // A failed read here is not "no rewrites yet": treating it as 0 silently
  // resets the counter to 1 and loses the post's rewrite history.
  const { data: row, error: countError } = await supabase
    .from('posts')
    .select('rewrite_count')
    .eq('id', postId)
    .maybeSingle()
  if (countError) return { ok: false, error: countError.message }
  const rewriteCount = (row?.rewrite_count ?? 0) + 1

  const updates: Record<string, unknown> = {
    caption: parsed.data.caption,
    slides_json: parsed.data.slides_json,
    // Re-baseline the AI text: a rewrite's delta is the AI's, not the
    // reviewer's, so the edit-diff (caption vs generated_caption) must reset —
    // and updating these in the same statement is what tells the edited_at
    // trigger this was not a human edit.
    generated_caption: parsed.data.caption,
    generated_slides_json: parsed.data.slides_json,
    quality_score_avg: parsed.data.quality_score_avg,
    was_rewritten: true,
    rewrite_count: rewriteCount,
    validation_json: stored,
  }
  const { error } = await supabase.from('posts').update(updates).eq('id', postId)
  if (error) return { ok: false, error: error.message }

  // A rewrite moves the quality average, which the stats tag reports.
  revalidateTag('client-post-stats', 'max')
  return { ok: true, data: { rewriteCount } }
}

/** Delete a post by ID, recording its outcome (and the reviewer's reason) as a review discard first. */
export async function deletePost(
  postId: string,
  options?: { reason?: string }
): Promise<ActionResult> {
  const parsedOptions = deletePostOptionsSchema.safeParse(options)
  if (!parsedOptions.success) return { ok: false, error: 'Invalid discard reason' }

  const auth = await resolveActionAuth()
  if (!auth.ok) return { ok: false, error: auth.error }
  const { supabase, agencyId } = auth

  const post = await fetchOwnedPost(supabase, postId, agencyId)
  if (!post) return { ok: false, error: 'Post not found' }

  // Outcome telemetry: best-effort — a failed log must never block the delete.
  // Only pending_review drafts count as a discard — deleting an already-approved
  // or published post is housekeeping, not a rejection of its source (and it
  // already counted as an approval, so logging a discard would double-skew stats).
  // discarded_drafts is service-role-only (RLS with no policies), so the insert
  // must go through the admin client — the user-scoped one fails silently.
  try {
    const { data: row } = await supabase
      .from('posts')
      .select('client_id, client_source_id, pillar, source_url, source_type, platform, status')
      .eq('id', postId)
      .single()
    if (row?.client_id && row.status === 'pending_review') {
      const admin = createAdminSupabaseClient()
      const discardRow = {
        client_id: row.client_id,
        client_source_id: row.client_source_id ?? null,
        pillar: row.pillar ?? null,
        source_url: row.source_url ?? null,
        source_type: row.source_type ?? null,
        platform: row.platform ?? null,
        discarded_from: 'review',
        reason: parsedOptions.data?.reason ?? null,
      }
      const { error: discardError } = await admin.from('discarded_drafts').insert(discardRow)
      if (discardError) {
        console.error('[posts] failed to log review discard:', discardError.message)
      }
    }
  } catch (err) {
    console.error('[posts] failed to log review discard:', err)
  }

  const { error } = await supabase.from('posts').delete().eq('id', postId)
  if (error) return { ok: false, error: error.message }

  revalidateTag('client-post-stats', 'max')
  return { ok: true, data: undefined }
}

/** Schedule multiple posts in a single action call. */
export async function batchSchedulePosts(
  items: Array<{ postId: string; scheduledAt: string }>
): Promise<ActionResult<{ succeeded: number; total: number }>> {
  const auth = await resolveActionAuth()
  if (!auth.ok) return { ok: false, error: auth.error }
  const { supabase, agencyId } = auth

  const allIds = items.map((i) => i.postId)
  const verifiedIds = await verifyPostsOwnership(supabase, allIds, agencyId)

  // Caption limits are checked at schedule time so the problem surfaces in the
  // calendar, not as a burned publish attempt days later. Instagram-bound posts
  // only — and today every schedulable post is Instagram-bound.
  const { data: captionRows } = await supabase
    .from('posts')
    .select('id, caption')
    .in('id', [...verifiedIds])
  const captionBlocked = new Map<string, string>()
  for (const row of captionRows ?? []) {
    const problem = validateInstagramCaption(row.caption ?? '')
    if (problem) captionBlocked.set(row.id, problem)
  }
  if (captionBlocked.size > 0) {
    return { ok: false, error: [...captionBlocked.values()][0]! }
  }

  const byTime = new Map<string, string[]>()
  for (const item of items) {
    if (!verifiedIds.has(item.postId)) continue
    const group = byTime.get(item.scheduledAt) ?? []
    group.push(item.postId)
    byTime.set(item.scheduledAt, group)
  }

  let succeeded = 0
  const failures: string[] = []
  for (const [scheduledAt, ids] of byTime) {
    const { error } = await supabase
      .from('posts')
      .update({ status: 'scheduled', scheduled_at: scheduledAt })
      .in('id', ids)
    if (error) failures.push(error.message)
    else succeeded += ids.length
  }

  revalidateTag('client-post-stats', 'max')
  // The partial count alone cannot tell the user whether the gap was an
  // ownership check or a database failure, so the reason travels with it.
  if (failures.length > 0) {
    console.error('[posts] batch schedule partially failed:', failures.join('; '))
  }
  return { ok: true, data: { succeeded, total: items.length } }
}
