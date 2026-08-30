import { describe, expect, it, vi, beforeEach } from 'vitest'

/**
 * Claiming a post's colour pair.
 *
 * Two positions of one post generate concurrently — the visuals cron runs two lanes over a post's
 * slides, the browser six — so both read the row before either writes and both find it empty. The
 * pick has to survive that: whoever writes first decides, and every other lane generates on their
 * colours. It did not, and the result was a carousel whose cover wore one ground and whose second
 * slide wore another, with the row agreeing with only one of them.
 *
 * The fake below models the ONE property the fix leans on: `update ... where the pair is still
 * incomplete` matches for exactly one caller, because Postgres re-evaluates that condition after
 * the first writer commits.
 */

interface PostRow {
  visual_ground: string | null
  visual_accent: string | null
}

const row: PostRow = { visual_ground: null, visual_accent: null }
/** Every filter the recent-schemes query applied, so the exclusion can be asserted. */
let filters: Array<[string, string]> = []
/**
 * What `recentSchemes` reports — deliberately INCLUDING this post's own current pair.
 *
 * That is the shape of the original bug: a lane that ran after a sibling's write saw the pair the
 * post had just been given, treated it as a neighbour to avoid, and picked something else on
 * purpose. Modelling it here is what makes the second lane want to disagree.
 */
function recentRows(): PostRow[] {
  return row.visual_ground && row.visual_accent ? [{ ...row }] : []
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminSupabaseClient: () => ({
    from: () => {
      let patch: PostRow | null = null
      // Conditions the query actually declared. The guard below is applied only if the code asked
      // for it — otherwise the fake would enforce the fix on the caller's behalf and these tests
      // would keep passing against the plain `.update()` they exist to rule out.
      const conditions: string[] = []
      const builder = {
        update(next: PostRow) {
          patch = next
          return builder
        },
        select: () => builder,
        eq: () => builder,
        or(condition: string) {
          conditions.push(condition)
          return builder
        },
        not: () => builder,
        neq(column: string, value: string) {
          filters.push([column, value])
          return builder
        },
        order: () => builder,
        limit: async () => ({ data: recentRows(), error: null }),
        async maybeSingle() {
          if (!patch) return { data: { ...row }, error: null }
          // Postgres re-evaluates the WHERE after the first writer commits, so a complete pair is
          // no longer claimable — a half-written one still is, which is how a row heals.
          const guarded = conditions.includes('visual_ground.is.null,visual_accent.is.null')
          if (guarded && row.visual_ground && row.visual_accent) return { data: null, error: null }
          row.visual_ground = patch.visual_ground
          row.visual_accent = patch.visual_accent
          return { data: { ...row }, error: null }
        },
      }
      return builder
    },
  }),
}))

import { resolveScheme } from '../post-color'
import { buildDefaultIdentity } from '../identity'

const IDENTITY = buildDefaultIdentity()

beforeEach(() => {
  row.visual_ground = null
  row.visual_accent = null
  filters = []
})

describe('resolveScheme', () => {
  it('gives two slides of one post the same pair when the second reads after the first wrote', async () => {
    // The interleave the bug needed: both lanes read the ROW while it was empty, but the second
    // lane's neighbour lookup lands after the first lane's write. Same `base` for both, exactly as
    // `generatePostVisual` passes it — so the only thing that could pull them apart is the pair
    // that appeared in `recent` in between, which is what the original defect did.
    const lane = () =>
      resolveScheme({
        clientId: 'client-1',
        identity: IDENTITY,
        postId: 'post-1',
        base: 'post-1',
        stored: { ground: null, accent: null },
      })

    const first = await lane()
    const second = await lane()

    expect(second).toEqual(first)
    // And the row agrees with both, so every later slide and every regenerate follows it.
    expect({ ground: row.visual_ground, accent: row.visual_accent }).toEqual(first)
  })

  it('adopts the winner rather than overwriting it', async () => {
    const won = await resolveScheme({
      clientId: 'client-1',
      identity: IDENTITY,
      postId: 'post-1',
      base: 'post-1',
      stored: { ground: null, accent: null },
    })
    // A second lane arriving late must not be able to move the post off the colours slide one was
    // already generated on — the plain `.update()` this replaced could.
    const late = await resolveScheme({
      clientId: 'client-1',
      identity: IDENTITY,
      postId: 'post-1',
      base: 'somebody-else',
      stored: { ground: null, accent: null },
    })

    expect(late).toEqual(won)
    expect(row.visual_ground).toBe(won?.ground)
  })

  it('heals a row that has a ground but no accent', async () => {
    row.visual_ground = '#AABBCC'

    const scheme = await resolveScheme({
      clientId: 'client-1',
      identity: IDENTITY,
      postId: 'post-1',
      base: 'post-1',
      stored: { ground: '#AABBCC', accent: null },
    })

    expect(scheme?.accent).toBeTruthy()
    expect(row.visual_accent).toBe(scheme?.accent)
  })

  it('excludes the post from its own neighbour list', async () => {
    await resolveScheme({
      clientId: 'client-1',
      identity: IDENTITY,
      postId: 'post-1',
      base: 'post-1',
      stored: { ground: null, accent: null },
    })

    // Without this a post can be told to avoid the colour it was just given.
    expect(filters).toContainEqual(['id', 'post-1'])
  })

  it('keeps a stored pair without touching the database', async () => {
    const scheme = await resolveScheme({
      clientId: 'client-1',
      identity: IDENTITY,
      postId: 'post-1',
      base: 'post-1',
      stored: { ground: '#111111', accent: '#222222' },
    })

    expect(scheme).toEqual({ ground: '#111111', accent: '#222222' })
    expect(filters).toEqual([])
  })

  it('derives without claiming when there is no post to claim on', async () => {
    // A wizard draft: no row until approve, so the pair travels with the surface instead.
    const scheme = await resolveScheme({
      clientId: 'client-1',
      identity: IDENTITY,
      base: 'draft-1',
    })

    expect(scheme).toBeTruthy()
    expect(row.visual_ground).toBeNull()
  })
})
