'use client'

import { Chip, ChipGroup } from '@/components/ui/form'
import { ServiceTile } from '@/components/ui/service-row'
import { StatusPill } from '@/components/ui/status-pill'
import { LIVE_PLATFORMS, PLATFORMS, PLATFORM_ACCOUNTS } from '@/utils/constants'

export function PlatformRead({ platform }: { platform: string }) {
  return (
    <>
      <span className="text-ink">{platform || '—'}</span>
      {platform && <StatusPill tone="bad">Not connected</StatusPill>}
    </>
  )
}

/**
 * Which platform publishes, and what still has to happen before it can.
 *
 * Connecting is deliberately *not* possible here. `GET /api/meta/connect` requires an existing
 * `client_id` and verifies ownership of it, and OAuth is a full-page redirect — so a Connect
 * button on an unsaved draft would either fail or throw the draft away. The accounts are listed
 * because knowing publishing is not yet wired up is worth having while you choose; the connecting
 * itself happens on the success screen, once the client exists.
 */
export function PlatformEdit({
  platform,
  onChange,
}: {
  platform: string
  onChange: (platform: string) => void
}) {
  return (
    <div className="w-full">
      <ChipGroup label="Publishing platform">
        {PLATFORMS.map((name) => {
          const supported = LIVE_PLATFORMS.has(name)
          return (
            <Chip
              key={name}
              pressed={supported && platform === name}
              disabled={!supported}
              // No dot: nothing can be connected yet, and a permanently unlit "live" dot would
              // read as a broken connection rather than an absent one.
              onClick={() => onChange(name)}
            >
              {supported ? name : `${name} · soon`}
            </Chip>
          )
        })}
      </ChipGroup>

      <div className="mt-3">
        {PLATFORM_ACCOUNTS.map((account) => (
          <div
            key={account.id}
            className={`flex items-center gap-3 border-t border-line py-3 first:border-t-0 ${
              account.supported ? '' : 'opacity-55'
            }`}
          >
            <ServiceTile>{account.initials}</ServiceTile>
            <div className="min-w-0 flex-1">
              <b className="block text-body font-semibold text-ink">{account.label}</b>
              <span className="text-caption text-text3">{account.note}</span>
            </div>
            {account.supported ? (
              <StatusPill tone="warn">Connect after saving</StatusPill>
            ) : (
              <StatusPill tone="warn">Coming soon</StatusPill>
            )}
          </div>
        ))}
        <p className="mt-3 rounded-panel bg-wash px-4 py-3 text-caption leading-relaxed text-text2">
          Kontuur can draft and schedule without a connected account — it just cannot publish. You
          can connect as soon as this client is saved.
        </p>
      </div>
    </div>
  )
}
