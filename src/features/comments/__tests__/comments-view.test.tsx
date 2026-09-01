import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CommentsView } from '../components/comments-view'
import { CommentThread } from '../components/comment-thread'
import type { CommentGroup, QueuedComment } from '@/types/api'

/**
 * The queue surface.
 *
 * What is worth testing here is the wiring that no other layer can see: that a
 * comment's status decides which tab it appears under, that acting on one moves it
 * immediately rather than after the next cron, and that a failed action does not
 * leave the screen claiming a reply was sent.
 *
 * jsdom has no layout engine, so the two-pane collapse and the sticky header still
 * need a browser. TECH-DEBT §7.12 measured that split: this catches the state third.
 */

const refresh = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh, replace: vi.fn() }),
}))

// PageHeader's crumb trail reads the shell. Mocked rather than wrapped in a real
// ShellProvider, which would pull in the notifications channel and a Supabase client
// for a header this test never asserts on.
vi.mock('@/components/layout/shell-context', () => ({
  useShell: () => ({
    timezone: 'Europe/Sofia',
    agencyName: 'Acme',
    clientName: (id: string | null) => (id === 'client-1' ? 'Haelan' : 'Unknown'),
    notifications: { items: [], unreadCount: 0 },
    pendingCount: null,
  }),
}))

const replyToComment = vi.fn()
const setCommentHidden = vi.fn()
const deleteComment = vi.fn()
// Wrapped rather than passed by reference: vi.mock is hoisted above the consts.
vi.mock('../actions/comment-actions', () => ({
  replyToComment: (input: unknown) => replyToComment(input),
  setCommentHidden: (input: unknown) => setCommentHidden(input),
  deleteComment: (input: unknown) => deleteComment(input),
}))

const LOADED_AT = '2026-09-01T12:00:00Z'

function comment(over: Partial<QueuedComment> = {}): QueuedComment {
  return {
    id: 'c1',
    authorUsername: 'maria.kx',
    text: 'Does this apply to children under 5?',
    commentedAt: '2026-09-01T10:00:00Z',
    likeCount: null,
    hidden: false,
    status: 'needs_reply',
    replies: [],
    ...over,
  }
}

function group(over: Partial<CommentGroup> = {}): CommentGroup {
  return {
    igMediaId: 'media-1',
    postId: 'post-1',
    clientId: 'client-1',
    clientName: 'Haelan',
    caption: 'Five habits for a calmer evening',
    pillar: 'Sleep & routine',
    publishedAt: '2026-08-14T17:00:00Z',
    imageUrl: null,
    permalink: null,
    comments: [comment()],
    ...over,
  }
}

function renderView(groups: CommentGroup[], withheldPostCount = 0) {
  return render(
    <CommentsView
      initialGroups={groups}
      clients={[{ id: 'client-1', name: 'Haelan' }]}
      accountNames={{ 'client-1': 'haelanclinic' }}
      withheldPostCount={withheldPostCount}
      loadedAt={LOADED_AT}
    />
  )
}

beforeEach(() => vi.clearAllMocks())

describe('CommentsView', () => {
  it('opens on what is owed, not on everything', () => {
    renderView([
      group({
        comments: [comment(), comment({ id: 'c2', status: 'answered', text: 'Thanks!' })],
      }),
    ])

    expect(screen.getByText('Does this apply to children under 5?')).toBeInTheDocument()
    expect(screen.queryByText('Thanks!')).not.toBeInTheDocument()
  })

  it('files a comment under the tab its status names', async () => {
    const user = userEvent.setup()
    renderView([
      group({
        comments: [comment(), comment({ id: 'c2', status: 'answered', text: 'Thanks!' })],
      }),
    ])

    await user.click(screen.getByRole('button', { name: /Answered/ }))

    expect(screen.getByText('Thanks!')).toBeInTheDocument()
    expect(screen.queryByText('Does this apply to children under 5?')).not.toBeInTheDocument()
  })

  it('shows the post beside the comment, which is the whole point of the layout', async () => {
    const user = userEvent.setup()
    renderView([group()])

    await user.click(screen.getByText('Does this apply to children under 5?'))

    // Scoped to the detail pane on purpose: the caption also heads the group in the
    // queue, and an unscoped query would pass on that one alone.
    const pane = within(screen.getByRole('complementary', { name: 'Selected comment' }))
    // The caption and pillar come from OUR post record — no competitor can render
    // this, because none of them authored the post.
    expect(pane.getByText('Five habits for a calmer evening')).toBeInTheDocument()
    expect(pane.getByText('Sleep & routine')).toBeInTheDocument()
  })

  it('names the handle a reply will post as', async () => {
    const user = userEvent.setup()
    renderView([group()])

    await user.click(screen.getByText('Does this apply to children under 5?'))

    expect(screen.getByPlaceholderText('Reply as @haelanclinic…')).toBeInTheDocument()
  })

  it('moves a replied comment out of Needs reply immediately', async () => {
    replyToComment.mockResolvedValue({ ok: true, data: undefined })
    const user = userEvent.setup()
    renderView([group()])

    await user.click(screen.getByText('Does this apply to children under 5?'))
    await user.type(screen.getByRole('textbox'), 'Yes, from age 3.')
    await user.click(screen.getByRole('button', { name: 'Reply' }))

    // Without this the queue keeps telling you to do what you have just done, for
    // up to the half hour until the next sync.
    await waitFor(() =>
      expect(screen.queryByText('Does this apply to children under 5?')).not.toBeInTheDocument()
    )
    expect(replyToComment).toHaveBeenCalledWith({
      commentId: 'c1',
      message: 'Yes, from age 3.',
    })
  })

  it('will not send an empty reply', async () => {
    const user = userEvent.setup()
    renderView([group()])

    await user.click(screen.getByText('Does this apply to children under 5?'))

    expect(screen.getByRole('button', { name: 'Reply' })).toBeDisabled()
  })

  it('surfaces a failed action and re-reads the server rather than lying', async () => {
    replyToComment.mockResolvedValue({
      ok: false,
      error: 'This connection predates comment moderation — reconnect the account to enable it',
    })
    const user = userEvent.setup()
    renderView([group()])

    await user.click(screen.getByText('Does this apply to children under 5?'))
    await user.type(screen.getByRole('textbox'), 'Yes')
    await user.click(screen.getByRole('button', { name: 'Reply' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/predates comment moderation/)
    // Our optimistic copy is now wrong; the server holds the truth.
    await waitFor(() => expect(refresh).toHaveBeenCalled())
  })

  it('asks twice before deleting, because Instagram gives nothing back', async () => {
    deleteComment.mockResolvedValue({ ok: true, data: undefined })
    const user = userEvent.setup()
    renderView([group()])

    await user.click(screen.getByText('Does this apply to children under 5?'))
    await user.click(screen.getByRole('button', { name: 'Delete' }))

    expect(deleteComment).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Delete for good' }))
    expect(deleteComment).toHaveBeenCalledWith({ commentId: 'c1' })
  })

  it('explains the Advanced Access wall instead of claiming all is quiet', () => {
    // The failure this prevents: Instagram answers 200 with an empty list, so a
    // queue that only knew its own rows would render "nothing waiting" over a
    // backlog of real questions.
    renderView([], 3)

    expect(screen.getByText(/not releasing comments on 3 published posts/)).toBeInTheDocument()
  })

  it('says so plainly when there is genuinely nothing', () => {
    renderView([])

    expect(screen.getByText('Nothing waiting on a reply')).toBeInTheDocument()
    expect(screen.queryByText(/not releasing comments/)).not.toBeInTheDocument()
  })
})

describe('CommentThread', () => {
  it('threads our own replies apart from everyone else’s', () => {
    render(
      <CommentThread
        group={group()}
        comment={comment({
          status: 'answered',
          replies: [
            {
              id: 'r1',
              authorUsername: 'haelanclinic',
              text: 'From age 3, yes.',
              commentedAt: '2026-09-01T11:00:00Z',
              fromUs: true,
            },
          ],
        })}
        accountName="haelanclinic"
        now={new Date(LOADED_AT)}
        pending={false}
        onReply={async () => true}
        onToggleHidden={vi.fn()}
        onDelete={vi.fn()}
      />
    )

    expect(screen.getByText('From age 3, yes.')).toBeInTheDocument()
  })

  it('offers Unhide once a comment is hidden', () => {
    render(
      <CommentThread
        group={group()}
        comment={comment({ hidden: true, status: 'hidden' })}
        accountName="haelanclinic"
        now={new Date(LOADED_AT)}
        pending={false}
        onReply={async () => true}
        onToggleHidden={vi.fn()}
        onDelete={vi.fn()}
      />
    )

    expect(screen.getByRole('button', { name: 'Unhide' })).toBeInTheDocument()
  })

  it('says the text was withheld rather than rendering an empty comment', () => {
    render(
      <CommentThread
        group={group()}
        comment={comment({ text: null, authorUsername: null })}
        accountName="haelanclinic"
        now={new Date(LOADED_AT)}
        pending={false}
        onReply={async () => true}
        onToggleHidden={vi.fn()}
        onDelete={vi.fn()}
      />
    )

    expect(screen.getByText(/Instagram withheld the text/)).toBeInTheDocument()
  })
})
