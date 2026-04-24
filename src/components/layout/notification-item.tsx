'use client'

import { Check, MessageCircle } from 'lucide-react'
import { formatRelativeTime, parseTimestamp } from '@/utils/format'
import type { EnrichedNotification } from '@/types/api'

interface NotificationItemProps {
  notification: EnrichedNotification
  onMarkRead: (id: string) => void
  onNavigate: () => void
}

/** Build the title line for a notification. */
function titleForNotification(n: EnrichedNotification): string {
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
  // Legacy rows
  return n.message ?? ''
}

/** Extract client name from a notification. */
function clientNameFor(n: EnrichedNotification): string {
  // Typed notifications: parse client name from message ("ClientName approved...")
  if (n.message) {
    const match = n.message.match(/^(.+?)\s+(approved|requested)/)
    if (match) return match[1]!
  }
  return 'Client'
}

/** Single notification row in the panel. */
export function NotificationItem({ notification: n, onMarkRead, onNavigate }: NotificationItemProps) {
  const isApproval = n.type === 'client_approved_all' || (!n.type && n.message?.includes('approved'))
  const clientName = clientNameFor(n)
  const title = titleForNotification(n)
  const body = bodyForNotification(n)
  const feedbackPreview = n.feedback_text
    ? n.feedback_text.length > 120 ? n.feedback_text.slice(0, 120) + '…' : n.feedback_text
    : null

  return (
    <div
      style={{
        padding: '14px 16px',
        cursor: 'pointer',
        borderBottom: '0.5px solid rgba(44,62,80,0.05)',
        background: n.is_read ? 'transparent' : '#FDFAF8',
        borderLeft: n.is_read ? 'none' : '2px solid #C07B55',
        transition: 'background 0.15s',
      }}
      onClick={() => { onMarkRead(n.id); onNavigate() }}
    >
      <div style={{ display: 'flex', gap: 10 }}>
        {/* Icon */}
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            background: isApproval ? 'rgba(90,138,74,0.12)' : 'rgba(44,94,138,0.10)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            marginTop: 1,
          }}
        >
          {isApproval
            ? <Check size={14} color="#5A8A4A" />
            : <MessageCircle size={14} color="#2C5F8A" />
          }
        </div>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, color: '#1A2630', lineHeight: 1.4 }}>
            <span style={{ fontWeight: 600 }}>{clientName}</span>{' '}
            <span style={{ fontWeight: 400 }}>{title}</span>
          </div>

          {feedbackPreview && (
            <div
              style={{
                fontSize: 12,
                color: '#2C5F8A',
                fontStyle: 'italic',
                background: 'rgba(44,94,138,0.04)',
                borderRadius: 6,
                padding: '6px 9px',
                marginTop: 6,
                lineHeight: 1.45,
              }}
            >
              &ldquo;{feedbackPreview}&rdquo;
            </div>
          )}

          {!feedbackPreview && body && (
            <div style={{ fontSize: 12, color: '#8A8070', marginTop: 2, lineHeight: 1.4 }}>
              {body}
            </div>
          )}

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: 6,
            }}
          >
            <span style={{ fontSize: 11, color: '#B0A898' }}>
              {formatRelativeTime(parseTimestamp(n.created_at))}
            </span>
            <span
              style={{
                fontSize: 11,
                color: '#C07B55',
                fontWeight: 500,
              }}
            >
              Open in calendar →
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
