'use client'

import Link from 'next/link'
import { ChipGroup, Chip } from '@/components/ui/form'
import { PLATFORMS, LIVE_PLATFORMS } from '@/utils/constants'
import type { PublishState } from '@/features/generate/lib/run-plan'

interface PlatformGroupProps {
  platform: string
  publishState: PublishState
  clientName: string
  clientId: string
  onChange: (platform: string) => void
}

/**
 * All five platforms generate; only LIVE_PLATFORMS publish. Every chip stays
 * enabled — disabling LinkedIn or TikTok would hide a capability the product
 * has — and the note beneath tells the publishing truth for the choice. An idea
 * no longer locks this: its platform lives on its own brief, so the run's
 * platform stays free for the researched posts alongside.
 */
export function PlatformGroup({
  platform,
  publishState,
  clientName,
  clientId,
  onChange,
}: PlatformGroupProps) {
  return (
    <div className="flex flex-col gap-2">
      <ChipGroup label="Platform">
        {PLATFORMS.map((p) => (
          <Chip
            key={p}
            pressed={p === platform}
            live={LIVE_PLATFORMS.has(p)}
            onClick={() => onChange(p)}
          >
            {p}
          </Chip>
        ))}
      </ChipGroup>
      <p className="text-caption text-text2">
        {publishState.kind === 'connected' && `Kontuur publishes to ${platform} on schedule.`}
        {publishState.kind === 'not_connected' && (
          <>
            {platform} isn’t connected for {clientName} yet — drafts still generate.{' '}
            <Link
              href={`/clients/${clientId}/edit?tab=accounts`}
              className="font-medium text-spring-text hover:underline"
            >
              Connect {platform}
            </Link>
          </>
        )}
        {publishState.kind === 'manual' &&
          `Kontuur writes for ${platform} but doesn’t publish there yet — you’ll copy these out by hand.`}
      </p>
    </div>
  )
}
