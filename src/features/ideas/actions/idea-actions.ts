'use server'

import { revalidateTag } from 'next/cache'
import { resolveActionAuth } from '@/lib/auth/helpers'
import {
  linkIdeaToPost,
  markIdeasRead as markIdeasReadRows,
  setIdeasStatus,
} from '@/features/ideas/lib/ideas'
import { ideaIdsSchema, linkGeneratedPostSchema, markIdeasReadSchema } from '@/features/ideas/schemas'
import type { IdeaStatus } from '@/types/api'
import type { ActionResult } from '@/lib/actions/types'

/**
 * The idea inbox's mutations.
 *
 * These were four client `fetch` calls against PATCH /api/ideas, none of which checked
 * the response — a dismiss that failed still disappeared from the list, and stayed
 * gone until the next hard load told the truth. Actions instead, per CLAUDE.md, so the
 * caller gets a result it can act on and the sidebar badge is invalidated server-side.
 *
 * Ownership is enforced in the query, not before it: every write below carries
 * `.eq('agency_id', agencyId)`, so an id belonging to another agency matches no row
 * rather than being rejected by a separate lookup that could drift from the write.
 */

/** Takes ideas out of the inbox without generating from them. */
export async function dismissIdeas(ideaIds: string[]): Promise<ActionResult> {
  return setStatus(ideaIds, 'dismissed', 'dismiss')
}

/** Puts dismissed ideas back in the inbox. */
export async function restoreIdeas(ideaIds: string[]): Promise<ActionResult> {
  return setStatus(ideaIds, 'new', 'restore')
}

async function setStatus(
  ideaIds: string[],
  status: IdeaStatus,
  label: string
): Promise<ActionResult> {
  const auth = await resolveActionAuth()
  if (!auth.ok) return { ok: false, error: auth.error }

  const parsed = ideaIdsSchema.safeParse(ideaIds)
  if (!parsed.success) return { ok: false, error: 'Not found' }

  try {
    await setIdeasStatus(parsed.data, auth.agencyId, status)
    revalidateTag('client-ideas', 'max')
    return { ok: true, data: undefined }
  } catch (err) {
    console.error(`[ideas:${label}] failed for ${parsed.data.length} idea(s):`, err)
    const noun = parsed.data.length === 1 ? 'that idea' : 'those ideas'
    return { ok: false, error: `Could not ${label} ${noun}` }
  }
}

/**
 * Records the approved post that fulfils an idea.
 *
 * Sets the status as well as the link. An idea stays in the inbox for the whole generate
 * run — a draft a human is still reading is not a fulfilled request — so approval is the
 * one moment both facts become true, and splitting them across two writers is how the
 * link ended up populated on rows still showing as unfulfilled.
 */
export async function linkGeneratedPost(ideaId: string, postId: string): Promise<ActionResult> {
  const auth = await resolveActionAuth()
  if (!auth.ok) return { ok: false, error: auth.error }

  const parsed = linkGeneratedPostSchema.safeParse({ ideaId, postId })
  if (!parsed.success) return { ok: false, error: 'Not found' }

  try {
    await linkIdeaToPost(parsed.data.ideaId, auth.agencyId, parsed.data.postId)
    revalidateTag('client-ideas', 'max')
    return { ok: true, data: undefined }
  } catch (err) {
    console.error(`[ideas:link] failed for idea ${ideaId}:`, err)
    return { ok: false, error: 'Could not link the post to its idea' }
  }
}

/**
 * Stamps read_at on ideas the agency has now seen.
 *
 * No cache invalidation: the sidebar badge counts ideas awaiting a decision, which
 * having-been-looked-at does not change.
 */
export async function markIdeasRead(ideaIds: string[]): Promise<ActionResult> {
  const auth = await resolveActionAuth()
  if (!auth.ok) return { ok: false, error: auth.error }

  const parsed = markIdeasReadSchema.safeParse(ideaIds)
  if (!parsed.success) return { ok: false, error: 'Not found' }

  try {
    await markIdeasReadRows(auth.agencyId, parsed.data)
    return { ok: true, data: undefined }
  } catch (err) {
    console.error('[ideas:markRead] failed:', err)
    return { ok: false, error: 'Could not mark those ideas as read' }
  }
}
