'use server'

import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import 'server-only'
import { revalidateTag } from 'next/cache'
import { validateInstagramCaption } from '@/lib/meta/networks/instagram-caption'
import { recordDiscardedDraft, type DiscardSource } from '@/lib/queries/discarded-drafts'
import { z } from 'zod'
import {
  resolveActionAuth,
  fetchOwnedPost,
  verifyPostsOwnership,
  type SupabaseServerClient,
} from '@/lib/auth/helpers'
import { parseStoredValidation } from '@/lib/validation/stored-validation-schema'
import {
  parsePostUpdate,
  postCopySchema,
  type PostCopyInput,
  type PostFieldUpdate,
} from '@/lib/validation/post-update-schema'
import { DISCARD_REASONS, UNDECIDED_POST_STATUSES } from '@/lib/validation'
import { insertDraftPosts } from '@/lib/generation/draft-posts'
import { recordPostTopics } from '@/lib/queries/post-history'
import type { ActionResult } from './types'
import { parseActionId } from './parse-input'
import { statusForSlot } from '@/lib/posts/status-for-slot'
import { assignDestinations } from '@/features/publishing/lib/destinations'
import { withdrawPendingPublications } from '@/features/publishing/lib/publication-store'
import { toPostType } from '@/lib/visual/visual-backlog'
import { removeStoragePrefix } from '@/lib/storage/remove-prefix'
import type { PostImageRow } from '@/types'
import { copyPostImageObject, postImagePrefix, putPostImages } from '@/features/assets/lib/storage'
import { POST_IMAGES_BUCKET } from '@/utils/constants'
import { requireEntitledAction } from '@/lib/billing/require-entitled'

/**
 * `countAsDiscard: false` is the wizard throwing away a client's waiting drafts to start a new run —
 * a housekeeping delete, not a verdict on the sources that fueled them, so no `discarded_drafts`
 * row. Absent means true: a person pressed Discard on this post.
 */
const deletePostOptionsSchema = z
  .object({
    reason: z.enum(DISCARD_REASONS).optional(),
    countAsDiscard: z.boolean().optional(),
  })
  .optional()

/** Which surface a discard is attributed to, by the status the post held — the two undecided ones. */
const DISCARD_SOURCE_BY_STATUS: Partial<Record<string, DiscardSource>> = {
  draft: 'wizard',
  pending_review: 'review',
}

const persistRewriteSchema = z.object({
  caption: z.string(),
  slides_json: z.unknown(),
  quality_score_avg: z.number().nullable(),
  validation: z.unknown(),
})

/** Update a post's fields. */
export async function updatePost(postId: string, fields: PostFieldUpdate): Promise<ActionResult> {
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
export async function savePostCopy(postId: string, edits: PostCopyInput): Promise<ActionResult> {
  const parsed = postCopySchema.safeParse(edits)
  if (!parsed.success) return { ok: false, error: 'Invalid edits' }

  const auth = await resolveActionAuth()
  if (!auth.ok) return { ok: false, error: auth.error }
  const { supabase, agencyId } = auth

  const post = await fetchOwnedPost(supabase, postId, agencyId)
  if (!post) return { ok: false, error: 'Post not found' }

  // Only the keys the caller actually sent. Writing an absent one would blank it.
  const updates: Record<string, unknown> = {}
  if (parsed.data.caption !== undefined) updates.caption = parsed.data.caption
  if ('slides_json' in edits) updates.slides_json = parsed.data.slides_json
  if (Object.keys(updates).length === 0) return { ok: false, error: 'No edits to save' }

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

/**
 * Use a published post again, as a NEW draft.
 *
 * The published post is never touched. It is a historical record — its publications carry the
 * ids the network knows it by, and comments and performance hang off those — so editing it to
 * run again would make our record disagree with what is public and take that history with it.
 * "Use again" therefore means a new row with its own lifecycle, which is what a person asking
 * to reuse a post actually wants: the content, running through review and scheduling afresh.
 *
 * Written through `insertDraftPosts`, the one insert of a generated draft, so a duplicate carries
 * exactly what the cron and the wizard write and cannot drift from them. Back to the start of the
 * editorial lifecycle with no slot — a duplicate is something to review and schedule, not something
 * already on the calendar — and its topic is not recorded again: the original's already is.
 *
 * The visuals come with it. They cannot come by reference — `deletePost` sweeps the whole
 * `{clientId}/{postId}/` prefix, so two posts pointing at one object would mean deleting either
 * strips the other — so each file is COPIED under the new post's prefix and the new rows point
 * at the copies. Both posts then own their files and both sweeps stay correct.
 *
 * ALL OR NOTHING. A copy that fails means a source object is missing, which makes the ORIGINAL
 * post the broken one — so the duplicate is undone rather than delivered a slide short. Undoing
 * is exact: the new post's row and prefix are its own, so removing them touches nothing else.
 */
export async function duplicatePostAsDraft(postId: string): Promise<ActionResult<{ id: string }>> {
  // Parsed before auth, as the other writers here do. The action-validation guard is FILE-scoped
  // — this file already parses elsewhere, so it would have passed either way — and a non-uuid
  // reaching `.eq()` makes Postgres reject the comparison, reporting a database error where it
  // means "that is not an id".
  const parsed = parseActionId(postId, 'postId')
  if (!parsed.ok) return parsed.result

  const auth = await resolveActionAuth()
  if (!auth.ok) return { ok: false, error: auth.error }
  const { supabase, agencyId } = auth

  if (!(await fetchOwnedPost(supabase, postId, agencyId))) {
    return { ok: false, error: 'Post not found' }
  }

  const { data, error } = await supabase
    .from('posts')
    .select(
      // The date the brief asked for travels with the copy; the idea and the run do not — the
      // copy was nobody's request and belongs to no run. `generated_*` travel because they are
      // what the AI wrote: without them `draftColumns` files the reviewer's edit as the model's
      // own words and the edit-diff the style memo reads disappears for the copy.
      'client_id, caption, post_type, slides_json, validation_json, quality_score_avg, topic_summary, source_url, source_title, source_type, source_excerpt, client_source_id, pillar, target_date, generated_caption, generated_slides_json'
    )
    .eq('id', postId)
    .single()
  if (error || !data) return { ok: false, error: 'Could not read that post' }

  let created: { id: string } | undefined
  try {
    ;[created] = await insertDraftPosts(supabase, [data], 'pending_review')
  } catch (err) {
    console.error(`[posts] duplicate of ${postId} failed:`, err)
  }
  if (!created) return { ok: false, error: 'Could not create the copy' }

  const copyFailure = await copyImagesOnto(data.client_id, postId, created.id)
  if (copyFailure) {
    // Undo, so a failed copy leaves nothing behind. The row cascades its images away and the
    // prefix is this post's alone, so the sweep cannot reach the original's files.
    const { error: undoError } = await supabase.from('posts').delete().eq('id', created.id)
    await removeStoragePrefix(POST_IMAGES_BUCKET, postImagePrefix(data.client_id, created.id))
    if (undoError) {
      // The one failure here that reaches a person: they are told nothing was created while a
      // draft they did not ask for sits in the review queue.
      console.error(`[posts] rollback of duplicate ${created.id} failed:`, undoError.message)
      return { ok: false, error: `${copyFailure} — and a partial copy was left in review` }
    }
    return { ok: false, error: copyFailure }
  }

  revalidateTag('client-post-stats', 'max')
  return { ok: true, data: { id: created.id } }
}

/**
 * Give the duplicate its own copies of the original's images.
 *
 * Admin client throughout because the WRITE needs it: `putPostImages` and the storage copy both
 * run service-role. The read is done on the same client rather than the user-scoped one so this
 * is one client, not two. (`post_images` gained `post_images_agency_isolation` in migration
 * 20260832, so a user-scoped read would now work — it is simply not what the writes use.)
 *
 * Written through `putPostImages`, the one `post_images` write in the codebase, so a duplicate's
 * rows are built the same way every other attached image is.
 *
 * Returns the reason it could not be done, or null when every image arrived.
 */
async function copyImagesOnto(
  clientId: string,
  fromPostId: string,
  toPostId: string
): Promise<string | null> {
  const admin = createAdminSupabaseClient()
  const { data, error } = await admin
    .from('post_images')
    .select('position, storage_path, file_name, file_size, content_type')
    .eq('post_id', fromPostId)
    .order('position')
  if (error) {
    console.error(`[posts] could not read images of ${fromPostId}:`, error.message)
    return 'Could not read this post’s visuals'
  }

  // WHY as: a narrowed select does not infer through the untyped admin client. Derived from
  // the generated row so the five columns cannot drift from the table — row-mirrors' rule.
  type SourceImage = Pick<
    PostImageRow,
    'position' | 'storage_path' | 'file_name' | 'file_size' | 'content_type'
  >
  const source = (data ?? []) as SourceImage[]
  if (source.length === 0) return null

  const copies = await Promise.all(
    source.map(async (image) => ({
      image,
      copied: await copyPostImageObject(image.storage_path, clientId, toPostId, image.position),
    }))
  )

  const usable = copies.flatMap(({ image, copied }) => (copied ? [{ image, copied }] : []))
  const missing = copies.filter(({ copied }) => !copied)
  if (missing.length > 0) {
    // The stored path leads nowhere, which means the ORIGINAL is missing that file too.
    console.error(
      `[posts] duplicate of ${fromPostId} aborted: ${missing.length} unreadable image(s)`,
      missing.map(({ image }) => image.storage_path)
    )
    return 'Some of this post’s visuals are missing from storage, so it cannot be copied'
  }

  try {
    await putPostImages(
      admin,
      usable.map(({ image, copied }) => ({
        postId: toPostId,
        position: image.position,
        publicUrl: copied.publicUrl,
        storagePath: copied.storagePath,
        ...(image.file_name ? { fileName: image.file_name } : {}),
        ...(image.file_size !== null ? { fileSize: image.file_size } : {}),
        ...(image.content_type ? { contentType: image.content_type } : {}),
      }))
    )
  } catch (err) {
    console.error(`[posts] could not attach copied images to ${toPostId}:`, err)
    return 'Could not attach the copied visuals'
  }
  return null
}

/**
 * Delete a post by ID, recording its outcome (and the reviewer's reason) as a discard first.
 *
 * A discard is only a discard while nobody had approved the post: a wizard draft (`'draft'`,
 * logged as the wizard's) or a queue draft (`'pending_review'`, the review's). Deleting an approved
 * or published post is housekeeping, not a rejection of its source — and it already counted as an
 * approval, so logging a discard would double-skew the stats.
 */
export async function deletePost(
  postId: string,
  options?: { reason?: string; countAsDiscard?: boolean }
): Promise<ActionResult> {
  const parsedOptions = deletePostOptionsSchema.safeParse(options)
  if (!parsedOptions.success) return { ok: false, error: 'Invalid discard reason' }

  const auth = await resolveActionAuth()
  if (!auth.ok) return { ok: false, error: auth.error }
  const { supabase, agencyId } = auth

  const post = await fetchOwnedPost(supabase, postId, agencyId)
  if (!post) return { ok: false, error: 'Post not found' }

  // Outcome telemetry: best-effort — a failed log must never block the delete.
  // discarded_drafts is service-role-only (RLS with no policies), so the insert
  // must go through the admin client — the user-scoped one fails silently.
  if (parsedOptions.data?.countAsDiscard !== false) {
    try {
      const { data: row } = await supabase
        .from('posts')
        .select('client_id, client_source_id, pillar, source_url, source_type, status')
        .eq('id', postId)
        .single()
      const discardedFrom = DISCARD_SOURCE_BY_STATUS[row?.status ?? '']
      if (row?.client_id && discardedFrom) {
        await recordDiscardedDraft({
          clientId: row.client_id,
          clientSourceId: row.client_source_id ?? null,
          pillar: row.pillar ?? null,
          sourceUrl: row.source_url ?? null,
          sourceType: row.source_type ?? null,
          discardedFrom,
          reason: parsedOptions.data?.reason ?? null,
        })
      }
    } catch (err) {
      console.error('[posts] failed to log discard:', err)
    }
  }

  const { error } = await supabase.from('posts').delete().eq('id', postId)
  if (error) return { ok: false, error: error.message }

  // The rows are gone by cascade — post_images, post_canvas_docs, post_approval_tokens — but the
  // FILES they pointed at were not. They sat under `{clientId}/{postId}/` until the whole client
  // was deleted, which for a client nobody deletes is forever. `deleteClient` has swept its two
  // prefixes since it was written; this path never had one.
  //
  // After the rows, never before: sweeping first would strip a live post's images if the delete
  // then failed. Best-effort by contract — the post is gone either way.
  const swept = await removeStoragePrefix(
    POST_IMAGES_BUCKET,
    postImagePrefix(post.client_id, postId)
  )
  if (swept > 0) console.warn(`[posts] deleted ${postId}: swept ${swept} stored file(s)`)

  revalidateTag('client-post-stats', 'max')
  return { ok: true, data: undefined }
}

/**
 * One post to a slot, or off the schedule with `null`.
 *
 * The single-item form of `schedulePosts`, existing only so the callers that move one post do not
 * each unwrap a batch count they have no use for. It adds no logic — every check is the batch's.
 */
export async function schedulePost(
  postId: string,
  scheduledAt: string | null,
  /** See `schedulePosts`. Empty when unscheduling or approving without a slot. */
  platforms: readonly string[]
): Promise<ActionResult<{ nowhereToGo: boolean }>> {
  const result = await schedulePosts([{ postId, scheduledAt, platforms }])
  if (!result.ok) return result
  // A batch reports `ok` with a count, because "three of four landed" is a real outcome it has to
  // be able to say. One post has no such middle: it either moved or it did not, and returning
  // `ok` regardless is what made this unsafe for an optimistic caller — the dashboard's approve
  // removes the row and offers an Undo that would then write over a post never approved.
  return result.data.succeeded === 1
    ? { ok: true, data: { nowhereToGo: result.data.nowhereToGo > 0 } }
    : { ok: false, error: 'Could not update that post' }
}

/**
 * Add the topics of the posts a human just kept to the client's history.
 *
 * `post_history` is the "do not suggest these again" list the research prompt reads
 * (`fetchPostHistoryByClient`, lib/queries/db.ts), so a topic belongs there once somebody decides
 * to publish it — not when the model writes one. Since 2026-09-20 every generated draft is a row
 * the moment it streams, and recording it there burned the topic of every draft that was then
 * discarded. Between writing and keeping, a run cannot repeat itself anyway: the same prompt also
 * reads the run's own themes (`fetchThemeDescriptions`, lib/generation/runs.ts).
 *
 * Only a post leaving an undecided status counts, so moving an approved post around the calendar
 * never records its topic twice. Grouped by client because the history is one client's list.
 */
async function recordKeptTopics(
  supabase: SupabaseServerClient,
  kept: Array<{ client_id: string; status: string; topic_summary: string | null }>
): Promise<void> {
  const byClient = new Map<string, string[]>()
  for (const post of kept) {
    if (!post.topic_summary) continue
    if (!UNDECIDED_POST_STATUSES.some((status) => status === post.status)) continue
    byClient.set(post.client_id, [...(byClient.get(post.client_id) ?? []), post.topic_summary])
  }
  for (const [clientId, topics] of byClient) {
    await recordPostTopics(supabase, clientId, topics)
  }
}

/**
 * Put posts in the schedule — how the calendar and the queues write `scheduled_at` and its paired
 * `status` (the other slot writers, both behind the publish gate: `rearmFailedPublication`,
 * src/features/calendar/actions/post-recovery.ts, and src/app/api/posts/[id]/publish/route.ts).
 * Only scheduling carries the publish gate, so a paused workspace can still unschedule. The
 * caption check runs here so a bad caption shows in the calendar, not as a burned publish attempt
 * days later; it is Instagram's, so it covers Instagram-bound posts only.
 *
 * Destinations, which the publish cron reads instead of posts, are written after the posts UPDATE
 * has committed, so each post's write is caught, never thrown. A post left with none is still
 * scheduled: it is counted in `nowhereToGo` on a success, never answered `ok: false`.
 */
export async function schedulePosts(
  items: Array<{
    postId: string
    scheduledAt: string | null
    /**
     * Where this post should go. The server intersects it with what the post can actually
     * reach, so this is intent, not fact. Ignored when unscheduling — a post with no slot has
     * no destinations, and its pending ones are withdrawn instead.
     */
    platforms: readonly string[]
  }>
): Promise<ActionResult<{ succeeded: number; total: number; nowhereToGo: number }>> {
  for (const item of items) {
    const parsed = parsePostUpdate({
      scheduled_at: item.scheduledAt,
      status: statusForSlot(item.scheduledAt),
    })
    if (!parsed.ok) return { ok: false, error: parsed.error }
  }

  const auth = await resolveActionAuth()
  if (!auth.ok) return { ok: false, error: auth.error }
  const { supabase, agencyId } = auth

  if (items.some((item) => item.scheduledAt !== null)) {
    const refused = await requireEntitledAction(agencyId, 'publish')
    if (refused) return refused
  }

  const allIds = items.map((i) => i.postId)
  const verifiedIds = await verifyPostsOwnership(supabase, allIds, agencyId)

  const instagramBound = new Set(
    items.filter((item) => item.platforms.includes('instagram')).map((item) => item.postId)
  )
  const { data: captionRows, error: readError } = await supabase
    .from('posts')
    .select('id, caption, client_id, post_type, status, topic_summary')
    .in('id', [...verifiedIds])
  if (readError) {
    console.error('[posts] schedule read failed:', readError.message)
    return { ok: false, error: 'Could not read those posts' }
  }
  const postById = new Map(
    (captionRows ?? []).map((row) => [
      row.id,
      {
        client_id: row.client_id,
        post_type: toPostType(row.post_type),
        status: row.status,
        topic_summary: row.topic_summary,
      },
    ])
  )
  const captionBlocked = new Map<string, string>()
  for (const row of captionRows ?? []) {
    if (!instagramBound.has(row.id)) continue
    const problem = validateInstagramCaption(row.caption ?? '')
    if (problem) captionBlocked.set(row.id, problem)
  }
  if (captionBlocked.size > 0) {
    return { ok: false, error: [...captionBlocked.values()][0]! }
  }

  const byTime = new Map<string | null, string[]>()
  const chosenById = new Map<string, readonly string[]>()
  for (const item of items) {
    if (!verifiedIds.has(item.postId)) continue
    const group = byTime.get(item.scheduledAt) ?? []
    group.push(item.postId)
    byTime.set(item.scheduledAt, group)
    chosenById.set(item.postId, item.platforms)
  }

  let succeeded = 0
  const failures: string[] = []
  const moved = new Set<string>()
  for (const [scheduledAt, ids] of byTime) {
    const { error } = await supabase
      .from('posts')
      .update({ status: statusForSlot(scheduledAt), scheduled_at: scheduledAt })
      .in('id', ids)
    if (error) failures.push(error.message)
    else {
      succeeded += ids.length
      for (const id of ids) moved.add(id)
    }
  }

  await recordKeptTopics(
    supabase,
    [...moved].flatMap((postId) => postById.get(postId) ?? [])
  )

  const admin = createAdminSupabaseClient()
  const nowhereToGo: string[] = []
  for (const [scheduledAt, ids] of byTime) {
    for (const postId of ids) {
      const post = postById.get(postId)
      if (!post || !moved.has(postId)) continue
      try {
        if (!scheduledAt) {
          await withdrawPendingPublications(admin, postId)
          continue
        }
        const created = await assignDestinations(
          admin,
          postId,
          post.client_id,
          post.post_type,
          chosenById.get(postId) ?? []
        )
        if (created.length === 0) nowhereToGo.push(postId)
      } catch (err) {
        nowhereToGo.push(postId)
        failures.push(err instanceof Error ? err.message : `destination write failed for ${postId}`)
      }
    }
  }

  revalidateTag('client-post-stats', 'max')
  if (failures.length > 0) {
    console.error('[posts] batch schedule partially failed:', failures.join('; '))
  }
  if (nowhereToGo.length > 0) {
    console.error(`[posts] scheduled with no publishable destination: ${nowhereToGo.join(', ')}`)
  }
  if (succeeded === 0 && items.length > 0) {
    return { ok: false, error: failures[0] ?? 'Could not update those posts' }
  }
  return { ok: true, data: { succeeded, total: items.length, nowhereToGo: nowhereToGo.length } }
}
