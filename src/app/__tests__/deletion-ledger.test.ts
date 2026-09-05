import { existsSync, readdirSync, readFileSync } from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

const SRC = path.resolve(__dirname, '../..')

/**
 * The pipeline-refactor deletion ledger, made permanent.
 *
 * Nothing in the toolchain catches an orphaned export — no knip or ts-prune in
 * devDependencies, and no-unused-vars only flags locals. That is exactly how a
 * 20-caption query with zero readers and a "single source of truth" string with
 * no importers survived for months. These assertions make the 2026-08 deletions
 * stick: a change that re-introduces one of these names has to delete its line
 * here, which is the conversation the ledger exists to force.
 *
 * A general unused-export detector is deliberately NOT attempted: Next.js route
 * files legitimately export POST/GET/maxDuration with no in-repo referrer, so it
 * would need an allow-list large enough to hide real findings.
 */

function walkSources(): Array<{ file: string; body: string }> {
  const out: Array<{ file: string; body: string }> = []
  const walk = (current: string) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules') walk(full)
      } else if (/\.(ts|tsx)$/.test(entry.name)) {
        out.push({ file: path.relative(SRC, full), body: readFileSync(full, 'utf8') })
      }
    }
  }
  walk(SRC)
  return out
}

const OWN_FILE = path.join('app', '__tests__', 'deletion-ledger.test.ts')

describe('deleted files stay deleted', () => {
  it.each([
    'src/ai/research/search-for-idea.ts',
    'src/app/api/ai/generate-from-idea',
    'src/app/api/ideas/route.ts',
    // The DELETE twin of disconnectConnection (connection-actions.ts): same
    // ownership select, same cast, same delete, minus its revalidateTag — and
    // zero callers. Kept the connection-delete sites at two instead of three,
    // so "should disconnect purge analytics too?" has one place to be decided.
    'src/app/api/meta/connections/[connectionId]/route.ts',
    'src/features/sources/lib/ensure-web-research-source.ts',
    'src/features/ideas/components/idea-card.tsx',
    'src/features/ideas/lib/cache.ts',
    'src/lib/meta/facebook-metrics.ts',
    // Network contract (2026-09): Instagram's publishing calls moved into
    // lib/meta/networks/instagram.ts, behind the adapter the publish path talks
    // to. A file here again would mean a network's Graph calls living outside
    // its own module, which is how the last Facebook integration ended up as a
    // parallel branch at every layer.
    'src/lib/meta/publishing.ts',
    // Platform moved from authoring to publishing (2026-09): these three picked the
    // network a post was WRITTEN for — the wizard's chip group, the onboarding sheet's
    // row. Copy is written once and its destinations are chosen when it is scheduled, so
    // a picker here would be asking a question before anyone can answer it.
    'src/features/generate/components/setup/platform-group.tsx',
    'src/features/onboarding/components/rows/platform-row.tsx',
    // The loosely-typed admin client `post_publications` needed for one release, while
    // `database.ts` did not know the table yet. Its own docblock scheduled this: the
    // comments feature carried an identical file for exactly one release. A file here
    // again means a table is being written through a client that cannot check it.
    'src/features/publishing/lib/admin-client.ts',
  ])('%s does not exist', (relPath) => {
    expect(existsSync(path.resolve(SRC, '..', relPath))).toBe(false)
  })
})

describe('deleted symbols stay unreferenced', () => {
  // Comment lines are skipped: prose may name a retired symbol to explain its
  // absence. Code may not.
  const DELETED = [
    'generateTopUpTopics',
    'IDEA_STAGE_LABELS',
    'GenerateStreamEvent',
    'ResearchStreamEvent',
    'NEUTRAL_FALLBACK_SCORE',
    'topPerformingPosts',
    'fetchTopPostsByClient',
    'ensureWebResearchSource',
    'sanitizePromptArray',
    // Instagram-only (2026-08): the Facebook flow and its types
    'fetchFacebookMetrics',
    'FacebookMetrics',
    'pivotFBInsights',
    'fbPagesResponseSchema',
    'FACEBOOK_PAGE_SCOPES',
    'capitalizePlatform',
    // Analytics repair (2026-08): the per-day pivot fiction. The API serves range
    // totals plus two daily series — these reshaped a grid that never existed and
    // mapped silent-empty responses to zeros.
    'pivotIGInsights',
    'sumIGDailyInsights',
    'buildAudienceDemographics',
    'computeNetChangeFromSnapshots',
    'IG_METRIC_KEY_MAP',
    // Chunk D (2026-08): the analytics read path moved to the stored tables.
    // Live-fetch report metrics, the Graph fan-out performance source, and the
    // recharts dependency all went with it.
    'InstagramMetrics',
    'fetchTopPerformingPosts',
    'PERFORMANCE_INSIGHTS_CAP',
    'MediaTypeBreakdownItem',
    'IGDailyInsight',
    'recharts',
    // Comparison legibility (2026-08): the per-cell-scaled interaction bars —
    // heights that only encoded the within-pair ratio and lied across cells.
    // The section renders through ComparisonRows on one shared scale now.
    'InteractionMultiples',
    // Platform moved from authoring to publishing (2026-09). `posts.platform` and the
    // three columns that mirrored it are gone, and with them everything that read or
    // wrote the authoring choice: the display-case list, the publishable subset it was
    // checked against, the gate on the column, and the weekly-mix key the cron used to
    // decide what a batch was for. A name back in the tree means a post is being written
    // for a network again.
    //
    // `PLATFORMS` itself is pinned by its most distinctive member rather than by name:
    // this sweep matches substrings, and `POST_PLATFORMS` — the live connection
    // vocabulary — contains it. 'X / Twitter' appeared in that list and nowhere else.
    "'X / Twitter'",
    'LIVE_PLATFORMS',
    'PLATFORM_LIMITS',
    'isValidPostPlatform',
    'extractPlatformFromMix',
    'activePlatform',
    'createPublishingAdminClient',
    // The calendar's own posts projection, collapsed once its two extra columns moved onto
    // post_publications and left it a verbatim copy of POST_COLUMNS under a second name.
    'CALENDAR_POST_COLUMN_KEYS',
    'CALENDAR_POST_COLUMNS',
    'CalendarPostColumns',
  ]

  it('no source line mentions a ledgered symbol', () => {
    const sources = walkSources().filter(({ file }) => file !== OWN_FILE)
    const offenders = sources.flatMap(({ file, body }) =>
      body
        .split('\n')
        .map((line, i) => ({ line: line.trim(), n: i + 1 }))
        .filter(
          ({ line }) =>
            !line.startsWith('//') &&
            !line.startsWith('*') &&
            DELETED.some((symbol) => line.includes(symbol))
        )
        .map(({ n, line }) => `src/${file}:${n} — ${line}`)
    )

    expect(offenders).toEqual([])
  })

  it("the idea lifecycle has three statuses — 'generating' is retired", () => {
    const apiTypes = readFileSync(path.resolve(SRC, 'types/api.ts'), 'utf8')
    const unionLine = apiTypes.split('\n').find((line) => line.includes('export type IdeaStatus'))

    expect(unionLine).toBeDefined()
    expect(unionLine).not.toContain('generating')
  })

  it('found the tree it means to be guarding', () => {
    // A path typo would make the sweep pass by scanning nothing at all.
    const sources = walkSources()
    expect(sources.length).toBeGreaterThan(400)
    expect(sources.some(({ file }) => file === path.join('types', 'api.ts'))).toBe(true)
  })
})
