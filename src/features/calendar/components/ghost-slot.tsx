'use client'

import { memo } from 'react'
import { isoToDateTimeFields } from '@/utils/date-helpers'
import { LaneItem } from './lane-item'

/**
 * A time this client's stored pattern suggests, that nothing fills.
 *
 * **It says "Suggested", never "best time".** The times come from
 * `brand_profiles.best_time_json`, which is a Claude Haiku response to four profile
 * fields — not Meta data, not engagement history, not evidence about when this audience
 * is online. Claiming otherwise would be asserting proof that does not exist. The
 * honest half of the deficit lives elsewhere: the *count* a client is measured against
 * is `posts_per_week`, which an agency set by hand.
 *
 * A slot in the past keeps its place in Amber rather than disappearing. It is a record
 * that the week went unmet — deleting it would make the calendar look tidier than the
 * month actually was.
 */
export const GhostSlot = memo(function GhostSlot({
  clientName,
  at,
  missed,
  timeZone,
  onClick,
}: {
  clientName: string
  at: string
  missed: boolean
  timeZone: string
  onClick: (slot: { clientName: string; at: string }) => void
}) {
  const { time } = isoToDateTimeFields(at, timeZone)

  return (
    <LaneItem
      clientName={clientName}
      time={time}
      ground={missed ? 'missed' : 'ghost'}
      onClick={missed ? undefined : () => onClick({ clientName, at })}
      ariaLabel={
        missed
          ? `${clientName}, ${time}, a suggested slot that passed unfilled`
          : `${clientName}, ${time}, suggested slot. Place a post`
      }
    >
      <span
        className={missed ? 'text-micro text-pending' : 'text-micro text-text3 group-hover:text-forest'}
      >
        {missed ? 'Passed unfilled' : 'Suggested — place a post'}
      </span>
    </LaneItem>
  )
})
