import { SquareTopUpIcon } from '@solar-icons/react/linear'
import { Icon } from '@/components/ui/icon'
import { StatusPill } from '@/components/ui/status-pill'
import { PLATFORM_NAMES } from '@/lib/meta/platforms'
import { toSourceHost } from '@/utils/url'
import type { BriefingItem } from '@/ai/intelligence/schema'

/**
 * The week's changes as rows: network, headline, source. Rendered inside the bar's client leaf,
 * so it imports nothing server-only.
 *
 * The network cell has a fixed width because "Instagram" and "Facebook" are not the same length
 * and every headline should start on the same line — the one arbitrary value here. The pill is
 * the app's rounded one rather than the roster's square two-letter mark: the user rejected
 * squares in this panel. The headline sits in Deep Pine, the ink the bar's wash panel already
 * used; a tint takes a solid ink (DESIGN.md, Legible Tint Rule).
 */
export function BriefingUpdates({ items }: { items: BriefingItem[] }) {
  return (
    <ul className="divide-y divide-forest/10">
      {items.map((item) => (
        <li key={item.source_url} className="flex min-h-10 items-center gap-3 py-2">
          <span className="w-[84px] shrink-0">
            <StatusPill tone="neutral">{PLATFORM_NAMES[item.network]}</StatusPill>
          </span>
          <span className="min-w-0 flex-1 text-body font-medium text-forest">{item.title}</span>
          <a
            href={item.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-1.5 text-caption text-text3 hover:text-forest"
          >
            {toSourceHost(item.source_url)}
            <Icon glyph={SquareTopUpIcon} size="xs" />
          </a>
        </li>
      ))}
    </ul>
  )
}
