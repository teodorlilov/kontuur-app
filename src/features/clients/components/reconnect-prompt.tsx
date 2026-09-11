'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { ConnectLink, ServiceTile } from '@/components/ui/service-row'
import { StatusPill } from '@/components/ui/status-pill'
import { PLATFORM_MARKS } from '@/lib/meta/platforms'
import { pluralise } from '@/utils/format'
import type { RetiredConnectionCard } from '../lib/retired-connections'

const SEEN_PREFIX = 'reconnect-prompt-seen:'

function buildSeenKey(card: RetiredConnectionCard): string {
  return `${SEEN_PREFIX}${card.clientId}:${card.platform}:${card.retiredAt}`
}

/** Cards this browser has not been shown. The server returns all; Radix mounts the dialog client-side. */
function filterUnseen(cards: RetiredConnectionCard[]): RetiredConnectionCard[] {
  if (typeof window === 'undefined') return cards
  return cards.filter((card) => window.localStorage.getItem(buildSeenKey(card)) === null)
}

function rememberSeen(card: RetiredConnectionCard): void {
  window.localStorage.setItem(buildSeenKey(card), '1')
}

/**
 * The one-time prompt for a connection Meta has killed. State holds only dismissals; the card
 * is derived from props each render because the layout stays mounted and hands it new cards.
 * Only "Not now" is remembered: Reconnect succeeds by clearing the row, and an interrupted
 * OAuth must bring the prompt back. Hidden while the Facebook Page chooser (`?choose_page`) is
 * open, which happens before that row clears.
 */
export function ReconnectPrompt({ cards }: { cards: RetiredConnectionCard[] }) {
  const [closed, setClosed] = useState<string[]>([])
  const choosingPage = useSearchParams().has('choose_page')
  const card = filterUnseen(cards).find((c) => !closed.includes(buildSeenKey(c)))
  if (!card || choosingPage) return null

  const closeForNow = () => setClosed((keys) => [...keys, buildSeenKey(card)])
  const dismiss = () => {
    rememberSeen(card)
    closeForNow()
  }

  return (
    <Modal
      open
      onClose={closeForNow}
      title={`${card.networkLabel} needs reconnecting`}
      maxWidth={600}
    >
      <div className="flex flex-col gap-6">
        <div className="flex items-center gap-3">
          <ServiceTile>{PLATFORM_MARKS[card.platform]}</ServiceTile>
          <div className="min-w-0 flex-1">
            <b className="block text-body font-semibold text-ink">{card.clientName}</b>
            <span className="block text-caption text-text3">@{card.accountName}</span>
          </div>
          <StatusPill tone="bad">Disconnected by {card.networkLabel}</StatusPill>
        </div>

        <p className="text-body text-text2">
          {card.networkLabel} ended this login on {card.retiredOnLabel}. That happens when the
          account&rsquo;s password changes or Meta resets the session for security &mdash; nothing
          in Kontuur changed. Until it&rsquo;s reconnected, Kontuur can&rsquo;t post to this account
          or read its analytics.
        </p>

        <dl className="flex flex-col divide-y divide-line rounded-panel border border-line">
          {card.scheduledCount > 0 && (
            <div className="flex items-baseline gap-4 px-4 py-3.5">
              <dt className="w-20 flex-none text-label font-semibold uppercase text-text3">
                Publishing
              </dt>
              <dd className="text-body text-ink">
                {pluralise(card.scheduledCount, 'scheduled post')} will fail
                {card.nextSlotLabel && (
                  <span className="mt-0.5 block text-caption text-text3">
                    Next one {card.nextSlotLabel}
                  </span>
                )}
              </dd>
            </div>
          )}
          <div className="flex items-baseline gap-4 px-4 py-3.5">
            <dt className="w-20 flex-none text-label font-semibold uppercase text-text3">
              Analytics
            </dt>
            <dd className="text-body text-ink">
              Stopped on {card.retiredOnLabel}
              <span className="mt-0.5 block text-caption text-text3">
                Fills in again once reconnected
              </span>
            </dd>
          </div>
        </dl>

        <div className="flex items-center gap-1.5">
          <ConnectLink href={card.reconnectHref}>Reconnect {card.networkLabel}</ConnectLink>
          <Button variant="ghost" size="sm" onClick={dismiss}>
            Not now
          </Button>
        </div>
        <p className="-mt-3 text-caption text-text3">
          Takes about a minute &mdash; {card.networkLabel} will ask you to log in. Stays in
          notifications and on the client&rsquo;s row until it&rsquo;s done.
        </p>
      </div>
    </Modal>
  )
}
