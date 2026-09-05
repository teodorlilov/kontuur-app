import Link from 'next/link'
import { AlertTriangle, Send } from 'lucide-react'
import { cn } from '@/utils/cn'
import { StatCard } from '@/features/dashboard/components/stat-card'
import { formatPublishSlot } from '@/utils/date-helpers'
import type { FailedPublish, UpcomingPublish } from '@/features/dashboard/types'

interface NextUpCardProps {
  upcoming: UpcomingPublish[]
  failed: FailedPublish[]
  connectedClientCount: number
  clientCount: number
  timezone: string
}

/** One publish, as the cron will attempt it. */
function PublishRow({
  clientName,
  slot,
  isToday,
  tone = 'default',
}: {
  clientName: string
  slot: string
  isToday?: boolean
  tone?: 'default' | 'danger'
}) {
  return (
    <li className="flex items-baseline justify-between gap-3 py-[5px]">
      <span className="flex min-w-0 items-baseline gap-1.5">
        {/* Today. Living Green, not lime — this card is light, and at 5px lime
            measures 1.35:1 and is simply not there. See The Small Present Rule. */}
        {isToday && <span aria-hidden className="size-[5px] shrink-0 rounded-full bg-spring" />}
        <span className="truncate text-body font-medium text-ink">{clientName}</span>
      </span>
      <span
        className={cn(
          'shrink-0 text-caption tabular-nums',
          tone === 'danger' ? 'text-danger' : 'text-text2'
        )}
      >
        {slot}
      </span>
    </li>
  )
}

/**
 * What the autonomous loop is about to do — or just failed to do.
 *
 * The card is state-driven with a strict precedence: a publish that did not
 * ship outranks one that will, because the first needs a human and the second
 * does not.
 */
export function NextUpCard({
  upcoming,
  failed,
  connectedClientCount,
  clientCount,
  timezone,
}: NextUpCardProps) {
  if (failed.length > 0) {
    return (
      <StatCard
        label="Failed to publish"
        icon={<AlertTriangle size={16} />}
        pill={{ text: 'Needs a human', tone: 'danger' }}
        footer={
          <Link href="/calendar" className="text-forest underline-offset-2 hover:underline">
            Open calendar
          </Link>
        }
      >
        <ul className="mt-1.5 divide-y divide-line">
          {failed.map((post) => (
            <PublishRow
              key={post.id}
              clientName={post.clientName}
              tone="danger"
              slot={
                post.scheduledAt
                  ? formatPublishSlot(post.scheduledAt, timezone).label
                  : 'No time set'
              }
            />
          ))}
        </ul>
      </StatCard>
    )
  }

  if (upcoming.length > 0) {
    return (
      <StatCard
        label="Going out next"
        icon={<Send size={16} />}
        footer={
          <Link href="/calendar" className="text-forest underline-offset-2 hover:underline">
            Open calendar
          </Link>
        }
      >
        <ul className="mt-1.5 divide-y divide-line">
          {upcoming.map((post) => {
            const { label, isToday } = formatPublishSlot(post.scheduledAt, timezone)
            return (
              <PublishRow
                key={post.id}
                clientName={post.clientName}
                slot={label}
                isToday={isToday}
              />
            )
          })}
        </ul>
      </StatCard>
    )
  }

  // Nothing is queued. Say why, and offer the step that fixes it.
  const unconnected = clientCount - connectedClientCount
  if (clientCount > 0 && unconnected > 0) {
    return (
      <StatCard
        label="Going out next"
        icon={<Send size={16} />}
        pill={{ text: 'Nothing queued', tone: 'attention' }}
        footer={
          <Link href="/clients" className="text-forest underline-offset-2 hover:underline">
            Connect accounts
          </Link>
        }
      >
        <p className="mt-1.5 text-body leading-relaxed text-text2">
          {unconnected === 1
            ? '1 client has no account connected, so nothing can publish for them.'
            : `${unconnected} clients have no account connected, so nothing can publish for them.`}
        </p>
      </StatCard>
    )
  }

  return (
    <StatCard
      label="Going out next"
      icon={<Send size={16} />}
      pill={{ text: 'Nothing queued', tone: 'muted' }}
      footer={
        <Link href="/generate" className="text-forest underline-offset-2 hover:underline">
          Generate posts
        </Link>
      }
    >
      <p className="mt-1.5 text-body leading-relaxed text-text2">
        Nothing is scheduled. Approved posts publish automatically once they have a date.
      </p>
    </StatCard>
  )
}
