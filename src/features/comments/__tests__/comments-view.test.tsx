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

const toastSuccess = vi.fn()
vi.mock('@/components/ui/toast', () => ({
  toast: { success: (m: string) => toastSuccess(m), error: vi.fn() },
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

/**
 * The queue row, as opposed to the same comment echoed in the detail pane.
 *
 * Needed because the pane auto-selects the first comment, so any comment on screen
 * legitimately appears twice. An unscoped `getByText` was ambiguous, and — worse —
 * would have passed on the pane alone while the queue rendered nothing.
 */
function queueRow(name: RegExp) {
  return screen.getByRole('button', { name })
}

function pane() {
  return within(screen.getByRole('complementary', { name: 'Selected comment' }))
}

beforeEach(() => vi.clearAllMocks())

describe('CommentsView', () => {
  it('opens on what is owed, not on everything', () => {
    renderView([
      group({
        comments: [comment(), comment({ id: 'c2', status: 'answered', text: 'Thanks!' })],
      }),
    ])

    expect(queueRow(/Does this apply/)).toBeInTheDocument()
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

    expect(queueRow(/Thanks!/)).toBeInTheDocument()
    expect(screen.queryByText('Does this apply to children under 5?')).not.toBeInTheDocument()
  })

  it('opens with the first comment already in the pane', () => {
    // An empty pane beside a full queue is a dead end: it lands you on nothing and
    // makes you discover that rows are clickable. It is also what you saw if a click
    // did not register for any reason.
    renderView([group()])

    expect(pane().getByText('Does this apply to children under 5?')).toBeInTheDocument()
    expect(screen.queryByText(/Pick a comment/)).not.toBeInTheDocument()
  })

  it('marks the row the pane is showing, even when nobody clicked it', () => {
    renderView([group()])

    // Otherwise the pane and the queue disagree about what is selected.
    expect(screen.getByRole('button', { name: /Does this apply/ })).toHaveAttribute(
      'aria-current',
      'true'
    )
  })

  it('falls back to another comment when the selected one is deleted', async () => {
    deleteComment.mockResolvedValue({ ok: true, data: undefined })
    const user = userEvent.setup()
    renderView([group({ comments: [comment(), comment({ id: 'c2', text: 'Second question' })] })])

    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await user.click(screen.getByRole('button', { name: 'Delete for good' }))

    expect(pane().getByText('Second question')).toBeInTheDocument()
  })

  it('shows the post beside the comment, which is the whole point of the layout', async () => {
    const user = userEvent.setup()
    renderView([group()])

    await user.click(queueRow(/Does this apply/))

    // Scoped to the detail pane on purpose: the caption also heads the group in the
    // queue, and an unscoped query would pass on that one alone. The caption and
    // pillar come from OUR post record — no competitor can render this, because
    // none of them authored the post.
    expect(pane().getByText('Five habits for a calmer evening')).toBeInTheDocument()
    expect(pane().getByText('Sleep & routine')).toBeInTheDocument()
  })

  it('names the handle a reply will post as', async () => {
    const user = userEvent.setup()
    renderView([group()])

    await user.click(queueRow(/Does this apply/))

    expect(screen.getByPlaceholderText('Reply as @haelanclinic…')).toBeInTheDocument()
  })

  it('moves a replied comment out of the Needs reply LIST immediately', async () => {
    replyToComment.mockResolvedValue({ ok: true, data: undefined })
    const user = userEvent.setup()
    renderView([group()])

    await user.click(queueRow(/Does this apply/))
    await user.type(screen.getByRole('textbox'), 'Yes, from age 3.')
    await user.click(screen.getByRole('button', { name: 'Reply' }))

    // Two before (queue row + detail pane), one after: the queue entry goes, the
    // pane keeps it. Without this the queue keeps telling you to do what you have
    // just done, for up to the half hour until the next sync.
    await waitFor(() =>
      expect(screen.getAllByText('Does this apply to children under 5?')).toHaveLength(1)
    )
    expect(replyToComment).toHaveBeenCalledWith({
      commentId: 'c1',
      message: 'Yes, from age 3.',
    })
  })

  it('keeps the pane open with the reply threaded, rather than emptying it', async () => {
    // What shipped: the pane resolved against the tab-filtered list, so replying
    // moved the comment to Answered and the card vanished with no sign it had
    // worked. Sending a reply and watching the screen go blank reads as failure.
    replyToComment.mockResolvedValue({ ok: true, data: undefined })
    const user = userEvent.setup()
    renderView([group()])

    await user.click(queueRow(/Does this apply/))
    await user.type(screen.getByRole('textbox'), 'Yes, from age 3.')
    await user.click(screen.getByRole('button', { name: 'Reply' }))

    await screen.findByRole('complementary', { name: 'Selected comment' })
    expect(pane().getByText('Does this apply to children under 5?')).toBeInTheDocument()
    expect(pane().getByText('Yes, from age 3.')).toBeInTheDocument()
  })

  it('says the reply went out, and as whom', async () => {
    // Every action here changes something on Instagram the page cannot show. Without
    // a word back, a row quietly changing tabs is the only evidence it worked.
    replyToComment.mockResolvedValue({ ok: true, data: undefined })
    const user = userEvent.setup()
    renderView([group()])

    await user.click(queueRow(/Does this apply/))
    await user.type(screen.getByRole('textbox'), 'Yes')
    await user.click(screen.getByRole('button', { name: 'Reply' }))

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Replied as @haelanclinic'))
  })

  it('counts replies in English', () => {
    // Shipped as "2 replys owed". pluralise() appends a bare 's'.
    renderView([group({ comments: [comment(), comment({ id: 'c2' })] })])

    expect(screen.getByText(/2 replies owed/)).toBeInTheDocument()
  })

  it('does not claim a post record it does not have', () => {
    // postId null means posts.ig_media_id matched nothing, so calling it "Untitled
    // post" over a blank grey square asserts a record we have not got — and reads
    // as an image that failed to load.
    renderView([group({ postId: null, caption: null, imageUrl: null })])

    expect(screen.queryByText('Untitled post')).not.toBeInTheDocument()
    // Twice on purpose: the queue row and the detail pane share one naming rule, so
    // one post cannot be called two things a few hundred pixels apart.
    expect(screen.getAllByText('Post on Instagram')).toHaveLength(2)
    expect(screen.getAllByText(/no matching post in Kontuur/)).toHaveLength(2)
  })

  it('still says "Untitled post" for a post we DO have, with no caption', () => {
    renderView([group({ caption: null })])

    expect(screen.getAllByText('Untitled post')).toHaveLength(2)
    expect(screen.queryByText(/no matching post/)).not.toBeInTheDocument()
  })

  it('will not send an empty reply', async () => {
    const user = userEvent.setup()
    renderView([group()])

    await user.click(queueRow(/Does this apply/))

    expect(screen.getByRole('button', { name: 'Reply' })).toBeDisabled()
  })

  it('surfaces a failed action and re-reads the server rather than lying', async () => {
    replyToComment.mockResolvedValue({
      ok: false,
      error: 'This connection predates comment moderation — reconnect the account to enable it',
    })
    const user = userEvent.setup()
    renderView([group()])

    await user.click(queueRow(/Does this apply/))
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

    await user.click(queueRow(/Does this apply/))
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
