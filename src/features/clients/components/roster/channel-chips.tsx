import type { RosterChannel } from '@/features/clients/lib/roster'
import { cn } from '@/utils/cn'

/**
 * Two-letter marks rather than brand glyphs: the column is 116px and the states
 * matter more than the logos. Only Instagram and Facebook appear, because those
 * are the only platforms the publish pipeline supports — a chip for anything
 * else would promise a connection the product cannot make.
 */
const PLATFORM_LABELS: Record<RosterChannel['platform'], string> = {
  instagram: 'IG',
  facebook: 'FB',
}

const PLATFORM_NAMES: Record<RosterChannel['platform'], string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
}

const STATE_CLASSES: Record<RosterChannel['state'], string> = {
  connected: 'border-line2 bg-surface text-text2',
  // Dashed marks "not solid yet" in both directions; forest keeps it a warning
  // rather than a failure, since the account still publishes today.
  expiring: 'border-dashed border-forest bg-surface text-forest',
  missing: 'border-dashed border-line2 bg-surface text-text3 opacity-50',
}

function describe(channel: RosterChannel): string {
  const name = PLATFORM_NAMES[channel.platform]
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
              'text-label-lg font-bold',
              STATE_CLASSES[channel.state]
            )}
          >
            <span aria-hidden="true">{PLATFORM_LABELS[channel.platform]}</span>
            <span className="sr-only">{describe(channel)}</span>
          </span>
        </li>
      ))}
    </ul>
  )
}
