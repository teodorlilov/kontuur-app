import { describe, expect, it, vi, beforeEach } from 'vitest'
import { EMPTY_PAGE_SERIES } from './fixtures'

/**
 * The Facebook window fill — Instagram's auto-fill capability in Facebook's shape. What
 * `npm run check` cannot see: the 90-day chunking (120 answered `Invalid parameter` when
 * probed), the marker rows that make an asked-but-unserved day stop counting as unfilled, and
 * the bleed filter that keeps a series bucket from writing outside the asked window.
 */

const fetchPageDaySeries = vi.fn()
vi.mock('@/lib/meta/facebook/insights', () => ({
  fetchPageDaySeries: (...args: unknown[]) => fetchPageDaySeries(...args),
  fetchPagePostMeasurements: async () => [],
}))
const upsertFbPageMetricDays = vi.fn()
// The import() form, not a bare string: a vi.mock path that stops resolving is a SILENT no-op —
// the real module loads and the test passes anyway. tsc checks this one.
vi.mock(import('../facebook/fb-page-metrics-store'), () => ({
  upsertFbPageMetricDays: (...args: unknown[]) => upsertFbPageMetricDays(...args),
}))
vi.mock('@/lib/queries/posts-by-media-id', () => ({
  fetchPostIdsByMediaId: async () => new Map(),
}))
vi.mock(import('../shared/post-metrics-store'), () => ({
  upsertPostMetricRows: vi.fn(),
}))
const readMarkerRows = vi.fn()
vi.mock(import('../shared/unfilled-days'), async (importOriginal) => ({
  ...(await importOriginal()),
  readMarkerRows: (...args: unknown[]) => readMarkerRows(...args),
}))

const { fillPageWindow } = await import('../facebook/sync-facebook-metrics')

// Only the marker read reaches it, and that is mocked.
const admin = {} as never

/** The default every case starts from: nothing asked of Meta yet, and every series empty. */
beforeEach(() => {
  fetchPageDaySeries.mockReset()
  upsertFbPageMetricDays.mockReset()
  readMarkerRows.mockReset()
  fetchPageDaySeries.mockResolvedValue(EMPTY_PAGE_SERIES)
  readMarkerRows.mockResolvedValue([])
})

describe('fillPageWindow', () => {
  it('splits a 91-day window into chunks Meta accepts: 90 days, then the rest from the first chunk’s until', async () => {
    await fillPageWindow(admin, {
      clientId: 'client-1',
      pageId: 'page-1',
      accessToken: 'tok',
      fromDate: '2026-06-08',
      toDate: '2026-09-06',
    })
    expect(fetchPageDaySeries).toHaveBeenCalledTimes(2)
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
    const marker = rows.find((row) => row.metric_date === '2026-09-01')!
    expect('followers_count' in marker).toBe(false)
    expect(marker.totals_synced_at).toBeTruthy()
    expect(outcome.wroteDays).toBe(3)
  })

  it('drops series buckets that bleed outside the asked window, like the day past it that Meta’s loose until returns', async () => {
    fetchPageDaySeries.mockResolvedValue({
      ...EMPTY_PAGE_SERIES,
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

  it('skips a chunk whose every day was already asked of Meta, and reports zero new days so the auto-fill chain stops', async () => {
    readMarkerRows.mockResolvedValue([
      { metric_date: '2026-09-04', totals_synced_at: '2026-09-07T03:30:00Z' },
      { metric_date: '2026-09-05', totals_synced_at: '2026-09-07T03:30:00Z' },
      { metric_date: '2026-09-06', totals_synced_at: '2026-09-07T03:30:00Z' },
    ])

    const outcome = await fillPageWindow(admin, {
      clientId: 'client-1',
      pageId: 'page-1',
      accessToken: 'tok',
      fromDate: '2026-09-04',
      toDate: '2026-09-06',
    })

    expect(fetchPageDaySeries).not.toHaveBeenCalled()
    expect(upsertFbPageMetricDays).not.toHaveBeenCalled()
    expect(outcome.wroteDays).toBe(0)
  })

  it('counts only the days it adds when part of the window is already marked, re-upserting the marked one harmlessly', async () => {
    readMarkerRows.mockResolvedValue([
      { metric_date: '2026-09-04', totals_synced_at: '2026-09-07T03:30:00Z' },
    ])

    const outcome = await fillPageWindow(admin, {
      clientId: 'client-1',
      pageId: 'page-1',
      accessToken: 'tok',
      fromDate: '2026-09-04',
      toDate: '2026-09-06',
    })

    expect(fetchPageDaySeries).toHaveBeenCalledTimes(1)
    expect(outcome.wroteDays).toBe(2)
  })
})
