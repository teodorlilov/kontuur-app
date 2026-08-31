'use client'

import { memo } from 'react'
import { isoToDateTimeFields } from '@/utils/date-helpers'
import { LaneItem } from './lane-item'

/**
 * A time this client's stored pattern suggests, that nothing fills.
 *
 * Every slot behind this is MEASURED: hours Instagram reported this client's followers were online,
 * averaged over the last 28 days. A ghost slot is never drawn from a guess, because the guess was
 * deleted — a model used to invent these for clients with no connected account, and the calendar
 * could not tell the two apart.
 *
 * It still says "Suggested" rather than "best time". Followers being online is evidence about
 * ATTENTION, not about outcome: what a publish window actually earned is a separate measurement.
 * The count a client is measured against is separate again — `posts_per_week`, set by an agency.
 *
 * A slot in the past keeps its place in Amber rather than disappearing. It is a record
 * that the week went unmet — deleting it would make the calendar look tidier than the
 * month actually was.
 */
export const GhostSlot = memo(function GhostSlot({
  clientId,
  clientName,
  at,
  missed,
  timeZone,
  tabIndex,
  onClick,
}: {
  /** Carried through to the click. The lane has always held it; the click used to drop
   *  it and make the handler find the client back by display name. */
  clientId: string
  clientName: string
  at: string
  missed: boolean
  timeZone: string
  /** The week grid's roving tabindex. Ignored on a passed slot, which is not a control. */
  tabIndex?: number
  onClick: (slot: { clientId: string; clientName: string; at: string }) => void
}) {
  const { time } = isoToDateTimeFields(at, timeZone)

  return (
    <LaneItem
      clientName={clientName}
      time={time}
      ground={missed ? 'missed' : 'ghost'}
      tabIndex={tabIndex}
      // A passed slot is a record, not a control. It rendered as a `<button>` with no
      // handler: a tab stop that announced itself and then did nothing when activated.
      onClick={missed ? undefined : () => onClick({ clientId, clientName, at })}
      ariaLabel={
        missed
          ? `${clientName}, ${time}, a suggested slot that passed unfilled`
          : `${clientName}, ${time}, suggested slot. Place a post`
      }
    >
      <span
        className={
          missed ? 'text-micro text-pending' : 'text-micro text-text3 group-hover:text-forest'
        }
      >
        {missed ? 'Passed unfilled' : 'Suggested — place a post'}
      </span>
    </LaneItem>
  )
})
