'use client'

import type { CSSProperties, ReactNode } from 'react'
import { cn } from '@/utils/cn'
import { getClientTone } from '@/components/ui/colors/identity-colors'
import { extractInitials } from '@/utils/format'

/**
 * The shell every card in a day lane fills: a monogram and a time on one row, then
 * whatever the item wants to say beneath.
 *
 * A scheduled post and an empty slot are visual siblings — same width, same header row,
 * same focus ring, same radius — and the only thing that differs is the body and the
 * surface. Building the second as a copy of the first with three classes changed is how
 * the calendar's unscheduled row drifted from the review queue's; this is the same
 * object twice by construction instead.
 */

/**
 * The ground a lane item sits on.
 *
 * Deliberately **visual** names rather than statuses: `PostCard` maps a post's status
 * onto one of these, so the shell never grows a second status vocabulary beside
 * `POST_STATUS_CHIP`. It also replaces the `className` overrides the card used to pass
 * in, which could not have set the identity ground anyway — an inline style beats a
 * utility class, so a status tint handed down as a class would have lost silently.
 */
export type LaneGround = 'identity' | 'ghost' | 'missed' | 'wash' | 'danger'

const GROUND_CLASS: Record<LaneGround, string> = {
  /**
   * The client's own hue, carrying darkened ink — DESIGN.md § Client Identity's one
   * sanctioned rendering, at card scale. A white card in a white lane separates by
   * 1.05:1, so tone cannot do this job here; the identity hue both gives the card an
   * edge and answers "whose post is this" without being read.
   */
  identity:
    'border-[var(--lane-edge)] bg-[var(--lane-bg)] hover:border-[var(--lane-edge-strong)] hover:bg-[var(--lane-bg-strong)]',
  // --hatch is the token DESIGN.md reserves for absence. Dashed, because an open slot
  // is an outline of something rather than a thing.
  ghost: 'slot-open border-dashed border-line2 hover:border-forest hover:bg-wash',
  // Solid-edged and Amber: the time has passed, so this is a record of a gap rather
  // than an invitation. Not a hover target — there is nothing to do. The edge carries
  // it, because Amber Background is 1.04:1 against Surface and states nothing alone.
  missed: 'cursor-default border-pending/[0.45] bg-pending-bg',
  // It happened; it recedes. No edge, because a published post is a record rather
  // than a thing still to do.
  wash: 'border-transparent bg-wash hover:bg-marker',
  // A clay outline all the way round, not a rail down one side: the card already
  // carries the tint, the ink and the reason in words.
  danger: 'border-danger/[0.55] bg-danger-bg hover:bg-danger/[0.1]',
}

export function LaneItem({
  clientName,
  time,
  ground = 'identity',
  onClick,
  ariaLabel,
  children,
  className,
}: {
  clientName: string
  /** Already formatted in the agency zone by the caller — this is presentation only. */
  time: string
  ground?: LaneGround
  onClick?: () => void
  ariaLabel: string
  children: ReactNode
  className?: string
}) {
  const tone = getClientTone(clientName)

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      // Every lane item is a cell in the week grid's 2-D keyboard model. The marker
      // sits on the button because that is the thing that can take focus.
      data-grid-cell
      // Custom properties rather than a `background` — a hover state cannot be
      // expressed as an inline style, and an inline style would outrank the hover
      // class besides. The values are hashed off the client's name, so they are
      // genuinely computed and not a palette that should have been a class.
      style={
        ground === 'identity'
          ? ({
              '--lane-bg': tone.tint(12),
              '--lane-bg-strong': tone.tint(20),
              '--lane-edge': tone.tint(34),
              '--lane-edge-strong': tone.tint(52),
            } as CSSProperties)
          : undefined
      }
      className={cn(
        'group flex w-full flex-none flex-col gap-1 rounded-chip border px-2 py-1.5 text-left',
        'transition-colors duration-150 ease-contour',
        'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-spring',
        GROUND_CLASS[ground],
        className
      )}
    >
      <span className="flex items-center gap-1.5">
        <span
          className="flex-none rounded-xs px-1 py-px text-label font-semibold tracking-normal"
          // A step above whatever ground it sits on, so the monogram stays a mark and
          // does not dissolve into an identity-tinted card of the same hue.
          style={{ background: tone.tint(30), color: tone.text }}
        >
          {extractInitials(clientName)}
        </span>
        <span className="ml-auto text-micro font-medium tabular-nums text-text2">{time}</span>
      </span>
      {children}
    </button>
  )
}
