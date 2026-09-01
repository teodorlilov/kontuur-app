import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { IdeaRow } from '../components/idea-row'
import { generatedPostWasDeleted } from '../lib/idea-filters'
import type { ClientIdea } from '@/types/api'

/**
 * An idea whose post was deleted must still be actionable.
 *
 * `client_ideas.generated_post_id` is ON DELETE SET NULL, so deleting the post leaves the idea at
 * `status: 'generated'` with no link. Both surfaces gated their action on that link being present,
 * and "Generate from this idea" lives on the not-generated branch — so the row and the dialog each
 * rendered NOTHING. A client's request became permanently unopenable: no view, no regenerate, no
 * dismiss.
 *
 * The status deliberately stays `generated`. A post was generated; reverting the idea to `new`
 * would put it back in the inbox as though nobody had looked at it.
 */

function idea(over: Partial<ClientIdea> = {}): ClientIdea {
  return {
    id: 'idea-1',
    clientId: 'client-1',
    clientName: 'Acme',
    clientNiche: null,
    ideaText: 'Something the client asked for',
    extraNotes: null,
    platform: null,
    targetDate: null,
    status: 'generated',
    generatedPostId: 'post-1',
    submittedAt: '2026-08-20T10:00:00Z',
    readAt: null,
    ...over,
  }
}

function renderRow(value: ClientIdea) {
  return render(
    <table>
      <tbody>
        <IdeaRow
          idea={value}
          now={new Date('2026-09-01T10:00:00Z')}
          selected={false}
          onToggleSelect={vi.fn()}
          onOpen={vi.fn()}
          onDismiss={vi.fn()}
          onRestore={vi.fn()}
        />
      </tbody>
    </table>
  )
}

describe('generatedPostWasDeleted', () => {
  it('is true only for a generated idea whose link is gone', () => {
    expect(generatedPostWasDeleted(idea({ generatedPostId: null }))).toBe(true)
    expect(generatedPostWasDeleted(idea())).toBe(false)
    // A new or dismissed idea has never had a link — that is not a deleted post.
    expect(generatedPostWasDeleted(idea({ status: 'new', generatedPostId: null }))).toBe(false)
    expect(generatedPostWasDeleted(idea({ status: 'dismissed', generatedPostId: null }))).toBe(
      false
    )
  })
})

describe('IdeaRow', () => {
  it('offers a way back when the generated post was deleted', () => {
    renderRow(idea({ generatedPostId: null }))

    // The whole point: this row used to render an empty action cell.
    expect(screen.getByText('Post deleted')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /generate again/i })).toHaveAttribute(
      'href',
      '/generate?ideaId=idea-1'
    )
  })

  it('still links to the post when it exists', () => {
    renderRow(idea())

    expect(screen.getByRole('link', { name: /view post/i })).toHaveAttribute(
      'href',
      '/calendar?editPost=post-1'
    )
    expect(screen.queryByText('Post deleted')).not.toBeInTheDocument()
  })
})
