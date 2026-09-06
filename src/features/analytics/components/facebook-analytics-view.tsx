import { Avatar } from '@/components/ui/avatar'
import { PLATFORM_NAMES } from '@/lib/validation'
import type { FacebookReportData } from '../lib/build-facebook-report'
import { formatPeriodRange, formatShortRange } from '../lib/format'
import { AnalyticsSection, ChartLegend } from './analytics-section'
import { EmptyFill } from './empty-fill'
import { FacebookPostsTable } from './facebook-posts-table'
import { FollowerFlow } from './follower-flow'
import { NarrativeBlock } from './narrative-block'
import { ReachTrend, type TrendLabels } from './reach-trend'
import { ReportArchive, type ArchiveEntry } from './report-archive'
import { StripCells, countCellSpec, netFollowersCellSpec } from './summary-strip'
import { SyncLine } from './sync-line'

/** The engagement trend's words — same chart, Facebook's vocabulary. */
const ENGAGEMENT_LABELS: TrendLabels = {
  metric: 'post engagements',
  metricRow: 'Engagements',
  secondaryRow: 'Page views',
  empty: 'No daily engagements captured for this period yet — the nightly sync fills this in.',
}

interface FacebookAnalyticsViewProps {
  data: FacebookReportData
  /** The AI pull-quote, or the deterministic fallback the page computed — never built here. */
  narrative: string | null
  /** True when the wording came from an exported report rather than a fresh write. */
  narrativeArchived: boolean
  clientId: string
  clientName: string
  /** The connected Page's name, for the masthead. */
  pageName: string | null
  hasConnection: boolean
  timezone: string
  /** The last sync ATTEMPT, clean or not — the sync line's own copy says which. */
  lastSyncAt: string | null
  syncError?: string | null
  archive: ArchiveEntry[]
  /** Rides every archive link so an opened report stays on the Facebook view. */
  network: string
}

/**
 * The Facebook report — the same visual language as the Instagram document, deliberately
 * shorter: the sections Meta's 2025-11-15 purge left standing (engagements, page views,
 * follower flow, the posts table) and nothing pretending to be the ones it killed (reach,
 * funnel, formats, audience, when-to-post). A section that cannot be true is absent, never
 * empty.
 */
export function FacebookAnalyticsView({
  data,
  narrative,
  narrativeArchived,
  clientId,
  clientName,
  pageName,
  hasConnection,
  timezone,
  lastSyncAt,
  syncError = null,
  archive,
  network,
}: FacebookAnalyticsViewProps) {
  const { hasHistory, followers } = data
  const flowKnown = followers.gained.now !== null || followers.lost.now !== null

  return (
    <div id="analytics-print-area">
      <header className="flex flex-wrap items-end justify-between gap-6 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <Avatar name={clientName} size="sm" />
            <span className="text-title text-ink">{clientName}</span>
            {pageName && (
              <span className="text-micro text-text3">
                {PLATFORM_NAMES.facebook} · {pageName}
              </span>
            )}
          </div>
          <h2 className="mt-2 hidden text-headline text-ink print:block">Analytics</h2>
          <p className="mt-2.5 flex flex-wrap items-center gap-x-5 gap-y-1 text-body">
            <span className="flex items-center gap-2">
              <i aria-hidden="true" className="h-0.5 w-3.5 flex-none rounded-full bg-forest" />
              <span className="text-text2">
                <strong className="font-medium text-ink">This period</strong> ·{' '}
                {formatPeriodRange(data.period.start, data.period.end)}
              </span>
            </span>
            <span className="flex items-center gap-2">
              <i aria-hidden="true" className="h-0.5 w-3.5 flex-none rounded-full bg-metric-3" />
              <span className="text-text2">
                Previous · {formatShortRange(data.period.prevStart, data.period.prevEnd)}
              </span>
            </span>
          </p>
          <p className="mt-1 text-caption text-text3">
            Every number below compares the two — {data.period.days} days against the{' '}
            {data.period.days} before them. Facebook serves no reach, audience or posting-time data
            for Pages, so this report tells the story it can prove.
          </p>
        </div>
      </header>

      <NarrativeBlock narrative={narrative} archived={narrativeArchived} hasHistory={hasHistory} />

      <StripCells
        cells={[
          countCellSpec('Post engagements', data.engagements),
          countCellSpec('Page views', data.pageViews),
          netFollowersCellSpec(data.followers),
        ]}
        hasHistory={hasHistory}
        gridClass="md:grid-cols-3"
      />

      <div className="mt-7">
        <AnalyticsSection
          title="Engagements, day by day"
          sub="How often people engaged with your posts each day, against the same run of days a period earlier. Each window's posts are pinned on their own row."
          ariaLabel="Engagements, day by day"
          legend={
            <ChartLegend
              items={[
                { swatch: 'now', label: 'This period' },
                { swatch: 'then', label: 'Previous' },
                { swatch: 'pin', label: 'Post published' },
              ]}
            />
          }
        >
          {!hasHistory ? (
            <EmptyFill className="mt-3.5">The trend appears after the first sync</EmptyFill>
          ) : (
            <ReachTrend days={data.engagementByDay} bestDay={null} labels={ENGAGEMENT_LABELS} />
          )}
        </AnalyticsSection>
      </div>

      <div className="mt-7">
        <AnalyticsSection
          title="Who followed, who left"
          sub="Gains and losses day by day — hover a day for the posts behind it."
          ariaLabel="Follower flow"
          legend={
            followers.byDay.some((day) => day.posts.length > 0) ? (
              <ChartLegend items={[{ swatch: 'pin', label: 'Post published' }]} />
            ) : undefined
          }
        >
          {!hasHistory ? (
            <EmptyFill className="mt-3.5">Follower flow appears after the first sync</EmptyFill>
          ) : !flowKnown ? (
            <p className="mt-4 text-caption text-text3">
              No follower changes captured for this period yet.
            </p>
          ) : (
            <FollowerFlow followers={followers} networkLabel={PLATFORM_NAMES.facebook} />
          )}
        </AnalyticsSection>
      </div>

      <div className="mt-7">
        <AnalyticsSection
          title="The posts that did it"
          sub="Every post published this period, ranked by interactions — reactions, comments and shares together."
          ariaLabel="Posts this period"
        >
          {!hasHistory ? (
            <EmptyFill className="mt-3.5">Posts join this table after the first sync</EmptyFill>
          ) : (
            <FacebookPostsTable posts={data.posts} medianInteractions={data.medianInteractions} />
          )}
        </AnalyticsSection>
      </div>

      <div className="mt-7 print:hidden">
        <AnalyticsSection
          title="Report archive"
          sub="Exported periods, kept exactly as they were written."
          ariaLabel="Report archive"
        >
          <ReportArchive
            entries={archive}
            clientId={clientId}
            timezone={timezone}
            network={network}
          />
        </AnalyticsSection>
      </div>

      <SyncLine
        lastSyncAt={lastSyncAt}
        hasHistory={hasHistory}
        hasConnection={hasConnection}
        timezone={timezone}
        syncError={syncError}
        networkLabel={PLATFORM_NAMES.facebook}
      />
    </div>
  )
}
