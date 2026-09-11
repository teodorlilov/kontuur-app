import type { RosterChannel } from '@/features/clients/lib/roster'
import { PLATFORM_MARKS, PLATFORM_NAMES } from '@/lib/validation'
import { cn } from '@/utils/cn'

/** One chip per network the publish pipeline can reach; the column is 116px, hence marks. */
const STATE_CLASSES: Record<RosterChannel['state'], string> = {
  connected: 'border-line2 bg-surface text-text2',
  // Dashed marks "not solid yet" in both directions; forest keeps it a warning
  // rather than a failure, since the account still publishes today.
  expiring: 'border-dashed border-forest bg-surface text-forest',
  missing: 'border-dashed border-line2 bg-surface text-text3 opacity-50',
  retired: 'border-dashed border-danger bg-danger-bg text-danger',
}

function describe(channel: RosterChannel): string {
  const name = PLATFORM_NAMES[channel.platform]
  if (channel.state === 'retired') return `${name}: disconnected by ${name} — reconnect needed`
  if (channel.state === 'missing') return `${name}: not connected`
  if (channel.state === 'expiring') {
    const days = channel.expiresInDays
    return `${name}: connection expires in ${days} ${days === 1 ? 'day' : 'days'}`
  }
  return `${name}: connected${channel.accountName ? ` as ${channel.accountName}` : ''}`
}

/** A client's connected platforms, each chip carrying its state in the title. */
export function ChannelChips({ channels }: { channels: RosterChannel[] }) {
  return (
    <ul className="flex list-none gap-1.5">
      {channels.map((channel) => (
        <li key={channel.platform}>
          {/* The state is carried by the title, not by colour alone. */}
          <span
            title={describe(channel)}
            className={cn(
              'inline-flex h-[22px] min-w-[27px] items-center justify-center rounded-xs border px-[7px]',
              'text-label font-semibold',
              STATE_CLASSES[channel.state]
            )}
          >
            <span aria-hidden="true">{PLATFORM_MARKS[channel.platform]}</span>
            <span className="sr-only">{describe(channel)}</span>
          </span>
        </li>
      ))}
    </ul>
  )
}
