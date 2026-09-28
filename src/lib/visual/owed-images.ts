import 'server-only'

import type { AdminClient } from '@/lib/supabase/admin'
import { NOTHING_OWED, type OwedImages } from '@/lib/billing/copy'
import { UNDECIDED_POST_STATUSES, type UndecidedPostStatus } from '@/lib/validation'
import type { PostImage } from '@/types/api'
import { isStillPaintable, missingPositions, type BacklogPost } from './visual-backlog'
import { readPostVisualPages } from './post-visuals'

/**
 * A post as the owed count reads it: the row, its images, and the positions a live claim holds.
 * `visuals_attempts` is read for a review-queue post only — the generate page's drafts come from
 * a projection that does not carry it, and a draft owes its pictures regardless.
 */
interface OwedItem {
  post: Pick<
    BacklogPost,
    'client_id' | 'status' | 'post_type' | 'slides_json' | 'quality_score_avg'
  > &
    Partial<Pick<BacklogPost, 'visuals_attempts'>>
  images: PostImage[]
  generatingPositions: number[]
}

/**
 * The pictures posts already written still owe, per client — what a new run must leave in the
 * image pool. A draft owes every position with no picture (the wizard paints it on the next
 * visit); a post in the review queue owes them only while the visuals cron will still paint it
 * (`isStillPaintable`). A position a live claim holds owes nothing here: its image is already
 * reserved, in `committed.image` as pending. Pure — the generate page runs it over the drafts it
 * already loaded and `fetchOwedImages` over rows it reads, and both give the same figure for the
 * same post.
 */
export function owedImagesOf(items: OwedItem[]): Map<string, OwedImages> {
  const byClient = new Map<string, OwedImages>()
  for (const { post, images, generatingPositions } of items) {
    const paintable = isStillPaintable({
      quality_score_avg: post.quality_score_avg,
      visuals_attempts: post.visuals_attempts ?? 0,
    })
    if (post.status === 'pending_review' && !paintable) continue
    const owed = missingPositions(post, images, generatingPositions).length
    if (owed === 0) continue
    const total = byClient.get(post.client_id) ?? NOTHING_OWED
    byClient.set(post.client_id, { posts: total.posts + 1, images: total.images + owed })
  }
  return byClient
}

/**
 * A workspace's owed pictures: the entries of `clientIds` summed across the maps given — the
 * drafts' and the review queue's, when they were read apart — or every entry when none are named.
 */
export function sumOwed(
  maps: ReadonlyArray<ReadonlyMap<string, OwedImages>>,
  clientIds?: Iterable<string>
): OwedImages {
  const wanted = clientIds === undefined ? null : new Set(clientIds)
  let posts = 0
  let images = 0
  for (const map of maps) {
    for (const [clientId, owed] of map) {
      if (wanted && !wanted.has(clientId)) continue
      posts += owed.posts
      images += owed.images
    }
  }
  return { posts, images }
}

/**
 * The owed pictures of these clients' posts in `statuses` — every undecided one unless the caller
 * already holds some (the generate page's drafts) — read page by page (`readPostVisualPages`) and
 * counted once by `owedImagesOf`. The caller passes the client ids it already holds, so this never
 * reads clients. Throws on any failed read: an unknown figure is not zero, and each caller refuses
 * rather than offer a run on it.
 */
export async function fetchOwedImages(
  admin: AdminClient,
  clientIds: string[],
  statuses: readonly UndecidedPostStatus[] = UNDECIDED_POST_STATUSES
): Promise<Map<string, OwedImages>> {
  if (clientIds.length === 0) return new Map()
  const items: OwedItem[] = []
  for await (const page of readPostVisualPages(admin, clientIds, statuses)) {
    for (const post of page.posts) {
      items.push({
        post,
        images: page.imagesByPost.get(post.id) ?? [],
        generatingPositions: page.generatingByPost.get(post.id) ?? [],
      })
    }
  }
  return owedImagesOf(items)
}

/** A whole workspace's owed pictures, across every undecided post of `clientIds`. */
export async function fetchWorkspaceOwed(
  admin: AdminClient,
  clientIds: string[]
): Promise<OwedImages> {
  return sumOwed([await fetchOwedImages(admin, clientIds)])
}
