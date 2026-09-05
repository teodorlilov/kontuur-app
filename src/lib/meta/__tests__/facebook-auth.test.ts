import { describe, expect, it, vi, beforeEach } from 'vitest'

/**
 * Listing the Pages a Facebook connection reaches.
 *
 * `/me/accounts` is the documented way to do this and it is not sufficient, which was established
 * against a live account rather than reasoned about. With one Page ticked in Facebook's asset
 * picker and `pages_show_list` reporting `granted` in `/me/permissions`, that edge returned
 * `{"data":[]}` — HTTP 200, no error — while `/debug_token` named the very same Page under
 * `granular_scopes.pages_show_list.target_ids`, and reading it by id returned a Page token that
 * `/{page}/feed` and `/{page}/published_posts` both accepted. The Page was in the New Pages
 * Experience and held through a Business Portfolio.
 *
 * Nothing throws in that state, so only the grant can tell "this person administers no Pages"
 * from "Facebook did not list the Page they just gave us". Recorded in `docs/META-FB-PROBE.md`.
 */

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

const { fetchFacebookPages } = await import('../facebook-auth')

function ok(body: unknown) {
  return { ok: true, status: 200, json: async () => body, headers: new Headers() }
}

/**
 * Route by path so the calls answer independently, as Graph does.
 *
 * `String(url)` because the shared Graph client passes a URL OBJECT to fetch, not a string —
 * a mock typed as a string silently throws inside the client, which then reads the throw as a
 * network failure and retries it twice.
 */
function graph(routes: Record<string, unknown>) {
  fetchMock.mockImplementation((url: unknown) => {
    const target = String(url)
    const match = Object.keys(routes).find((key) => target.includes(key))
    if (!match) throw new Error(`unrouted graph call: ${target}`)
    return Promise.resolve(ok(routes[match]))
  })
}

const GRANTED_PAGE = '723701000827665'

function debugToken(granular: Array<{ scope: string; target_ids?: string[] }>) {
  return { data: { is_valid: true, granular_scopes: granular } }
}

function pageNode(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    name: 'About Social Media',
    access_token: 'page-token',
    category: 'Social Media Agency',
    ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.META_APP_ID = 'app'
  process.env.META_APP_SECRET = 'secret'
})

describe('fetchFacebookPages', () => {
  it('recovers a granted Page that /me/accounts does not list', async () => {
    // The live failure, exactly. Without the grant there is nothing to show and the person is
    // told they administer no Pages, which is both wrong and unfixable.
    graph({
      debug_token: debugToken([
        { scope: 'pages_show_list', target_ids: [GRANTED_PAGE] },
        { scope: 'pages_manage_posts', target_ids: [GRANTED_PAGE] },
      ]),
      'me/accounts': { data: [] },
      [GRANTED_PAGE]: pageNode(GRANTED_PAGE),
    })

    const pages = await fetchFacebookPages('user-token')

    expect(pages).toEqual([
      {
        id: GRANTED_PAGE,
        name: 'About Social Media',
        accessToken: 'page-token',
        category: 'Social Media Agency',
        canPublish: true,
      },
    ])
  })

  it('lists a Page once when both the edge and the grant name it', async () => {
    graph({
      debug_token: debugToken([{ scope: 'pages_show_list', target_ids: [GRANTED_PAGE] }]),
      'me/accounts': { data: [pageNode(GRANTED_PAGE, { tasks: ['CREATE_CONTENT'] })] },
    })

    const pages = await fetchFacebookPages('user-token')

    expect(pages).toHaveLength(1)
    expect(pages[0]!.id).toBe(GRANTED_PAGE)
  })

  it('refuses a Page the app was not granted posting on', async () => {
    // The grant binds, not the person's own Page role: they may create content there while this
    // app was never given permission to.
    graph({
      debug_token: debugToken([
        { scope: 'pages_show_list', target_ids: [GRANTED_PAGE] },
        { scope: 'pages_manage_posts', target_ids: ['659554973897366'] },
      ]),
      'me/accounts': { data: [pageNode(GRANTED_PAGE, { tasks: ['CREATE_CONTENT'] })] },
    })

    expect((await fetchFacebookPages('user-token'))[0]!.canPublish).toBe(false)
  })

  it('treats a scope with no target_ids as covering every Page', async () => {
    // "Opt in to all current and future Pages" produces this shape — the same one Instagram's
    // scopes have on the very same token. Absent is not empty.
    graph({
      debug_token: debugToken([{ scope: 'pages_show_list' }, { scope: 'pages_manage_posts' }]),
      'me/accounts': { data: [pageNode(GRANTED_PAGE)] },
    })

    expect((await fetchFacebookPages('user-token'))[0]!.canPublish).toBe(true)
  })

  it('falls back to the person Page tasks only when the grant is UNREADABLE', async () => {
    // Unreadable, not empty: `{}` has no `data` key at all, so the schema rejects it. An empty
    // `{data:{}}` parses fine and is a readable grant that happens to say nothing — the case
    // below — and conflating the two is what this pair exists to stop.
    graph({
      debug_token: {},
      'me/accounts': { data: [pageNode(GRANTED_PAGE, { tasks: ['CREATE_CONTENT'] })] },
    })

    expect((await fetchFacebookPages('user-token'))[0]!.canPublish).toBe(true)
  })

  it('refuses a Page when the grant is readable and posting was declined', async () => {
    // The person can create content there themselves, but never gave this app permission to.
    // Falling back to `tasks` here would offer a Page they actively refused.
    graph({
      debug_token: debugToken([{ scope: 'pages_show_list', target_ids: [GRANTED_PAGE] }]),
      'me/accounts': { data: [pageNode(GRANTED_PAGE, { tasks: ['CREATE_CONTENT'] })] },
    })

    expect((await fetchFacebookPages('user-token'))[0]!.canPublish).toBe(false)
  })

  it('keeps the other Pages when one named in the grant will not load', async () => {
    fetchMock.mockImplementation((url: unknown) => {
      const target = String(url)
      if (target.includes('debug_token')) {
        return Promise.resolve(
          ok(debugToken([{ scope: 'pages_show_list', target_ids: [GRANTED_PAGE, 'gone'] }]))
        )
      }
      if (target.includes('me/accounts')) return Promise.resolve(ok({ data: [] }))
      if (target.includes('gone')) {
        return Promise.resolve({
          ok: false,
          status: 400,
          json: async () => ({ error: { message: 'Object does not exist' } }),
          headers: new Headers(),
        })
      }
      return Promise.resolve(ok(pageNode(GRANTED_PAGE)))
    })

    const pages = await fetchFacebookPages('user-token')

    expect(pages.map((page) => page.id)).toEqual([GRANTED_PAGE])
  })
})
