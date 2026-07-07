'use server'

import { revalidateTag } from 'next/cache'
import { resolveActionAuth, verifyPostOwnership, verifyPostsOwnership } from '@/lib/auth/helpers'
import { isUserSettablePostStatus, isValidPostPlatform } from '@/lib/validation'
import type { ActionResult } from './types'

interface UpdatePostInput {
  status?: string
  caption?: string
  slides_json?: unknown
  scheduled_at?: string | null
  platform?: string
  was_rewritten?: boolean
  rewrite_count?: number
  source_url?: string
  source_title?: string
  quality_score_avg?: number
  validation_json?: unknown
}

/** Update a post's fields. */
export async function updatePost(
  postId: string,
  fields: UpdatePostInput
): Promise<ActionResult> {
  const auth = await resolveActionAuth()
  if (!auth.ok) return { ok: false, error: auth.error }
  const { supabase, agencyId } = auth

  const post = await verifyPostOwnership(supabase, postId, agencyId)
  if (!post) return { ok: false, error: 'Post not found' }

  if (fields.status !== undefined && !isUserSettablePostStatus(fields.status)) {
    return { ok: false, error: `Invalid status: ${fields.status}` }
  }
  if (fields.platform !== undefined && !isValidPostPlatform(fields.platform)) {
    return { ok: false, error: `Invalid platform: ${fields.platform}` }
  }

  const updates: Record<string, unknown> = {}
  if (fields.status !== undefined) updates.status = fields.status
  if (fields.caption !== undefined) updates.caption = fields.caption
  if (fields.slides_json !== undefined) updates.slides_json = fields.slides_json
  if (fields.scheduled_at !== undefined) updates.scheduled_at = fields.scheduled_at
  if (fields.platform !== undefined) updates.platform = fields.platform
  if (fields.was_rewritten !== undefined) updates.was_rewritten = fields.was_rewritten
  if (fields.rewrite_count !== undefined) updates.rewrite_count = fields.rewrite_count
  if (fields.source_url !== undefined) updates.source_url = fields.source_url
  if (fields.source_title !== undefined) updates.source_title = fields.source_title
  if (fields.quality_score_avg !== undefined) updates.quality_score_avg = fields.quality_score_avg
  if (fields.validation_json !== undefined)
    updates.validation_json = fields.validation_json

  const { error } = await supabase.from('posts').update(updates).eq('id', postId)
  if (error) return { ok: false, error: error.message }

  revalidateTag('client-post-stats', 'max')
  return { ok: true, data: undefined }
}

/** Clear any active change request on a post by setting token status to 'resolved'. */
export async function resolveChangeRequest(postId: string): Promise<ActionResult> {
  const auth = await resolveActionAuth()
  if (!auth.ok) return { ok: false, error: auth.error }
  const { supabase, agencyId } = auth

  const post = await verifyPostOwnership(supabase, postId, agencyId)
  if (!post) return { ok: false, error: 'Post not found' }

  await supabase
    .from('post_approval_tokens')
    .update({ status: 'resolved' })
    .eq('post_id', postId)
    .eq('status', 'changes_requested')

  revalidateTag('client-post-stats', 'max')
  return { ok: true, data: undefined }
}

/** Delete a post by ID. */
export async function deletePost(postId: string): Promise<ActionResult> {
  const auth = await resolveActionAuth()
  if (!auth.ok) return { ok: false, error: auth.error }
  const { supabase, agencyId } = auth

  const post = await verifyPostOwnership(supabase, postId, agencyId)
  if (!post) return { ok: false, error: 'Post not found' }

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

  const byTime = new Map<string, string[]>()
  for (const item of items) {
    if (!verifiedIds.has(item.postId)) continue
    const group = byTime.get(item.scheduledAt) ?? []
    group.push(item.postId)
    byTime.set(item.scheduledAt, group)
  }

  let succeeded = 0
  for (const [scheduledAt, ids] of byTime) {
    const { error } = await supabase
      .from('posts')
      .update({ status: 'scheduled', scheduled_at: scheduledAt })
      .in('id', ids)
    if (!error) succeeded += ids.length
  }

  revalidateTag('client-post-stats', 'max')
  return { ok: true, data: { succeeded, total: items.length } }
}
