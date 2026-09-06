import { describe, expect, it, vi, beforeEach } from 'vitest'

/**
 * The Page insights fetch layer, asserted against the probe's own envelopes
 * (docs/META-FB-PROBE.md, 2026-09-06): a `period=day` series arrives as
 * `values[{ value, end_time }]`, the five metrics go out ONE PER CALL, and a post's
 * `shares` field is ABSENT when zero — the mapping that turns absence into a stored
 * value happens in the sync, so this layer must hand absence through untouched.
 */

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

const { fetchPageDaySeries, fetchPagePostMeasurements, PAGE_DAY_METRICS } =
  await import('../insights')

function ok(body: unknown) {
  return { ok: true, status: 200, json: async () => body, headers: new Headers() }
}

const PAGE_ID = '723701000827665'
const TOKEN = 'page-tok'

/** The decoded URL of one outgoing call; tolerates the runner's own no-arg invocation. */
function urlOf(call: unknown[]): string {
  return decodeURIComponent(String(call[0] ?? ''))
}

function seriesEnvelope(metric: string, points: Array<{ value: number; end_time: string }>) {
  return { data: [{ name: metric, period: 'day', values: points }] }
}

beforeEach(() => fetchMock.mockReset())

describe('fetchPageDaySeries', () => {
  it('asks for the five metrics one call each, never batched', async () => {
    // A single dead metric name fails a batched request outright — which is exactly how the
    // previous integration concluded ALL Page metrics were gone and shipped zeros for months.
    fetchMock.mockImplementation((input: unknown) => {
      const metric = /metric=([a-z_]+)/.exec(String(input ?? ''))?.[1] ?? 'unknown'
      return Promise.resolve(ok(seriesEnvelope(metric, [])))
    })

    await fetchPageDaySeries(PAGE_ID, TOKEN, 1_756_000_000, 1_756_600_000)

    const urls = fetchMock.mock.calls.map((call) => urlOf(call as unknown[]))
    expect(urls).toHaveLength(PAGE_DAY_METRICS.length)
    for (const metric of PAGE_DAY_METRICS) {
      const own = urls.filter((url) => url.includes(`metric=${metric}&`))
      expect(own).toHaveLength(1)
      expect(own[0]).toContain('period=day')
      expect(own[0]).toContain('since=1756000000')
      expect(own[0]).toContain('until=1756600000')
    }
  })

  it('buckets each series to dates and keys the result by metric', async () => {
    fetchMock.mockImplementation((input: unknown) => {
      const url = String(input ?? '')
      if (url.includes('metric=page_follows')) {
        // The follower LEVEL rides this series — 64 both days on the probed live Page.
        return Promise.resolve(
          ok(
            seriesEnvelope('page_follows', [
              { value: 64, end_time: '2026-09-03T07:00:00+0000' },
              { value: 64, end_time: '2026-09-04T07:00:00+0000' },
            ])
          )
        )
      }
      if (url.includes('metric=page_post_engagements')) {
        return Promise.resolve(
          ok(
            seriesEnvelope('page_post_engagements', [
              { value: 3, end_time: '2026-09-04T07:00:00+0000' },
            ])
          )
        )
      }
      const metric = /metric=([a-z_]+)/.exec(url)?.[1] ?? 'unknown'
      return Promise.resolve(ok(seriesEnvelope(metric, [])))
    })

    const series = await fetchPageDaySeries(PAGE_ID, TOKEN, 1, 2)

    expect(series.page_follows).toEqual([
      { date: '2026-09-03', value: 64 },
      { date: '2026-09-04', value: 64 },
    ])
    expect(series.page_post_engagements).toEqual([{ date: '2026-09-04', value: 3 }])
    // An empty series is the API's silence, never zeros.
    expect(series.page_views_total).toEqual([])
    expect(series.page_daily_unfollows_unique).toEqual([])
  })
})

describe('fetchPagePostMeasurements', () => {
  it('reads identity and measurements in one published_posts call, since as epoch seconds', async () => {
    fetchMock.mockResolvedValue(
      ok({
        data: [
          {
            id: '723701000827665_122167637282960180',
            created_time: '2026-09-05T14:20:00+0000',
            message: 'hello',
            permalink_url: 'https://facebook.com/p',
            full_picture: 'https://cdn/p.jpg',
            // shares ABSENT — the probed zero-shares shape.
            reactions: { data: [], summary: { total_count: 1 } },
            comments: { data: [], summary: { total_count: 1 } },
          },
        ],
      })
    )

    const posts = await fetchPagePostMeasurements(PAGE_ID, TOKEN, '2026-08-06T00:00:00.000Z')

    const url = urlOf(fetchMock.mock.calls[0] as unknown[])
    expect(url).toContain(`/${PAGE_ID}/published_posts`)
    expect(url).toContain('reactions.summary(true).limit(0)')
    expect(url).toContain('comments.summary(true).limit(0)')
    expect(url).toContain('shares')
    expect(url).toContain(`since=${Math.floor(Date.parse('2026-08-06T00:00:00.000Z') / 1000)}`)

    expect(posts).toHaveLength(1)
    expect(posts[0]!.reactions?.summary?.total_count).toBe(1)
    expect(posts[0]!.comments?.summary?.total_count).toBe(1)
    // Absence hands through untouched; the sync owns the absent→0 decision.
    expect(posts[0]!.shares).toBeUndefined()
  })
})
