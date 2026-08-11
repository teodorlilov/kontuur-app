'use client'

import { Check, MessageCircle } from 'lucide-react'
import { formatRelativeTime, parseTimestamp } from '@/utils/format'
import { cn } from '@/utils/cn'
import type { EnrichedNotification } from '@/types/api'

interface NotificationItemProps {
  notification: EnrichedNotification
  onMarkRead: (id: string) => void
  onNavigate: () => void
}

/** Build the title line for a notification. */
function titleForNotification(n: EnrichedNotification): string {
  if (n.type === 'posts_ready') return 'has drafts ready to review'
  if (n.type === 'client_approved_all') return 'approved all posts'
  if (n.type === 'client_feedback') return 'requested changes'
  // Legacy rows without type — derive from message
  if (n.message?.includes('approved')) return 'approved all posts'
  return 'requested changes'
}

/** Build the body line for a notification. */
function bodyForNotification(n: EnrichedNotification): string {
  if (n.type === 'client_approved_all') {
    return n.message ?? 'Posts approved — ready to schedule'
  }
  if (n.type === 'client_feedback' && !n.feedback_text) {
    return n.message ?? 'Changes requested on weekly calendar'
  }
  if (n.type === 'posts_ready') return n.message ?? ''
  // Legacy rows
  return n.message ?? ''
}

/** Extract client name from a notification. */
function clientNameFor(n: EnrichedNotification): string {
  // The client name lives only inside the message, in two shapes depending on who
  // wrote it: "<Client> approved…" from the approval flow, "…ready to review for
  // <Client>" from the generate cron. Parsing it back out is fragile — the row
  // carries client_id and the name should be resolved from that (TECH-DEBT §7.7).
  if (n.message) {
    const leading = n.message.match(/^(.+?)\s+(approved|requested)/)
    if (leading) return leading[1]!
    const trailing = n.message.match(/\bfor\s+(.+)$/)
    if (trailing) return trailing[1]!
  }
  return 'Client'
}

/** Single notification row in the panel. */
export function NotificationItem({
  notification: n,
  onMarkRead,
  onNavigate,
}: NotificationItemProps) {
  // A generation notice is neither an approval nor a change request; it gets the
  // neutral marker rather than falling through to the change-request styling.
  const isApproval =
    n.type === 'client_approved_all' || (!n.type && n.message?.includes('approved'))
  const clientName = clientNameFor(n)
  const title = titleForNotification(n)
  const body = bodyForNotification(n)
  const feedbackPreview = n.feedback_text
    ? n.feedback_text.length > 120
      ? n.feedback_text.slice(0, 120) + '…'
      : n.feedback_text
    : null

  return (
    <div
      onClick={() => {
        onMarkRead(n.id)
        onNavigate()
      }}
      className={cn(
        'cursor-pointer border-b border-line px-4 py-3.5 transition-colors hover:bg-wash/60',
        n.is_read ? 'bg-transparent' : 'border-l-2 border-l-spring bg-wash/50'
      )}
    >
      <div className="flex gap-2.5">
        <div
          className={cn(
            'mt-px grid size-8 shrink-0 place-items-center rounded-full',
            isApproval ? 'bg-wash text-forest' : 'bg-marker text-forest-deep'
          )}
        >
          {isApproval ? <Check size={14} /> : <MessageCircle size={14} />}
        </div>

        <div className="min-w-0 flex-1">
          <div className="text-body leading-[1.4] text-ink">
            <span className="font-semibold">{clientName}</span> {title}
          </div>

          {feedbackPreview && (
            <div className="mt-1.5 rounded-sm bg-marker/40 px-2.5 py-1.5 text-caption italic leading-[1.45] text-forest-deep">
              &ldquo;{feedbackPreview}&rdquo;
            </div>
          )}

          {!feedbackPreview && body && <div className="mt-0.5 text-caption text-text3">{body}</div>}

          <div className="mt-1.5 flex items-center justify-between">
            <span className="text-micro text-text3">
              {formatRelativeTime(parseTimestamp(n.created_at))}
            </span>
            <span className="text-micro font-medium text-forest">Open in calendar →</span>
          </div>
        </div>
      </div>
    </div>
  )
}
