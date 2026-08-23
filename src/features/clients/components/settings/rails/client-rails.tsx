'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { RailBox, RailStat, RailText } from '@/components/ui/form'
import { checkPaletteContrast } from '@/lib/visual/contrast'
import { formatRelativeTime, parseTimestamp } from '@/utils/format'
import { toHostLabel } from '@/utils/url'
import type { Palette } from '@/types/visual'

/**
 * The context boxes beside each client settings panel.
 *
 * Feature-aware, so they live here rather than in `components/ui` — they know about pending
 * counts, connections and pillars. They are built from the generic `RailBox` / `RailStat` shells.
 * Every number is one the page already queried; nothing here is estimated.
 */

interface ClientStatusRailProps {
  lastGeneratedAt: string | null
  pendingCount: number
  sourceCount: number
  publishedCount: number
  connectionCount: number
  onConnectClick: () => void
}

export function ClientStatusRail({
  lastGeneratedAt,
  pendingCount,
  sourceCount,
  publishedCount,
  connectionCount,
  onConnectClick,
}: ClientStatusRailProps) {
  return (
    <>
      <RailBox title="Client status" tone="mark">
        <RailStat
          label="Queue"
          value={
            lastGeneratedAt
              ? `Refreshed ${formatRelativeTime(parseTimestamp(lastGeneratedAt))}`
              : 'Not yet run'
          }
        />
        <RailStat label="Pending review" value={pendingCount} />
        <RailStat label="Sources" value={sourceCount} />
        <RailStat label="Published" value={publishedCount} />
      </RailBox>

      {connectionCount === 0 && (
        <RailBox title="Not connected">
          <RailText>Nothing can publish until an account is linked.</RailText>
          <Button variant="secondary" size="sm" className="mt-3 w-full" onClick={onConnectClick}>
            Connect accounts
          </Button>
        </RailBox>
      )}
    </>
  )
}

interface BrandProfileRailProps {
  pillarCount: number
  /** The URL as stored. Null means nothing to read, and the button says why. */
  savedWebsite: string | null
  /** True while the website field holds an unsaved edit — the read would still use the stored one. */
  websiteEdited: boolean
  onReread: () => void
  rereading: boolean
}

export function BrandProfileRail({
  pillarCount,
  savedWebsite,
  websiteEdited,
  onReread,
  rereading,
}: BrandProfileRailProps) {
  return (
    <>
      <RailBox title="What this affects">
        <RailText>
          Tone and audience are injected into every prompt.{' '}
          {pillarCount > 0
            ? `The ${pillarCount} pillar${pillarCount === 1 ? '' : 's'} below decide the mix of a batch.`
            : 'Without pillars, a batch is not divided by topic.'}
        </RailText>
        <RailText>
          Changes apply to the next run — drafts already in review keep the old profile.
        </RailText>
      </RailBox>

      <RailBox title="Source">
        <RailText>
          {savedWebsite
            ? 'Read the site again and compare what it suggests against this profile. A client set up before the reader improved is usually carrying its services menu as pillars.'
            : 'Add a website on the Basic info panel to draft this profile from the client’s own site.'}
        </RailText>
        {/* Named rather than implied: the read uses the stored address, so an unsaved edit to the
            website field would otherwise silently produce a profile from the previous site. */}
        {savedWebsite && websiteEdited && (
          <RailText>
            Reads {toHostLabel(savedWebsite)} — the edited address applies once you save.
          </RailText>
        )}
        <Button
          variant="secondary"
          size="sm"
          className="mt-3 w-full"
          onClick={onReread}
          loading={rereading}
          disabled={!savedWebsite}
        >
          Re-read website
        </Button>
      </RailBox>
    </>
  )
}

interface VisualIdentityRailProps {
  palette: Palette
  onReanalyze: () => void
  reanalyzing: boolean
}

export function VisualIdentityRail({ palette, onReanalyze, reanalyzing }: VisualIdentityRailProps) {
  const contrast = checkPaletteContrast(palette)

  return (
    <>
      {contrast && !contrast.passes && (
        <RailBox title="Contrast warning">
          <RailText>
            Text at {contrast.ink.toUpperCase()} on {contrast.surface.toUpperCase()} scores{' '}
            {contrast.ratio}:1. Below 4.5:1, captions in generated visuals are hard to read.
          </RailText>
        </RailBox>
      )}

      <RailBox title="Source">
        <RailText>Re-read the brand colours and style from the client&rsquo;s website.</RailText>
        <Button
          variant="secondary"
          size="sm"
          className="mt-3 w-full"
          onClick={onReanalyze}
          loading={reanalyzing}
        >
          Re-analyse website
        </Button>
      </RailBox>

      <RailBox title="Where it applies">
        <RailText>Every AI-generated image and carousel slide for this client.</RailText>
      </RailBox>
    </>
  )
}

export function ScheduleRail({
  isActive,
  connectionCount,
  onConnectClick,
}: {
  isActive: boolean
  connectionCount: number
  onConnectClick: () => void
}) {
  if (!isActive || connectionCount > 0) {
    return (
      <RailBox title="How this runs">
        <RailText>
          {isActive
            ? 'Drafts are generated on schedule and wait in the review queue for approval.'
            : 'Autonomous generation is off. Posts are only created when you run a generation yourself.'}
        </RailText>
      </RailBox>
    )
  }

  return (
    <RailBox title="Heads up" tone="mark">
      <RailText>
        Autonomous generation is on but no account is connected — drafts will pile up in review with
        nowhere to publish.
      </RailText>
      <Button variant="secondary" size="sm" className="mt-3 w-full" onClick={onConnectClick}>
        Connect an account
      </Button>
    </RailBox>
  )
}

export function AccountsRail({
  scheduledCount,
  approvedUnpublishedCount,
  connectionCount,
}: {
  scheduledCount: number
  approvedUnpublishedCount: number
  connectionCount: number
}) {
  return (
    <RailBox title={connectionCount > 0 ? 'Publishing' : 'Blocked by this'}>
      <RailStat label="Scheduled posts" value={scheduledCount} />
      <RailStat label="Approved, unpublished" value={approvedUnpublishedCount} />
      <RailStat label="Analytics" value={connectionCount > 0 ? 'Available' : 'Unavailable'} />
    </RailBox>
  )
}

export function InsightsRail({ sourceCount, clientId }: { sourceCount: number; clientId: string }) {
  return (
    <RailBox title="Research sources">
      <RailStat label="Active" value={sourceCount} />
      <RailText>
        {sourceCount > 0
          ? 'Posts are grounded in what these sources publish.'
          : 'Without sources, posts are written from the brand profile alone.'}
      </RailText>
      <Link
        href={`/clients/${clientId}/sources`}
        className="mt-3 inline-block text-body font-medium text-forest hover:underline"
      >
        Manage sources &rarr;
      </Link>
    </RailBox>
  )
}

export function IdeasRail({ newCount, usedCount }: { newCount: number; usedCount: number }) {
  return (
    <RailBox title="Submissions">
      <RailStat label="New" value={newCount} />
      <RailStat label="Turned into posts" value={usedCount} />
      <RailText>Ideas appear under Client ideas in the sidebar.</RailText>
    </RailBox>
  )
}

/** Opens the delete confirmation. The dialog owns the decision — and its own loading state. */
export function ClientDangerRail({ onDelete }: { onDelete: () => void }) {
  return (
    <RailBox title="Danger zone">
      <RailText>
        Deleting this client removes every post, source, connected account and stored image, along
        with its whole Instagram history and saved reports.
      </RailText>
      <Button variant="danger" size="sm" className="mt-3 w-full" onClick={onDelete}>
        Delete client
      </Button>
    </RailBox>
  )
}
