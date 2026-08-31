import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NotificationItem } from '../notification-item'
import type { EnrichedNotification } from '@/types/api'

/**
 * The bell's title is derived from a CLOSED SET, with a fallback that reads the message when a row
 * has no type. That fallback has exactly two outcomes — "approved all posts" if the message
 * contains "approved", "requested changes" otherwise — so any event outside the set is announced
 * to the agency as a rejection.
 *
 * That is what happened to sending an approval. Both approval routes called `notify()` without a
 * `type`, and their message ("Approval link generated for Acme — 5 posts") contains no lowercase
 * "approved", so the bell said the client had requested changes on a batch that had just gone out.
 * `notify`'s own docblock warned that these rows set no type; it was read and waved off.
 */

function notification(over: Partial<EnrichedNotification> = {}): EnrichedNotification {
  return {
    id: 'n1',
    agency_id: 'a1',
    message: 'Approval link generated for Acme — 5 posts',
    is_read: false,
    created_at: '2026-08-31T10:00:00Z',
    client_id: 'c1',
    post_id: null,
    feedback_text: null,
    review_token: null,
    type: 'approval_sent',
    ...over,
  }
}

function renderItem(n: EnrichedNotification) {
  return render(
    <NotificationItem
      notification={n}
      clientName="Acme"
      onMarkRead={vi.fn()}
      onNavigate={vi.fn()}
    />
  )
}

describe('NotificationItem', () => {
  it('does not announce a sent approval as a rejection', () => {
    renderItem(notification())

    expect(screen.getByText('has posts awaiting approval')).toBeInTheDocument()
    expect(screen.queryByText('requested changes')).not.toBeInTheDocument()
  })

  it('still shows the message body, which carries the post count', () => {
    renderItem(notification())

    expect(screen.getByText('Approval link generated for Acme — 5 posts')).toBeInTheDocument()
  })

  it('keeps the client’s own answers distinct from the sending of the request', () => {
    renderItem(notification({ type: 'client_approved_all', message: 'Acme approved 5 posts' }))
    expect(screen.getByText('approved all posts')).toBeInTheDocument()

    renderItem(notification({ type: 'client_feedback', message: 'Acme requested changes' }))
    expect(screen.getByText('requested changes')).toBeInTheDocument()
  })

  it('still reads the message for genuinely legacy rows that have no type', () => {
    // Rows written before the type column was populated. The fallback stays — deleting it would
    // relabel real history — which is why the fix was to give new events a type, not to widen it.
    renderItem(notification({ type: null, message: 'Acme approved all posts' }))

    expect(screen.getByText('approved all posts')).toBeInTheDocument()
  })
})
