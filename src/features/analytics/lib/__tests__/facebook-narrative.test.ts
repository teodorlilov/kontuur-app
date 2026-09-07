import { describe, expect, it, vi } from 'vitest'
import type { FacebookReportData } from '../facebook/build-facebook-report'

/**
 * The Facebook narrative's two pure pieces. The facts builder is the one that matters: it is the
 * model's whole view of the period, and an empty `reach` or `audience` slot on the sheet is an
 * invitation to write prose about a metric Pages do not have.
 */

vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminSupabaseClient: vi.fn() }))
vi.mock('@/lib/queries/db', () => ({ fetchConnectionSyncState: vi.fn() }))
vi.mock('@/ai/analytics/generate-summary', () => ({ generateAnalyticsSummary: vi.fn() }))
// The import() form, not a bare string: a vi.mock path that stops resolving is a SILENT no-op, and
// this one would fail green — the real module loads cleanly under the mocks above and the two pure
// builders under test still pass, so nothing would ever say the isolation was gone. WHY as const:
// the typed form checks this factory against the real module, where FB_METRICS_TAG is the literal
// 'fb-metrics' rather than string, and that strictness is the point.
vi.mock(import('../facebook/facebook-report-data'), () => ({
  FB_METRICS_TAG: 'fb-metrics' as const,
  getFacebookAnalyticsReport: vi.fn(),
}))

const { buildFacebookFallbackNarrative, buildFacebookNarrativeFacts } =
  await import('../facebook/facebook-narrative')

function report(overrides: Partial<FacebookReportData>): FacebookReportData {
  const empty = { now: null, then: null, deltaPct: null, series: [] }
  return {
    period: {
      preset: 'custom',
      start: '2026-09-04',
      end: '2026-09-06',
      prevStart: '2026-09-01',
      prevEnd: '2026-09-03',
      days: 3,
    },
    hasHistory: true,
    lastSyncAt: null,
    followersTotal: null,
    engagements: { ...empty },
    pageViews: { ...empty },
    followers: {
      gained: { now: null, then: null, deltaPct: null },
      lost: { now: null, then: null, deltaPct: null },
      net: { now: null, then: null },
      total: null,
      series: [],
      byDay: [],
      fromPosts: null,
      churnPct: null,
    },
    engagementByDay: [],
    posts: [],
    medianInteractions: null,
    ...overrides,
  }
}

describe('buildFacebookFallbackNarrative', () => {
  it('summarises the period in numbers, and stays quiet with nothing to say', () => {
    const text = buildFacebookFallbackNarrative(
      report({
        engagements: { now: 3, then: null, deltaPct: null, series: [] },
        followers: {
          ...report({}).followers,
          net: { now: 2, then: null },
        },
      })
    )
    expect(text).toContain('Post engagements were 3')
    expect(text).toContain('+2 followers net')

    expect(buildFacebookFallbackNarrative(report({}))).toBeNull()
  })
})

describe('buildFacebookNarrativeFacts', () => {
  it('carries only what Facebook serves — no reach, audience or format slots to write about', () => {
    const facts = buildFacebookNarrativeFacts(
      report({
        engagements: { now: 18, then: 2, deltaPct: 800, series: [] },
        pageViews: { now: 3, then: null, deltaPct: null, series: [] },
      })
    )
    expect(Object.keys(facts).sort()).toEqual([
      'comparedTo',
      'followers',
      'medianInteractions',
      'pageViews',
      'period',
      'postEngagements',
      'postsPublished',
      'topPosts',
    ])
    expect(facts.postEngagements).toEqual({ now: 18, previous: 2 })
    expect(facts).not.toHaveProperty('reach')
    expect(facts).not.toHaveProperty('audience')
    expect(facts).not.toHaveProperty('reachByFormat')
  })
})
