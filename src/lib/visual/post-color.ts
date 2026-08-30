import 'server-only'

import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import type { VisualIdentity } from '@/types/visual'
import { getBrandStyle } from './brand-styles'
import { adjacencyWindow, deriveToneLadder, pickScheme, type ColorScheme } from './color-scheme'

/**
 * The ground/accent pair a post's visuals are built on.
 *
 * `stored` short-circuits everything, which is the point: once a post has a scheme it keeps it for
 * every later slide and every regenerate, whatever has happened to the client's palette in between.
 * Only a post that has never generated anything gets a fresh pick.
 *
 * Derived from the palette on the fly — there is no stored list of colours and nothing for the user
 * to configure, so editing the brand palette reconfigures every future post by itself.
 *
 * Deriving and PERSISTING are one step here rather than two. They were two, and every caller was
 * then trusted to write the answer back under its own copy of "has this post got a pair yet" — one
 * did, one silently did not, and the one that did could be overtaken by its own sibling. A pick
 * that is not claimed is not a decision, so this function makes it and returns what stuck.
 */
export async function resolveScheme(input: {
  clientId: string
  /**
   * The post this art belongs to, when there is one.
   *
   * Present → a freshly derived pair is CLAIMED on the row and the winner comes back, so
   * concurrent slides of one post cannot each pick their own. Absent (a wizard draft) → there is no
   * row to claim on and the pair is carried by the surface instead.
   */
  postId?: string
  /**
   * The client's kit, already read.
   *
   * Passed rather than fetched because `generateVisual` needs the same row for the prompt, and every
   * image used to cost two reads of it — with two different answers to "what if there is no row",
   * which agreed only by coincidence.
   */
  identity: VisualIdentity
  /**
   * What places this pick in the rotation.
   *
   * A lone post passes its own id. A concurrent BATCH must pass one value shared by the whole
   * batch and spread with `offset` — see `pickScheme`, where passing a per-item base alongside a
   * per-item offset was measured to be exactly as collision-prone as no offset at all.
   */
  base: string
  stored?: { ground: string | null; accent: string | null }
  /** This item's ordinal within a concurrent batch. Omit for a lone post. */
  offset?: number
}): Promise<ColorScheme | null> {
  if (input.stored?.ground && input.stored.accent) {
    return { ground: input.stored.ground, accent: input.stored.accent }
  }

  const style = getBrandStyle(input.identity.style)
  const ladder = deriveToneLadder(input.identity.palette)

  const schemes = style.variation.schemes
  const picked = pickScheme({
    schemes,
    ladder,
    // Exactly as many rows as the picker will honour — see `adjacencyWindow`, which is asked here
    // and again inside `pickScheme` so the query and the rule cannot drift apart.
    recent: await recentSchemes(input.clientId, adjacencyWindow(schemes.length), input.postId),
    base: input.base,
    offset: input.offset ?? 0,
  })
  if (!picked || !input.postId) return picked
  return claimScheme(input.postId, picked)
}

/** A row's pair when it holds a complete one. Three readers here, so it is one function. */
function schemeOfRow(row: { visual_ground: string | null; visual_accent: string | null } | null) {
  return row?.visual_ground && row.visual_accent
    ? { ground: row.visual_ground, accent: row.visual_accent }
    : null
}

/**
 * Schemes the client's most recent posts are wearing, newest first. Admin client: `posts` has RLS.
 *
 * The post being generated is EXCLUDED. Without that a lane could see the pair a sibling lane had
 * just written for this very post, treat it as a neighbour to avoid, and deliberately pick
 * something else — turning the guard against repetition into the cause of a split carousel.
 *
 * Both columns are filtered in SQL rather than after the fact. Filtering a half-written row out in
 * JavaScript happened AFTER the `limit`, so such a row consumed one of the three slots and returned
 * nothing, silently shrinking the window it is the whole point of this query to fill.
 */
async function recentSchemes(
  clientId: string,
  window: number,
  excludePostId?: string
): Promise<ColorScheme[]> {
  if (window <= 0) return []
  const admin = createAdminSupabaseClient()
  let query = admin
    .from('posts')
    .select('visual_ground, visual_accent')
    .eq('client_id', clientId)
    .not('visual_ground', 'is', null)
    .not('visual_accent', 'is', null)
  if (excludePostId) query = query.neq('id', excludePostId)
  const { data, error } = await query.order('created_at', { ascending: false }).limit(window)
  // A failed lookup must not fail generation — it only costs the adjacency guarantee, and a repeated
  // colour is a far better outcome than a post with no image.
  if (error || !data) return []
  return data.flatMap((row) => {
    const scheme = schemeOfRow(row)
    return scheme ? [scheme] : []
  })
}

/**
 * Write a freshly derived pair onto the post — and return whichever pair actually won.
 *
 * A plain update was a race with a split carousel at the end of it. Two positions of one post
 * generate concurrently (the cron runs two lanes over a post's slides, the browser six), so both
 * read the row before either writes, both find it empty, and both derive. The second then
 * overwrote the first: two slides built on different colours, and the row agreeing with only one
 * of them — on the cover slide as often as not, which is the tile the grid shows.
 *
 * The `or(...)` is the fix and it is the same condition `resolveScheme` short-circuits on, so the
 * two cannot disagree about what "already has a pair" means. Postgres re-evaluates it after the
 * first writer commits, so exactly one update matches and every other lane gets zero rows back,
 * re-reads, and generates on the winner's colours. It heals a half-written row for the same
 * reason: a ground with no accent is not a pair, so the condition still matches.
 *
 * Best-effort throughout: a write that fails costs the post its stored colours, which is a reroll,
 * not a lost image.
 */
async function claimScheme(postId: string, picked: ColorScheme): Promise<ColorScheme> {
  const admin = createAdminSupabaseClient()
  const { data, error } = await admin
    .from('posts')
    .update({ visual_ground: picked.ground, visual_accent: picked.accent })
    .eq('id', postId)
    .or('visual_ground.is.null,visual_accent.is.null')
    .select('visual_ground, visual_accent')
    .maybeSingle()
  if (error) {
    console.warn(`[post-color] could not claim scheme for ${postId}: ${error.message}`)
    return picked
  }
  const won = schemeOfRow(data)
  if (won) return won

  // Zero rows: another lane completed the pair between our read and our write. Adopt theirs — the
  // whole point is that one post's slides share a pair, and ours is the one that has to give way.
  const { data: row } = await admin
    .from('posts')
    .select('visual_ground, visual_accent')
    .eq('id', postId)
    .maybeSingle()
  return schemeOfRow(row) ?? picked
}
