import { ActionLink } from '@/components/ui/action-link'
import { Card } from '@/components/ui/card'
import { UNITEMISED_FORMATS, type AnalyticsReportData } from '../../lib/instagram/build-report'
import { shiftDateKey } from '@/utils/date-helpers'
import { PLATFORM_NAMES } from '@/lib/validation'
import { formatCount, formatDayMonth } from '../../lib/compute/format'
import { firstLine } from '../../lib/compute/post-display'
import { AnalyticsSection, ChartLegend } from '../document/analytics-section'
import { AudienceSection } from './audience-section'
import { AudienceCapture } from './audience-capture'
import { ComparisonRows } from './comparison-rows'
import { EmptyFill } from '../document/empty-fill'
import { FillingReport } from '../filling/filling-report'
import { FollowerFlowSection } from '../charts/follower-flow-section'
import { FunnelSection } from './funnel-section'
import { NarrativeBlock } from '../document/narrative-block'
import { ReportMasthead } from '../document/report-masthead'
import { PostsTable } from './posts-table'
import { ReachTrend } from '../charts/reach-trend'
import { ReportArchive } from '../document/report-archive'
import type { ArchiveEntry } from '../../types'
import { SummaryStrip } from '../document/summary-strip'
import { SyncLine } from '../document/sync-line'
import { WhenToPost } from './when-to-post'

interface AnalyticsViewProps {
  data: AnalyticsReportData
  narrative: string | null
  /** True when the narrative is an exported report's stored wording. */
  narrativeArchived: boolean
  /** Days of this window never asked of Meta — triggers the automatic fill. */
  unfilledDays: number
  /** ?partial=1 — the reader asked to see the stored days without waiting. */
  showPartial?: boolean
  clientId: string
  clientName: string
  /** The connected IG handle, when one exists. */
  handle: string | null
  hasConnection: boolean
  timezone: string
  /**
   * The last sync ATTEMPT, from the cron's own stamp — clean or not, since this
   * line's copy says which. Deliberately not `data.lastSyncAt`, which only a
   * clean run may date because it decides whether a post reads "removed".
   */
  lastSyncAt: string | null
  /** The last nightly run's verdict — null after a clean one. */
  syncError?: string | null
  archive: ArchiveEntry[]
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
  showPartial = false,
  clientId,
  clientName,
  handle,
  hasConnection,
  timezone,
  lastSyncAt,
  syncError = null,
  archive,
}: AnalyticsViewProps) {
  const { hasHistory, followers } = data
  const filling = hasConnection && unfilledDays > 0 && !showPartial
  // Paid vs organic, from the format-attributed reach — stated side by side,
  // never summed to the period total (accounts can appear in several formats).
  const adReach = data.formats.find((row) => row.key === 'AD')?.now ?? null
  const organicReach = data.formats.some((row) => row.key !== 'AD')
    ? data.formats
        .filter((row) => row.key !== 'AD')
        .reduce<number | null>((sum, row) => (row.now === null ? sum : (sum ?? 0) + row.now), null)
    : null

  const masthead = (
    <ReportMasthead
      clientName={clientName}
      networkLabel={PLATFORM_NAMES.instagram}
      accountName={handle ? `@${handle}` : null}
      period={data.period}
    />
  )

  // Nothing partial: while this window still pulls from Instagram, the page
  // holds the report's silhouette instead of numbers that are about to change.
  if (filling) {
    return (
      <FillingReport
        masthead={masthead}
        syncLine={
          <SyncLine
            lastSyncAt={lastSyncAt}
            hasHistory={hasHistory}
            hasConnection={hasConnection}
            timezone={timezone}
            syncError={syncError}
          />
        }
        clientId={clientId}
        period={data.period}
        unfilledDays={unfilledDays}
      />
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
          sub="How many accounts saw you each day, against the same run of days a period earlier. Both dates sit under every column, and each window's posts are pinned on their own row."
          ariaLabel="Reach, day by day"
          legend={
            <ChartLegend
              items={[
                { swatch: 'now', label: 'This period' },
                { swatch: 'then-dashed', label: 'Previous' },
                ...(data.reachByDay.some((day) => day.posts.length > 0)
                  ? ([{ swatch: 'pin', label: 'Posted' }] as const)
                  : []),
                ...(data.reachByDay.some((day) => day.thenPosts.length > 0)
                  ? ([{ swatch: 'pin-then', label: 'Posted (previous)' }] as const)
                  : []),
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

      <div className="mt-7">
        <AnalyticsSection
          title="From seen to followed"
          sub="How many saw you, how many came to your profile, and what they did there. The last three count actions rather than people — the same visitor can come back, or tap twice — so they read as a rate per 100, not a percentage."
          ariaLabel="Conversion path"
        >
          {hasHistory ? (
            <FunnelSection stages={data.funnel} />
          ) : (
            <EmptyFill className="mt-3.5 min-h-36">
              The conversion path appears after the first sync
            </EmptyFill>
          )}
        </AnalyticsSection>
      </div>

      <div className="mt-7 grid items-start gap-7 md:grid-cols-2">
        {/* The mock drew views by follower type here; the live probe proved the
            API has no such breakdown (breakdown=follower_type does not exist).
            The follows/unfollows split is the story the stored data can tell. */}
        <FollowerFlowSection
          followers={followers}
          hasHistory={hasHistory}
          unknownNote={`${PLATFORM_NAMES.instagram} reports the gained-and-lost split once an account passes about 100 followers.`}
        />

        <AnalyticsSection
          title="What each format earned"
          sub={
            <>
              Which kinds of post reached the most people, against last period. Under each name: how
              many you published, and their engagement rate where enough people were reached to
              judge one.
              {data.formats.some((row) => UNITEMISED_FORMATS.has(row.key)) &&
                ' Instagram reports stories and ads as a group, so those two carry no count.'}
            </>
          }
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
            <>
              <ComparisonRows ariaLabel="Reach by format" rows={data.formats} unit="Reached" />
              {adReach !== null && adReach > 0 && (
                <p className="mt-3.5 text-caption text-text2">
                  Paid placement reached{' '}
                  <span className="tabular-nums">{formatCount(adReach)}</span>
                  {organicReach !== null && (
                    <>
                      {' '}
                      · organic formats{' '}
                      <span className="tabular-nums">{formatCount(organicReach)}</span> combined
                    </>
                  )}
                  <span className="text-text3">
                    {' '}
                    — the same account can appear in more than one format.
                  </span>
                </p>
              )}
            </>
          )}
        </AnalyticsSection>
      </div>

      {/* Two bar-row lists of the same family, side by side. items-start on
          purpose: a three-row card must not stretch to a six-row neighbour's
          height — the empty half reads as missing data. */}
      <div className="mt-7 grid items-start gap-7 md:grid-cols-2">
        <AnalyticsSection
          title="What people did"
          sub="Every kind of interaction your posts earned, against last period."
          ariaLabel="Interactions"
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
            <ComparisonRows
              ariaLabel="Interactions by kind"
              rows={data.interactionKinds}
              unit="Count"
            />
          ) : (
            <EmptyFill className="mt-3.5">
              Interaction detail appears after the first sync
            </EmptyFill>
          )}
        </AnalyticsSection>

        <AnalyticsSection
          title="What visitors tapped"
          sub={
            hasHistory && data.tapButtons.length > 0 && data.profileViews.now !== null
              ? `${formatCount(data.profileViews.now)} profile visits became these taps.`
              : 'Taps on your bio link and contact buttons — the nearest thing Instagram counts as someone acting on your profile.'
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
                    ? `${formatCount(data.profileViews.now)} profile visits this period, but none tapped the website link or a contact button.`
                    : 'No taps on the website link or contact buttons this period.'}
                </p>
              </div>
            </div>
          ) : (
            <ComparisonRows ariaLabel="Link taps by button" rows={data.tapButtons} unit="Taps" />
          )}
        </AnalyticsSection>
      </div>

      {/* Full width on purpose: the age columns and the places/gender lists sit
          side by side inside this card, which needs the whole measure to keep
          seven band labels legible. */}
      <div className="mt-7">
        <AnalyticsSection
          title="Who follows, who engages"
          // The windows are Instagram's, not ours: follower demographics come
          // back on `this_month` and engaged demographics on `last_90_days`
          // (insights.ts DEMOGRAPHIC_TIMEFRAME). Saying "this period" claimed a
          // responsiveness to the filter that this panel has never had.
          sub="Your follower mix this month against who engaged over the last 90 days — Instagram fixes both windows, so this panel alone does not follow the period filter."
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
            data.hasAudienceSnapshot ? (
              <p className="mt-4 text-caption text-text3">
                Instagram shares audience demographics once an account passes about 100 followers —
                snapshots begin then.
              </p>
            ) : hasConnection ? (
              // No snapshot stored and an account to ask: fetch one now rather
              // than making the reader wait for the nightly sync.
              <AudienceCapture clientId={clientId} period={data.period} />
            ) : (
              <p className="mt-4 text-caption text-text3">
                No audience snapshot exists yet — connect Instagram to capture one.
              </p>
            )
          ) : (
            <>
              {/* A snapshot dated past end+1 is the fallback picture — say so. */}
              {data.audience.snapshotDate > shiftDateKey(data.period.end, 1) && (
                <p className="mt-2 text-micro text-text3">
                  Audience as of {formatDayMonth(data.audience.snapshotDate)} — the earliest
                  snapshot postdates this window.
                </p>
              )}
              <AudienceSection audience={data.audience} />
            </>
          )}
        </AnalyticsSection>
      </div>

      <div className="mt-7">
        <AnalyticsSection
          title="When to post"
          sub="The hours your followers are actually online, and what your posts earned in each part of the day."
          ariaLabel="When to post"
        >
          {hasHistory ? (
            <WhenToPost online={data.audienceOnline} windows={data.publishWindows} />
          ) : (
            <EmptyFill className="mt-3.5 min-h-28">
              Posting-time signals appear after the first syncs
            </EmptyFill>
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
        lastSyncAt={lastSyncAt}
        hasHistory={hasHistory}
        hasConnection={hasConnection}
        timezone={timezone}
        syncError={syncError}
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
