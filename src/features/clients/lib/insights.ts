export interface PillarRate {
  pillar: string
  /** Approved share of this pillar's sampled posts, 0-100. */
  rate: number
  total: number
}

export interface ContentInsights {
  avgScore: number | null
  trend: 'improving' | 'stable' | 'declining' | 'insufficient_data'
  pillarRates: PillarRate[]
  topRewritePillars: string[]
  /** How many posts the pillar figures were drawn from — the panel says so rather than implying all-time. */
  sampleSize: number
}

/** Below this many scored posts, recent-vs-older says more about the sample than the content. */
const TREND_MIN_SAMPLE = 10

/** Score movement smaller than this is noise, not a trend. */
const TREND_THRESHOLD = 1

/** How many pillars the "most rewritten" list names. */
const TOP_REWRITE_COUNT = 3

export interface ScoreRow {
  quality_score_avg: number
}

export interface PillarRow {
  pillar: string
  status: string
  rewrite_count: number
}

/**
 * Derives the Content insights panel from two samples of a client's posts.
 *
 * Takes rows rather than a client id: the settings page already fetches both in its one parallel
 * block, and a second query here would serialise behind it. Returns null when there is nothing
 * true to say, which is what makes the panel show its empty state.
 */
export function buildInsights(scores: ScoreRow[], pillarRows: PillarRow[]): ContentInsights | null {
  const avgScore =
    scores.length > 0
      ? Math.round((scores.reduce((sum, r) => sum + r.quality_score_avg, 0) / scores.length) * 10) /
        10
      : null

  const trend = buildTrend(scores)

  const approved = new Map<string, number>()
  const total = new Map<string, number>()
  const rewrites = new Map<string, number>()
  for (const row of pillarRows) {
    total.set(row.pillar, (total.get(row.pillar) ?? 0) + 1)
    if (row.status === 'approved') approved.set(row.pillar, (approved.get(row.pillar) ?? 0) + 1)
    rewrites.set(row.pillar, (rewrites.get(row.pillar) ?? 0) + row.rewrite_count)
  }

  const pillarRates = [...total.entries()]
    .map(([pillar, count]) => ({
      pillar,
      total: count,
      rate: Math.round(((approved.get(pillar) ?? 0) / count) * 100),
    }))
    .sort((a, b) => b.rate - a.rate)

  const topRewritePillars = [...rewrites.entries()]
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_REWRITE_COUNT)
    .map(([pillar]) => pillar)

  if (avgScore === null && pillarRates.length === 0) return null
  return { avgScore, trend, pillarRates, topRewritePillars, sampleSize: pillarRows.length }
}

/** Compares the most recent scores against everything older in the sample. */
function buildTrend(scores: ScoreRow[]): ContentInsights['trend'] {
  if (scores.length < TREND_MIN_SAMPLE) return 'insufficient_data'

  const recent = scores.slice(0, TREND_MIN_SAMPLE)
  const older = scores.slice(TREND_MIN_SAMPLE)
  const diff = mean(recent) - mean(older)

  if (diff > TREND_THRESHOLD) return 'improving'
  if (diff < -TREND_THRESHOLD) return 'declining'
  return 'stable'
}

function mean(rows: ScoreRow[]): number {
  if (rows.length === 0) return 0
  return rows.reduce((sum, r) => sum + r.quality_score_avg, 0) / rows.length
}
