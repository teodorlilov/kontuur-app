import { PLATFORM_NAMES } from '@/lib/validation'
import type { FacebookReportData } from '../../lib/facebook/build-facebook-report'
import { AnalyticsSection, ChartLegend } from '../analytics-section'
import { EmptyFill } from '../empty-fill'
import { FacebookPostsTable } from './facebook-posts-table'
import { FollowerFlowSection } from '../follower-flow-section'
import { NarrativeBlock } from '../narrative-block'
import { FillingReport } from '../filling-report'
import { ReportMasthead } from '../report-masthead'
import { ReachTrend, type TrendLabels } from '../reach-trend'
import { ReportArchive } from '../report-archive'
import type { ArchiveEntry } from '../../types'
import { StripCells, countCellSpec, netFollowersCellSpec } from '../summary-strip'
import { SyncLine } from '../sync-line'

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
  /** Days of this window never asked of Meta — triggers the automatic fill. */
  unfilledDays: number
  /** ?partial=1 — the reader asked to see the stored days without waiting. */
  showPartial?: boolean
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
  unfilledDays,
  showPartial = false,
}: FacebookAnalyticsViewProps) {
  const { hasHistory, followers } = data
  const filling = hasConnection && unfilledDays > 0 && !showPartial

  const masthead = (
    <ReportMasthead
      clientName={clientName}
      networkLabel={PLATFORM_NAMES.facebook}
      accountName={pageName}
      period={data.period}
      note={`${PLATFORM_NAMES.facebook} serves no reach, audience or posting-time data for Pages, so this report tells the story it can prove.`}
    />
  )

  const syncLine = (
    <SyncLine
      lastSyncAt={lastSyncAt}
      hasHistory={hasHistory}
      hasConnection={hasConnection}
      timezone={timezone}
      syncError={syncError}
      networkLabel={PLATFORM_NAMES.facebook}
    />
  )

  // The decision lives HERE now, beside Instagram's. It used to sit in the page, which is how
  // the Facebook skeleton lost its masthead and sync line without anyone noticing.
  if (filling) {
    return (
      <FillingReport
        masthead={masthead}
        syncLine={syncLine}
        clientId={clientId}
        period={data.period}
        unfilledDays={unfilledDays}
        network="facebook"
        networkLabel={PLATFORM_NAMES.facebook}
      />
    )
  }

  return (
    <div id="analytics-print-area">
      {masthead}

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
            <ReachTrend
              days={data.engagementByDay}
              bestDay={null}
              labels={ENGAGEMENT_LABELS}
              networkLabel={PLATFORM_NAMES.facebook}
            />
          )}
        </AnalyticsSection>
      </div>

      <div className="mt-7">
        <FollowerFlowSection
          followers={followers}
          hasHistory={hasHistory}
          networkLabel={PLATFORM_NAMES.facebook}
          unknownNote="No follower changes captured for this period yet."
        />
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

      {syncLine}
    </div>
  )
}
