import { Avatar } from '@/components/ui/avatar'
import { ActionLink } from '@/components/ui/action-link'
import { Card } from '@/components/ui/card'
import type { AnalyticsReportData } from '../lib/build-report'
import { formatCount, formatDayMonth, formatPeriodRange, formatShortRange } from '../lib/format'
import { AnalyticsSection, ChartLegend } from './analytics-section'
import { AudienceSection } from './audience-section'
import { AutoFill } from './auto-fill'
import { ComparisonRows } from './comparison-rows'
import { EmptyFill } from './empty-fill'
import { FillingDocument } from './filling-document'
import { InteractionMultiples } from './interaction-multiples'
import { NarrativeBlock } from './narrative-block'
import { PostsTable } from './posts-table'
import { ReachTrend } from './reach-trend'
import { ReportArchive, type ArchiveEntry } from './report-archive'
import { SummaryStrip } from './summary-strip'
import { SyncLine } from './sync-line'

interface AnalyticsViewProps {
  data: AnalyticsReportData
  narrative: string | null
  /** True when the narrative is an exported report's stored wording. */
  narrativeArchived: boolean
  /** Days of this window never asked of Meta — triggers the automatic fill. */
  unfilledDays: number
  clientId: string
  clientName: string
  /** The connected IG handle, when one exists. */
  handle: string | null
  hasConnection: boolean
  timezone: string
  archive: ArchiveEntry[]
}

function firstLine(caption: string): string {
  return caption.split('\n')[0]!.trim()
}

function signed(value: number): string {
  return `${value >= 0 ? '+' : '−'}${formatCount(Math.abs(value))}`
}

/**
 * The comparison console: one document in presentation order, no tabs, every
 * number read against the previous period. Print produces the client report —
 * the operator chrome lives in the page header, outside this tree.
 */
export function AnalyticsView({
  data,
  narrative,
  narrativeArchived,
  unfilledDays,
  clientId,
  clientName,
  handle,
  hasConnection,
  timezone,
  archive,
}: AnalyticsViewProps) {
  const { hasHistory, followers } = data
  const flowKnown = followers.gained.now !== null || followers.lost.now !== null
  const filling = hasConnection && unfilledDays > 0

  const masthead = (
    <header className="flex flex-wrap items-end justify-between gap-6 pb-5">
      <div>
        <div className="flex items-center gap-2.5">
          <Avatar name={clientName} size="sm" />
          <span className="text-title text-ink">{clientName}</span>
          {handle && <span className="text-micro text-text3">Instagram · @{handle}</span>}
        </div>
        {/* The sticky page header carries the screen title; print has no header. */}
        <h2 className="mt-2 hidden text-headline text-ink print:block">Analytics</h2>
        <p className="mt-2 text-body text-text2">
          <strong className="font-medium text-ink">
            {formatPeriodRange(data.period.start, data.period.end)}
          </strong>{' '}
          <span className="text-text3">against</span>{' '}
          {formatShortRange(data.period.prevStart, data.period.prevEnd)}
        </p>
      </div>
    </header>
  )

  // Nothing partial: while this window still pulls from Instagram, the page
  // holds the report's silhouette instead of numbers that are about to change.
  if (filling) {
    return (
      <div id="analytics-print-area">
        <AutoFill clientId={clientId} period={data.period} unfilledDays={unfilledDays} />
        {masthead}
        <FillingDocument unfilledDays={unfilledDays} />
        <SyncLine
          lastSyncAt={data.lastSyncAt}
          hasHistory={hasHistory}
          hasConnection={hasConnection}
          timezone={timezone}
        />
      </div>
    )
  }

  return (
    <div id="analytics-print-area">
      {masthead}

      <NarrativeBlock narrative={narrative} archived={narrativeArchived} hasHistory={hasHistory} />

      <SummaryStrip data={data} />

      <div className="mt-7">
        <AnalyticsSection
          title="Reach, day by day"
          sub="Each day against the same day of the previous period."
          ariaLabel="Reach, day by day"
          legend={
            <ChartLegend
              items={[
                { swatch: 'now', label: 'This period' },
                { swatch: 'then', label: 'Previous' },
              ]}
            />
          }
        >
          {hasHistory ? (
            <>
              <ReachTrend days={data.reachByDay} bestDay={data.bestDay} />
              {data.bestDay && (
                <p className="mt-3.5 inline-flex flex-wrap items-center gap-1.5 rounded-panel bg-wash px-2.5 py-1.5 text-micro font-medium text-forest">
                  Best day:{' '}
                  <b className="font-semibold tabular-nums">
                    {formatDayMonth(data.bestDay.date)} — {formatCount(data.bestDay.reach)} accounts
                  </b>
                  {data.bestDay.caption && <>· “{firstLine(data.bestDay.caption)}”</>}
                </p>
              )}
            </>
          ) : (
            <EmptyFill className="mt-3.5 min-h-60">
              Day one builds tonight — reach appears here after the 03:30 sync
            </EmptyFill>
          )}
        </AnalyticsSection>
      </div>

      <div className="mt-7 grid gap-7 md:grid-cols-2">
        {/* The mock drew views by follower type here; the live probe proved the
            API has no such breakdown (breakdown=follower_type does not exist).
            The follows/unfollows split is the story the stored data can tell. */}
        <AnalyticsSection
          title="Who followed, who left"
          sub="Follows gained and lost, against last period."
          ariaLabel="Follower flow"
          legend={
            <ChartLegend
              items={[
                { swatch: 'now', label: 'This period' },
                { swatch: 'then', label: 'Previous' },
              ]}
            />
          }
        >
          {!hasHistory ? (
            <EmptyFill className="mt-3.5">Follower flow appears after the first sync</EmptyFill>
          ) : !flowKnown ? (
            <p className="mt-4 text-caption text-text3">
              Instagram reports the gained-and-lost split once an account passes about 100
              followers.
            </p>
          ) : (
            <>
              <ComparisonRows
                ariaLabel={`Bar chart. Followers gained ${
                  followers.gained.now === null ? 'unknown' : formatCount(followers.gained.now)
                } this period versus ${
                  followers.gained.then === null ? 'unknown' : formatCount(followers.gained.then)
                } last period. Lost ${
                  followers.lost.now === null ? 'unknown' : formatCount(followers.lost.now)
                } versus ${
                  followers.lost.then === null ? 'unknown' : formatCount(followers.lost.then)
                }.`}
                rows={[
                  {
                    key: 'gained',
                    label: 'Gained',
                    now: followers.gained.now,
                    then: followers.gained.then,
                  },
                  {
                    key: 'lost',
                    label: 'Lost',
                    now: followers.lost.now,
                    then: followers.lost.then,
                  },
                ]}
              />
              {followers.net.now !== null && (
                <p className="mt-3.5 text-caption text-text2">
                  Net <span className="tabular-nums">{signed(followers.net.now)}</span> this period
                  {followers.net.then !== null && (
                    <>
                      {' '}
                      · <span className="tabular-nums">{signed(followers.net.then)}</span> last
                      period
                    </>
                  )}
                  .
                </p>
              )}
            </>
          )}
        </AnalyticsSection>

        <AnalyticsSection
          title="What each format earned"
          sub="Reach by format, against last period."
          ariaLabel="Reach by format"
          legend={
            <ChartLegend
              items={[
                { swatch: 'now', label: 'This period' },
                { swatch: 'then', label: 'Previous' },
              ]}
            />
          }
        >
          {!hasHistory ? (
            <EmptyFill className="mt-3.5">Format comparison appears after the first sync</EmptyFill>
          ) : data.formats.length === 0 ? (
            <p className="mt-4 text-caption text-text3">
              No format breakdown captured for this period yet.
            </p>
          ) : (
            <ComparisonRows
              ariaLabel={`Bar chart. ${data.formats
                .map(
                  (row) =>
                    `${row.label} reached ${row.now === null ? 'unknown' : formatCount(row.now)} accounts this period versus ${
                      row.then === null ? 'unknown' : formatCount(row.then)
                    } last period`
                )
                .join('. ')}.`}
              rows={data.formats}
            />
          )}
        </AnalyticsSection>
      </div>

      <div className="mt-7">
        <AnalyticsSection
          title="What people did"
          sub="Each interaction, this period beside the last."
          ariaLabel="Interactions"
          legend={
            <ChartLegend
              items={[
                { swatch: 'then-block', label: 'Previous' },
                { swatch: 'now-block', label: 'This period' },
              ]}
            />
          }
        >
          {hasHistory ? (
            <InteractionMultiples kinds={data.interactionKinds} />
          ) : (
            <EmptyFill className="mt-3.5">
              Interaction detail appears after the first sync
            </EmptyFill>
          )}
        </AnalyticsSection>
      </div>

      <div className="mt-7 grid gap-7 md:grid-cols-2">
        <AnalyticsSection
          title="What the profile converted"
          sub={
            hasHistory && data.tapButtons.length > 0 && data.profileViews.now !== null
              ? `${formatCount(data.profileViews.now)} profile views became these taps.`
              : 'Taps on the profile’s link and contact buttons — the closest thing Instagram counts to a conversion.'
          }
          ariaLabel="Profile actions"
          legend={
            hasHistory && data.tapButtons.length > 0 ? (
              <ChartLegend
                items={[
                  { swatch: 'now', label: 'This period' },
                  { swatch: 'then', label: 'Previous' },
                ]}
              />
            ) : undefined
          }
        >
          {!hasHistory ? (
            <EmptyFill className="mt-3.5">Tap detail appears after the first sync</EmptyFill>
          ) : data.tapButtons.length === 0 ? (
            // A measured zero, not an absence — a sunken well, never the hatch.
            <div className="mt-3.5 grid min-h-28 place-items-center rounded-panel bg-sunken p-5 text-center">
              <div>
                <div className="text-metric tabular-nums text-text2">0</div>
                <p className="mx-auto mt-1 max-w-[38ch] text-caption text-text3">
                  {data.profileViews.now !== null && data.profileViews.now > 0
                    ? `${formatCount(data.profileViews.now)} profile views this period, but none tapped the website link or a contact button.`
                    : 'No taps on the website link or contact buttons this period.'}
                </p>
              </div>
            </div>
          ) : (
            <ComparisonRows
              ariaLabel={`Bar chart of link taps by button. ${data.tapButtons
                .map(
                  (row) =>
                    `${row.label} ${row.now === null ? 'unknown' : formatCount(row.now)}, was ${
                      row.then === null ? 'unknown' : formatCount(row.then)
                    }`
                )
                .join('. ')}.`}
              rows={data.tapButtons}
            />
          )}
        </AnalyticsSection>

        <AnalyticsSection
          title="Who follows, who engages"
          sub="How your followers compare with the people who actually engaged this period."
          ariaLabel="Audience"
          legend={
            <ChartLegend
              items={[
                { swatch: 'dot-now', label: 'Followers' },
                { swatch: 'dot-second', label: 'Engaged' },
                // The tick only draws when an older snapshot exists to compare against.
                ...(data.audience?.ages.some((band) => band.prevFollowerPct !== null)
                  ? ([{ swatch: 'tick', label: 'Previous share' }] as const)
                  : []),
              ]}
            />
          }
        >
          {!hasHistory ? (
            <EmptyFill className="mt-3.5">
              Audience snapshots begin with the first weekly sync
            </EmptyFill>
          ) : data.audience === null ? (
            <p className="mt-4 text-caption text-text3">
              {data.hasAudienceSnapshot
                ? 'Instagram shares audience demographics once an account passes about 100 followers — snapshots begin then.'
                : 'No audience snapshot covers this window — demographics are captured weekly from the first sync onward, so older periods may predate them.'}
            </p>
          ) : (
            <AudienceSection audience={data.audience} />
          )}
        </AnalyticsSection>
      </div>

      <div className="mt-7">
        <AnalyticsSection
          title="The posts that did it"
          sub={
            <>
              Every post published this period, ranked by reach.{' '}
              <em className="font-display italic">Follows</em> is people who followed because of
              that post.
            </>
          }
          ariaLabel="The period's posts"
        >
          {hasHistory ? (
            <PostsTable posts={data.posts} medianReach={data.medianReach} />
          ) : (
            <EmptyFill className="mt-3.5 min-h-36">
              Published posts join this table as their first metrics arrive
            </EmptyFill>
          )}
        </AnalyticsSection>
      </div>

      <div className="mt-7">
        <AnalyticsSection
          title="Report archive"
          sub="Every exported period, kept as it was written."
          ariaLabel="Report archive"
        >
          {hasHistory || archive.length > 0 ? (
            <ReportArchive entries={archive} clientId={clientId} timezone={timezone} />
          ) : (
            <p className="mt-2 text-caption text-text3">
              Your first report lands here once a full period has been collected.
            </p>
          )}
        </AnalyticsSection>
      </div>

      <SyncLine
        lastSyncAt={data.lastSyncAt}
        hasHistory={hasHistory}
        hasConnection={hasConnection}
        timezone={timezone}
      />
    </div>
  )
}

/** The pre-connection state: the document cannot start until Instagram can. */
export function ConnectPrompt({ clientId, clientName }: { clientId: string; clientName: string }) {
  return (
    <Card className="mx-auto mt-10 max-w-lg px-8 py-10 text-center">
      <h2 className="text-title text-ink">Connect Instagram for {clientName}</h2>
      <p className="mx-auto mt-2 max-w-[44ch] text-caption text-text2">
        Once the account is connected, metrics sync nightly at 03:30 and this page becomes the
        client report — every number read against the period before it.
      </p>
      <div className="mt-5 flex justify-center">
        <ActionLink href={`/clients/${clientId}`} variant="primary">
          Open client settings
        </ActionLink>
      </div>
    </Card>
  )
}
