import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ClientData } from '@/lib/clients/fetch-client-data'
import type { ClientSourceRow } from '../types'
import { computeFetchLimits } from '../fetch-limits'

/**
 * Pins the pre-skip rule in gatherSources: a pillar nothing can serve — no
 * content source, and the tavily row either absent or topic-limited away — is
 * skipped before research, so the planner never asks for topics it must drop.
 */

const { mocks } = vi.hoisted(() => ({
  mocks: {
    fetchClientSources: vi.fn(),
    fetchUsedSourceUrls: vi.fn(),
    fetchSourceUsageStats: vi.fn(),
    fetchRecentPillarCounts: vi.fn(),
    fetchThemeDescriptions: vi.fn(),
    searchTrends: vi.fn(),
    fetchPerformanceItems: vi.fn(),
    createAllSources: vi.fn(),
  },
}))

vi.mock('@/lib/queries/db', () => ({
  fetchClientSources: mocks.fetchClientSources,
  fetchUsedSourceUrls: mocks.fetchUsedSourceUrls,
  fetchSourceUsageStats: mocks.fetchSourceUsageStats,
  fetchRecentPillarCounts: mocks.fetchRecentPillarCounts,
}))
vi.mock('@/lib/generation/runs', () => ({ fetchThemeDescriptions: mocks.fetchThemeDescriptions }))
vi.mock('@/lib/sources/fetch-trend-search', () => ({ searchTrends: mocks.searchTrends }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminSupabaseClient: () => ({}) }))
vi.mock('../performance-source', () => ({ fetchPerformanceItems: mocks.fetchPerformanceItems }))
vi.mock('../sources/source-factory', () => ({ createAllSources: mocks.createAllSources }))

const { gatherSources } = await import('../source-gathering')

const PILLARS = [
  { id: 'p1', pillar: 'Education', weight: 60 },
  { id: 'p2', pillar: 'Promo', weight: 40 },
]

function clientData(): ClientData {
  return {
    id: 'client-1',
    name: 'Acme',
    niche: 'physio',
    language: 'English',
    tone: 'warm',
    targetAudience: 'runners',
    avoidTopics: '',
    socialGoals: '',
    contentPillars: PILLARS,
    isHealthNiche: false,
    defaultCarouselSlides: 6,
    defaultPostType: 'single',
    languageNotes: '',
    languageConfig: {
      language: 'English',
      formality: 'neutral',
      carouselSwipeCues: '',
      formalityRules: null,
      languageInstructions: '',
      languageNotes: '',
    },
    postHistory: [],
  }
}

function row(over: Partial<ClientSourceRow>): ClientSourceRow {
  return {
    id: 'src-1',
    type: 'rss',
    label: 'Feed',
    url: 'https://x.test',
    config: {},
    pillar_ids: [],
    extracted_text: null,
    ...over,
  } as ClientSourceRow
}

function gather() {
  return gatherSources(
    {
      supabase: {} as unknown as SupabaseClient,
      clientId: 'client-1',
      niche: 'physio',
      count: 3,
      preloadedClientData: clientData(),
    },
    { limits: computeFetchLimits(3), webResultCount: 4 }
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.fetchClientSources.mockResolvedValue([])
  mocks.fetchUsedSourceUrls.mockResolvedValue([])
  mocks.fetchSourceUsageStats.mockResolvedValue([])
  mocks.fetchRecentPillarCounts.mockResolvedValue(new Map())
  mocks.fetchThemeDescriptions.mockResolvedValue([])
  mocks.searchTrends.mockResolvedValue([])
  mocks.fetchPerformanceItems.mockResolvedValue([])
  mocks.createAllSources.mockReturnValue([])
})

describe('gatherSources pre-skip', () => {
  it('a topic-limited tavily row pre-skips pillars outside its limit', async () => {
    mocks.fetchClientSources.mockResolvedValue([
      row({ id: 'tav', type: 'tavily', label: 'Web research', url: '', pillar_ids: ['p1'] }),
    ])

    const gathered = await gather()

    expect(gathered.preSkippedPillars).toEqual([{ name: 'Promo' }])
    expect(gathered.effectivePillars.map((p) => p.id)).toEqual(['p1'])
    // The search itself must stop asking for the unservable pillar
    expect(mocks.searchTrends).toHaveBeenCalledWith(
      'physio',
      4,
      expect.objectContaining({ contentPillars: gathered.effectivePillars })
    )
  })

  it('an unlimited tavily row pre-skips nothing (soft coverage)', async () => {
    mocks.fetchClientSources.mockResolvedValue([
      row({ id: 'tav', type: 'tavily', label: 'Web research', url: '', pillar_ids: [] }),
    ])

    const gathered = await gather()

    expect(gathered.preSkippedPillars).toEqual([])
    expect(gathered.effectivePillars).toHaveLength(2)
  })

  it('without tavily, a pillar no content source feeds is pre-skipped (old hard rule)', async () => {
    mocks.fetchClientSources.mockResolvedValue([row({ pillar_ids: ['p1'] })])

    const gathered = await gather()

    expect(gathered.preSkippedPillars).toEqual([{ name: 'Promo' }])
    expect(gathered.effectivePillars.map((p) => p.id)).toEqual(['p1'])
  })

  it('a content source keeps its pillar even when tavily is limited elsewhere', async () => {
    mocks.fetchClientSources.mockResolvedValue([
      row({ pillar_ids: ['p2'] }),
      row({ id: 'tav', type: 'tavily', label: 'Web research', url: '', pillar_ids: ['p1'] }),
    ])

    const gathered = await gather()

    expect(gathered.preSkippedPillars).toEqual([])
  })

  it('stale pillar_ids degrade to feeds-all instead of starving pillars', async () => {
    mocks.fetchClientSources.mockResolvedValue([row({ pillar_ids: ['deleted-pillar'] })])

    const gathered = await gather()

    expect(gathered.preSkippedPillars).toEqual([])
    expect(gathered.effectivePillars).toHaveLength(2)
  })
})
