import { describe, expect, it, vi, beforeEach } from 'vitest'
import { EMPTY_PAGE_SERIES } from './fixtures'

/**
 * The Facebook window fill — Instagram's auto-fill capability in Facebook's shape. What
 * `npm run check` cannot see: the 90-day chunking (Meta refuses 120 days per call, probed),
 * the marker rows that make an asked-but-unserved day stop counting as unfilled, and the
 * bleed filter that keeps a series bucket from writing outside the asked window.
 */

const fetchPageDaySeries = vi.fn()
vi.mock('@/lib/meta/facebook/insights', () => ({
  fetchPageDaySeries: (...args: unknown[]) => fetchPageDaySeries(...args),
  fetchPagePostMeasurements: async () => [],
}))
const upsertFbPageMetricDays = vi.fn()
// The import() form, not a bare string: a vi.mock path that stops resolving is a SILENT no-op —
// the real module loads and the test passes anyway. tsc checks this one.
vi.mock(import('../fb-page-metrics-store'), () => ({
  upsertFbPageMetricDays: (...args: unknown[]) => upsertFbPageMetricDays(...args),
}))
vi.mock('@/lib/queries/posts-by-media-id', () => ({
  fetchPostIdsByMediaId: async () => new Map(),
}))
vi.mock(import('../post-metrics-store'), () => ({
  upsertPostMetricRows: vi.fn(),
}))

const { fillPageWindow } = await import('../sync-facebook-metrics')

// The admin client is never reached by these paths (stores are mocked).
const admin = {} as never

beforeEach(() => {
  fetchPageDaySeries.mockReset()
  upsertFbPageMetricDays.mockReset()
  fetchPageDaySeries.mockResolvedValue(EMPTY_PAGE_SERIES)
})

describe('fillPageWindow', () => {
  it('splits a window longer than 90 days into chunks Meta accepts', async () => {
    await fillPageWindow(admin, {
      clientId: 'client-1',
      pageId: 'page-1',
      accessToken: 'tok',
      fromDate: '2026-06-08',
      toDate: '2026-09-06', // 91 days inclusive — one day past the cap
    })
    expect(fetchPageDaySeries).toHaveBeenCalledTimes(2)
    // Chunk one covers exactly 90 days; chunk two picks up the remainder.
    const [, , since1, until1] = fetchPageDaySeries.mock.calls[0] as [
      string,
      string,
      number,
      number,
    ]
    expect((until1 - since1) / 86_400).toBe(90)
    const [, , since2] = fetchPageDaySeries.mock.calls[1] as [string, string, number, number]
    expect(since2).toBe(until1)
  })

  it('writes marker rows for asked days Meta served nothing for, so the fill settles', async () => {
    fetchPageDaySeries.mockResolvedValue({
      ...EMPTY_PAGE_SERIES,
      page_follows: [{ date: '2026-09-02', value: 64 }],
    })
    const outcome = await fillPageWindow(admin, {
      clientId: 'client-1',
      pageId: 'page-1',
      accessToken: 'tok',
      fromDate: '2026-09-01',
      toDate: '2026-09-03',
    })
    const rows = upsertFbPageMetricDays.mock.calls[0]![1] as Array<Record<string, unknown>>
    const dates = rows.map((row) => row.metric_date).sort()
    expect(dates).toEqual(['2026-09-01', '2026-09-02', '2026-09-03'])
    // The served day is a measurement; the other two are markers — asked, nothing there.
    const marker = rows.find((row) => row.metric_date === '2026-09-01')!
    expect('followers_count' in marker).toBe(false)
    expect(marker.totals_synced_at).toBeTruthy()
    expect(outcome.wroteDays).toBe(3)
  })

  it('drops series buckets that bleed outside the asked window', async () => {
    fetchPageDaySeries.mockResolvedValue({
      ...EMPTY_PAGE_SERIES,
      // Meta's until is loose: a bucket one day past the window can arrive.
      page_views_total: [
        { date: '2026-09-02', value: 5 },
        { date: '2026-09-04', value: 9 },
      ],
    })
    await fillPageWindow(admin, {
      clientId: 'client-1',
      pageId: 'page-1',
      accessToken: 'tok',
      fromDate: '2026-09-01',
      toDate: '2026-09-03',
    })
    const rows = upsertFbPageMetricDays.mock.calls[0]![1] as Array<Record<string, unknown>>
    expect(rows.every((row) => (row.metric_date as string) <= '2026-09-03')).toBe(true)
  })
})
