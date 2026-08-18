import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ClientData } from '@/lib/clients/fetch-client-data'
import type { ResearchSource } from '../sources/research-source'
import type { ResearchTopic, ClientSourceRow, SourceContext } from '../types'

/**
 * Characterization tests for `ResearchPipeline.execute()`.
 *
 * The method is ~180 lines orchestrating six collaborators and had zero coverage —
 * only its two pure helpers were tested. These tests pin the behaviour that survives
 * the gather/plan split, so the extraction is provably behaviour-preserving rather
 * than hopefully so. They assert what `execute()` *does*, not what it should do:
 * where current behaviour is a known defect (the grounding top-up, the count-scaled
 * fetch budget) it is pinned here and changed deliberately in a later commit.
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
    rankSourceItems: vi.fn(),
    generateTopics: vi.fn(),
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
vi.mock('../rank-source-items', () => ({
  rankSourceItems: mocks.rankSourceItems,
  RANK_MIN_ITEMS: 8,
}))
vi.mock('../generators/topic-generator', () => ({ generateTopics: mocks.generateTopics }))

const { performResearch } = await import('../research-orchestrator')

// ---- fixtures ----

function clientData(overrides: Partial<ClientData> = {}): ClientData {
  return {
    id: 'client-1',
    name: 'Acme',
    niche: 'physio',
    language: 'English',
    tone: 'warm',
    targetAudience: 'runners',
    avoidTopics: '',
    socialGoals: '',
    contentPillars: [{ id: 'p1', pillar: 'Education', weight: 100 }],
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
    ...overrides,
  }
}

/** A ResearchSource stand-in exposing only the surface `execute()` touches. */
function fakeSource(over: Partial<Record<string, unknown>> = {}): ResearchSource {
  const base = {
    id: 'src-1',
    pillarIds: null,
    isNetworkFetchable: () => true,
    fetch: vi.fn().mockResolvedValue({ status: 'ok', error: null }),
    reportStatus: vi.fn().mockResolvedValue(undefined),
    getRssItems: () => [],
    getWebExcerpts: () => [],
    hasFileContent: () => false,
    getFileExcerpt: () => null,
    addToFullTextIndex: () => {},
    addToAttributionIndex: () => {},
    ...over,
  }
  // The pipeline only ever calls the methods above; a full subclass instance would
  // drag in network fetching for no added coverage.
  return base as unknown as ResearchSource
}

function tavilyRow(): ClientSourceRow {
  return {
    id: 'tav-1',
    type: 'tavily',
    label: 'Web research',
    url: '',
    config: {},
    pillar_ids: null,
    extracted_text: null,
  } as unknown as ClientSourceRow
}

function topic(over: Partial<ResearchTopic> = {}): ResearchTopic {
  return {
    finding: 'f',
    suggested_theme: 'A theme',
    source_url: 'https://example.com/a',
    source_type: 'rss',
    // The topic schema requires an excerpt of every topic the model returns, so
    // the default fixture carries one — grounding needs source TEXT, not just a
    // reference, and a fixture without it would not represent a real response.
    source_excerpt: 'What the source actually says.',
    ...over,
  }
}

function run(
  over: {
    count?: number
    briefs?: { text: string }[]
    preloaded?: ClientData
    onPhase?: (m: string) => void
    onTopic?: (t: ResearchTopic) => void
    onSkippedPillars?: (p: { name: string }[], n: number) => void
  } = {}
) {
  return performResearch({
    supabase: {} as unknown as SupabaseClient,
    clientId: 'client-1',
    niche: 'physio',
    count: over.count ?? 3,
    briefs: over.briefs,
    preloadedClientData: over.preloaded ?? clientData(),
    onPhase: over.onPhase,
    onTopic: over.onTopic,
    onSkippedPillars: over.onSkippedPillars,
  })
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
  mocks.rankSourceItems.mockImplementation(async (ctx: SourceContext) => ctx)
  mocks.generateTopics.mockResolvedValue([])
})

describe('ResearchPipeline.execute — no source material', () => {
  it('returns [] and announces it when nothing was gathered', async () => {
    const phases: string[] = []
    const result = await run({ onPhase: (m) => phases.push(m) })

    expect(result).toEqual([])
    expect(phases).toContain('No source material found')
    // The bail happens before any LLM work.
    expect(mocks.rankSourceItems).not.toHaveBeenCalled()
    expect(mocks.generateTopics).not.toHaveBeenCalled()
  })

  it('proceeds on Instagram performance alone', async () => {
    // A client whose only working signal is their own top posts used to get
    // "No source material found" and a zero-post run, because hasAnySources
    // ignored the items it had just fetched.
    mocks.fetchPerformanceItems.mockResolvedValue([
      { caption: 'a top post', engagementSummary: '100 likes' },
    ])
    mocks.generateTopics.mockResolvedValue([
      topic({ suggested_theme: 'follow-up angle', source_url: null, source_type: 'performance' }),
    ])
    const phases: string[] = []

    const result = await run({ count: 1, onPhase: (m) => phases.push(m) })

    expect(result.map((t) => t.suggested_theme)).toEqual(['follow-up angle'])
    expect(phases).not.toContain('No source material found')
    expect(phases).toContain('Analyzing 1 top Instagram posts...')
  })
})

describe('ResearchPipeline.execute — grounding filter', () => {
  it('drops topics with no source url', async () => {
    mocks.fetchClientSources.mockResolvedValue([tavilyRow()])
    mocks.searchTrends.mockResolvedValue([{ title: 't', snippet: 's', url: 'u', score: 1 }])
    mocks.generateTopics.mockResolvedValue([
      topic({ suggested_theme: 'grounded' }),
      topic({ suggested_theme: 'invented', source_url: null, source_type: 'rss' }),
    ])

    const result = await run({ count: 2 })

    expect(result.map((t) => t.suggested_theme)).toEqual(['grounded'])
  })

  // A URL is a reference, not material. Validation compares the post against
  // source TEXT, so a topic with nothing behind its URL would be written blind
  // and saved showing a source it was never checked against.
  it('drops a topic that has a url but no source text', async () => {
    mocks.fetchClientSources.mockResolvedValue([tavilyRow()])
    mocks.searchTrends.mockResolvedValue([{ title: 't', snippet: 's', url: 'u', score: 1 }])
    mocks.generateTopics.mockResolvedValue([
      topic({ suggested_theme: 'grounded' }),
      topic({ suggested_theme: 'empty excerpt', source_excerpt: '   ' }),
      topic({ suggested_theme: 'no excerpt at all', source_excerpt: undefined }),
    ])

    const result = await run({ count: 3 })

    expect(result.map((t) => t.suggested_theme)).toEqual(['grounded'])
  })

  it('keeps file and performance topics that legitimately have no url', async () => {
    mocks.fetchClientSources.mockResolvedValue([tavilyRow()])
    mocks.searchTrends.mockResolvedValue([{ title: 't', snippet: 's', url: 'u', score: 1 }])
    mocks.generateTopics.mockResolvedValue([
      topic({ suggested_theme: 'from a pdf', source_url: null, source_type: 'file' }),
      topic({ suggested_theme: 'from ig', source_url: null, source_type: 'performance' }),
    ])

    const result = await run({ count: 2 })

    expect(result.map((t) => t.suggested_theme)).toEqual(['from a pdf', 'from ig'])
  })

  it('drops a topic whose theme is blank even when it has a url', async () => {
    mocks.fetchClientSources.mockResolvedValue([tavilyRow()])
    mocks.searchTrends.mockResolvedValue([{ title: 't', snippet: 's', url: 'u', score: 1 }])
    mocks.generateTopics.mockResolvedValue([topic({ suggested_theme: '   ' })])

    expect(await run({ count: 1 })).toEqual([])
  })
})

describe('ResearchPipeline.execute — a short run stays short', () => {
  beforeEach(() => {
    mocks.fetchClientSources.mockResolvedValue([tavilyRow()])
    mocks.searchTrends.mockResolvedValue([{ title: 't', snippet: 's', url: 'u', score: 1 }])
  })

  it('asks the model once, even when the grounding filter leaves it short', async () => {
    // The prompt already requires every topic to be grounded. The retry round that
    // used to run here spent a second Sonnet call re-asking for a rule the model had
    // already been given, and could still come back short.
    mocks.generateTopics.mockResolvedValue([
      topic({ suggested_theme: 'kept' }),
      topic({ suggested_theme: 'invented', source_url: null }),
    ])

    const result = await run({ count: 3 })

    expect(mocks.generateTopics).toHaveBeenCalledTimes(1)
    expect(result.map((t) => t.suggested_theme)).toEqual(['kept'])
  })
})

describe('ResearchPipeline.execute — a researched post is always sourced', () => {
  // The ungrounded fallback exists for briefs only. A researched run must never
  // ship a post the model invented, and the allowance must not leak across.
  beforeEach(() => {
    mocks.fetchClientSources.mockResolvedValue([tavilyRow()])
    mocks.searchTrends.mockResolvedValue([{ title: 't', snippet: 's', url: 'u', score: 1 }])
  })

  it('drops an ungrounded topic even when the model mislabels it as a brief', async () => {
    // No briefs were requested, so a brief_index is the model mislabelling. Without
    // the range check this would take the ungrounded path and ship unsourced.
    mocks.generateTopics.mockResolvedValue([
      topic({ suggested_theme: 'smuggled', brief_index: 1, source_url: null, source_type: null }),
      topic({ suggested_theme: 'legitimate' }),
    ])

    const result = await run({ count: 2 })

    expect(result.map((t) => t.suggested_theme)).toEqual(['legitimate'])
  })

  it('never returns an unsourced post when no briefs were requested', async () => {
    mocks.generateTopics.mockResolvedValue([
      topic({ suggested_theme: 'a', source_url: null, source_type: null }),
      topic({ suggested_theme: 'b', source_url: null, source_type: 'rss' }),
      topic({ suggested_theme: 'c', source_url: null, brief_index: 2, source_type: null }),
    ])

    const result = await run({ count: 3 })

    expect(result).toEqual([])
  })

  it('caps unsourced posts at the number of briefs, however many the model labels', async () => {
    // Two topics both claim brief 1. The first takes the slot; the duplicate falls
    // through to the researched pile and is grounding-filtered like any other.
    mocks.generateTopics.mockResolvedValue([
      topic({ suggested_theme: 'the brief', brief_index: 1, source_url: null, source_type: null }),
      topic({
        suggested_theme: 'also claiming',
        brief_index: 1,
        source_url: null,
        source_type: null,
      }),
      topic({ suggested_theme: 'researched', brief_index: null }),
    ])

    const result = await run({ count: 2, briefs: [{ text: 'one idea' }] })

    const unsourced = result.filter(
      (t) => !t.source_url && t.source_type !== 'file' && t.source_type !== 'performance'
    )
    expect(unsourced).toHaveLength(1)
    expect(result.map((t) => t.suggested_theme)).toEqual(['the brief', 'researched'])
  })
})

describe('ResearchPipeline.execute — briefs', () => {
  beforeEach(() => {
    mocks.fetchClientSources.mockResolvedValue([tavilyRow()])
    mocks.searchTrends.mockResolvedValue([{ title: 't', snippet: 's', url: 'u', score: 1 }])
  })

  it('plans briefs and researched topics in one call', async () => {
    mocks.generateTopics.mockResolvedValue([
      topic({ suggested_theme: 'researched', brief_index: null }),
      topic({ suggested_theme: 'from the brief', brief_index: 1 }),
    ])

    const result = await run({ count: 1, briefs: [{ text: 'post about our new programme' }] })

    expect(mocks.generateTopics).toHaveBeenCalledTimes(1)
    expect(mocks.generateTopics).toHaveBeenCalledWith(
      expect.anything(),
      { briefs: [{ text: 'post about our new programme' }], researchCount: 1 },
      expect.anything()
    )
    // Briefs lead: the client asked for them.
    expect(result.map((t) => t.suggested_theme)).toEqual(['from the brief', 'researched'])
  })

  it('keeps an unsourced brief topic but drops an unsourced researched one', async () => {
    mocks.generateTopics.mockResolvedValue([
      topic({
        suggested_theme: 'brief, no source',
        brief_index: 1,
        source_url: null,
        source_type: null,
      }),
      topic({ suggested_theme: 'invented', brief_index: null, source_url: null }),
    ])

    const result = await run({ count: 1, briefs: [{ text: 'anything' }] })

    expect(result.map((t) => t.suggested_theme)).toEqual(['brief, no source'])
  })

  it('orders brief topics by their index and ignores a duplicate claim', async () => {
    mocks.generateTopics.mockResolvedValue([
      topic({ suggested_theme: 'second', brief_index: 2 }),
      topic({ suggested_theme: 'first', brief_index: 1 }),
      topic({ suggested_theme: 'impostor', brief_index: 1 }),
    ])

    const result = await run({ count: 0, briefs: [{ text: 'a' }, { text: 'b' }] })

    // The duplicate falls through to the researched pile, where it is grounded and
    // therefore kept — but researchCount is 0, so it is sliced away.
    expect(result.map((t) => t.suggested_theme)).toEqual(['first', 'second'])
  })

  it('clears the index on a demoted duplicate so it cannot shadow the brief downstream', async () => {
    // The route keys themes by brief_index; a surviving duplicate that kept its
    // index would silently replace the brief's planned theme there.
    mocks.generateTopics.mockResolvedValue([
      topic({ suggested_theme: 'the plan', brief_index: 1 }),
      topic({ suggested_theme: 'impostor', brief_index: 1, source_url: 'https://example.com/b' }),
    ])

    const result = await run({ count: 1, briefs: [{ text: 'a' }] })

    expect(result.map((t) => t.suggested_theme)).toEqual(['the plan', 'impostor'])
    expect(result[0]?.brief_index).toBe(1)
    expect(result[1]?.brief_index).toBeNull()
  })

  it('keeps an out-of-range claim as a researched topic with its index cleared', async () => {
    mocks.generateTopics.mockResolvedValue([
      topic({ suggested_theme: 'mislabelled', brief_index: 7 }),
    ])

    const result = await run({ count: 1, briefs: [{ text: 'a' }, { text: 'b' }] })

    expect(result.map((t) => t.suggested_theme)).toEqual(['mislabelled'])
    expect(result[0]?.brief_index).toBeNull()
  })

  it('gives a blank-themed topic no brief slot', async () => {
    // A blank theme would become the post's description; dropping the claim lets
    // the route write a real title from the brief instead.
    mocks.generateTopics.mockResolvedValue([topic({ suggested_theme: '   ', brief_index: 1 })])

    const result = await run({ count: 0, briefs: [{ text: 'a' }] })

    expect(result).toEqual([])
  })

  it('skips the Instagram performance fetch when there is nothing to research', async () => {
    // Performance is a style signal for choosing topics; a briefs-only run has its
    // topics already, so the fetch would only spend and mislead the phase stream.
    mocks.generateTopics.mockResolvedValue([topic({ brief_index: 1 })])

    await run({ count: 0, briefs: [{ text: 'anything' }] })

    expect(mocks.fetchPerformanceItems).not.toHaveBeenCalled()
  })

  it('runs briefs even when nothing at all was gathered', async () => {
    mocks.fetchClientSources.mockResolvedValue([])
    mocks.searchTrends.mockResolvedValue([])
    mocks.generateTopics.mockResolvedValue([
      topic({
        suggested_theme: 'from the brief alone',
        brief_index: 1,
        source_url: null,
        source_type: null,
      }),
    ])
    const phases: string[] = []

    const result = await run({
      count: 0,
      briefs: [{ text: 'our anniversary' }],
      onPhase: (m) => phases.push(m),
    })

    expect(result.map((t) => t.suggested_theme)).toEqual(['from the brief alone'])
    expect(phases).not.toContain('No source material found')
  })

  it('searches the web for the brief itself, not just the niche', async () => {
    mocks.fetchClientSources.mockResolvedValue([tavilyRow()])
    mocks.searchTrends.mockResolvedValue([{ title: 't', snippet: 's', url: 'u', score: 1 }])
    mocks.generateTopics.mockResolvedValue([topic({ brief_index: 1 })])

    await run({ count: 0, briefs: [{ text: 'the new EU packaging rules' }] })

    expect(mocks.searchTrends).toHaveBeenCalledWith(
      'physio',
      expect.any(Number),
      expect.objectContaining({ focusTexts: ['the new EU packaging rules'] })
    )
  })

  it('still crawls the client website for a briefs-only run', async () => {
    // computeFetchLimits(0) returns websiteMaxPages: 0 — it scales the haystack to
    // the post count, which is backwards for one specific need. A brief about "our
    // new programme" is answered by the client's own site, so a zero page budget
    // would make the most relevant source unreachable.
    const fetchSpy = vi.fn().mockResolvedValue({ status: 'ok', error: null })
    mocks.createAllSources.mockReturnValue([fakeSource({ fetch: fetchSpy })])
    mocks.generateTopics.mockResolvedValue([topic({ brief_index: 1 })])

    await run({ count: 0, briefs: [{ text: 'our new programme' }] })

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(fetchSpy.mock.calls[0]?.[0]).toMatchObject({ websiteMaxPages: expect.any(Number) })
    expect(fetchSpy.mock.calls[0]?.[0]?.websiteMaxPages).toBeGreaterThan(0)
  })

  it('gathers owned material but not RSS when there is nothing to research', async () => {
    mocks.fetchClientSources.mockResolvedValue([
      tavilyRow(),
      {
        id: 'r1',
        type: 'rss',
        label: 'Feed',
        url: 'u',
        config: {},
        pillar_ids: null,
        extracted_text: null,
      },
      {
        id: 'w1',
        type: 'website',
        label: 'Site',
        url: 'u',
        config: {},
        pillar_ids: null,
        extracted_text: null,
      },
      {
        id: 'f1',
        type: 'file',
        label: 'Doc',
        url: '',
        config: {},
        pillar_ids: null,
        extracted_text: 't',
      },
    ])
    mocks.generateTopics.mockResolvedValue([topic({ brief_index: 1 })])

    await run({ count: 0, briefs: [{ text: 'anything' }] })

    // An RSS feed is a recency stream selected for the niche — a poor match for one
    // specific request, and the costliest fetch of the three.
    const kinds = (mocks.createAllSources.mock.calls[0]?.[0] ?? []).map(
      (r: { type: string }) => r.type
    )
    expect(kinds.sort()).toEqual(['file', 'website'])
  })

  it('does no work at all when there is nothing to plan', async () => {
    const result = await run({ count: 0 })

    expect(result).toEqual([])
    expect(mocks.fetchClientSources).not.toHaveBeenCalled()
    expect(mocks.searchTrends).not.toHaveBeenCalled()
    expect(mocks.generateTopics).not.toHaveBeenCalled()
  })
})

describe('ResearchPipeline.execute — server-side attachment', () => {
  it('attaches full text and client_source_id by url', async () => {
    mocks.createAllSources.mockReturnValue([
      fakeSource({
        id: 'rss-9',
        getRssItems: () => [
          { title: 'i', description: 'd', link: 'https://example.com/a', pubDate: null },
        ],
        addToFullTextIndex: (byUrl: Map<string, string>) =>
          byUrl.set('https://example.com/a', 'the full article text'),
        addToAttributionIndex: (byUrl: Map<string, string>) =>
          byUrl.set('https://example.com/a', 'rss-9'),
      }),
    ])
    mocks.generateTopics.mockResolvedValue([topic()])

    const [result] = await run({ count: 1 })

    expect(result?.source_full_text).toBe('the full article text')
    expect(result?.client_source_id).toBe('rss-9')
  })

  it('resolves a web_search topic to the tavily row and leaves others null', async () => {
    mocks.fetchClientSources.mockResolvedValue([tavilyRow()])
    mocks.searchTrends.mockResolvedValue([{ title: 't', snippet: 's', url: 'u', score: 1 }])
    mocks.generateTopics.mockResolvedValue([
      topic({ suggested_theme: 'web', source_type: 'web_search' }),
      topic({ suggested_theme: 'orphan', source_url: null, source_type: 'performance' }),
    ])

    const result = await run({ count: 2 })

    expect(result[0]?.client_source_id).toBe('tav-1')
    expect(result[1]?.client_source_id).toBeNull()
  })

  it('attaches file full text by title', async () => {
    mocks.createAllSources.mockReturnValue([
      fakeSource({
        id: 'file-3',
        hasFileContent: () => true,
        getFileExcerpt: () => ({ label: 'brand.pdf', text: 'excerpt' }),
        addToFullTextIndex: (_byUrl: Map<string, string>, byLabel: Map<string, string>) =>
          byLabel.set('brand.pdf', 'the whole pdf'),
        addToAttributionIndex: (_byUrl: Map<string, string>, byLabel: Map<string, string>) =>
          byLabel.set('brand.pdf', 'file-3'),
      }),
    ])
    mocks.generateTopics.mockResolvedValue([
      topic({ source_url: null, source_type: 'file', source_title: 'brand.pdf' }),
    ])

    const [result] = await run({ count: 1 })

    expect(result?.source_full_text).toBe('the whole pdf')
    expect(result?.client_source_id).toBe('file-3')
  })
})

describe('ResearchPipeline.execute — output contract', () => {
  beforeEach(() => {
    mocks.fetchClientSources.mockResolvedValue([tavilyRow()])
    mocks.searchTrends.mockResolvedValue([{ title: 't', snippet: 's', url: 'u', score: 1 }])
  })

  it('slices to the requested count and emits one onTopic per kept topic', async () => {
    mocks.generateTopics.mockResolvedValue([
      topic({ suggested_theme: 'a' }),
      topic({ suggested_theme: 'b', source_url: 'https://example.com/b' }),
      topic({ suggested_theme: 'c', source_url: 'https://example.com/c' }),
    ])
    const seen: string[] = []

    const result = await run({ count: 2, onTopic: (t) => seen.push(t.suggested_theme) })

    expect(result).toHaveLength(2)
    expect(seen).toEqual(['a', 'b'])
  })

  it('reports a pillar the research never covered', async () => {
    const pillars = [
      { id: 'p1', pillar: 'Education', weight: 50 },
      { id: 'p2', pillar: 'Promo', weight: 50 },
    ]
    mocks.generateTopics.mockResolvedValue([
      topic({ suggested_theme: 'a', pillar: 'Education' }),
      topic({ suggested_theme: 'b', pillar: 'Education', source_url: 'https://example.com/b' }),
    ])
    const skipped: { name: string }[][] = []

    await run({
      count: 2,
      preloaded: clientData({ contentPillars: pillars }),
      onSkippedPillars: (p) => skipped.push(p),
    })

    expect(skipped[0]?.map((p) => p.name)).toEqual(['Promo'])
  })

  it('reports a pillar whose only topic was dropped by the grounding filter', async () => {
    // Coverage is computed after the filter: a pillar served only by an invented
    // topic delivered nothing, so staying silent about it would be a lie.
    const pillars = [
      { id: 'p1', pillar: 'Education', weight: 50 },
      { id: 'p2', pillar: 'Promo', weight: 50 },
    ]
    mocks.generateTopics.mockResolvedValue([
      topic({ suggested_theme: 'a', pillar: 'Education' }),
      topic({ suggested_theme: 'invented', pillar: 'Promo', source_url: null, source_type: 'rss' }),
    ])
    const skipped: { name: string }[][] = []

    await run({
      count: 2,
      preloaded: clientData({ contentPillars: pillars }),
      onSkippedPillars: (p) => skipped.push(p),
    })

    expect(skipped[0]?.map((p) => p.name)).toEqual(['Promo'])
  })

  it('passes the ranked context to topic generation, not the raw one', async () => {
    const ranked: SourceContext = { rssItems: [], websiteExcerpts: [], fileExcerpts: [] }
    mocks.rankSourceItems.mockResolvedValue(ranked)
    mocks.generateTopics.mockResolvedValue([topic()])

    await run({ count: 1 })

    expect(mocks.generateTopics).toHaveBeenCalledWith(
      expect.anything(),
      { briefs: [], researchCount: 1 },
      ranked
    )
  })
})
