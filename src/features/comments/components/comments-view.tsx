'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { MessageCircle, RefreshCw } from 'lucide-react'
import { PageHeader, HeaderMeta, MetaFlag } from '@/components/layout/page-header/page-header'
import { PAGE_SHELL } from '@/components/layout/page-header/shared'
import { TabRail, type TabItem } from '@/components/layout/page-header/tab-rail'
import { ClientFilter } from '@/components/layout/page-header/client-filter'
import { EmptyState } from '@/components/layout/empty-state'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { cn } from '@/utils/cn'
import { pluralise } from '@/utils/format'
import type { CommentGroup, CommentStatus, QueuedComment } from '@/types/api'
import { computeQueueStats, formatDuration } from '../lib/queue-stats'
import {
  deleteComment as deleteCommentAction,
  replyToComment as replyToCommentAction,
  setCommentHidden as setCommentHiddenAction,
} from '../actions/comment-actions'
import { PostGroup } from './post-group'
import { CommentThread } from './comment-thread'

const TABS: Array<{ id: CommentStatus; label: string }> = [
  { id: 'needs_reply', label: 'Needs reply' },
  { id: 'answered', label: 'Answered' },
  { id: 'hidden', label: 'Hidden' },
]

interface Selection {
  groupId: string
  commentId: string
}

/**
 * The comments queue.
 *
 * Tab and client scope are component state rather than URL params, matching the
 * review queue and the calendar. The whole queue arrives in one server read, so
 * filtering it here costs nothing, where putting either in the URL would make every
 * filter click a round trip for data the browser already holds.
 */
export function CommentsView({
  initialGroups,
  clients,
  accountNames,
  withheldPostCount,
  loadedAt,
}: {
  initialGroups: CommentGroup[]
  clients: Array<{ id: string; name: string }>
  /** Client id → the handle replies post as, so the composer can say which. */
  accountNames: Record<string, string | null>
  withheldPostCount: number
  /** The server's render instant, so relative times match between SSR and hydration. */
  loadedAt: string
}) {
  const router = useRouter()
  const [groups, setGroups] = useState(initialGroups)
  const [tab, setTab] = useState<CommentStatus>('needs_reply')
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null)
  const [selection, setSelection] = useState<Selection | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [refreshing, startRefresh] = useTransition()

  const now = useMemo(() => new Date(loadedAt), [loadedAt])
  const stats = useMemo(() => computeQueueStats(groups, now), [groups, now])

  const scoped = useMemo(
    () =>
      selectedClientId ? groups.filter((group) => group.clientId === selectedClientId) : groups,
    [groups, selectedClientId]
  )

  /** Groups with at least one comment in the active tab, each carrying only those. */
  const visible = useMemo(
    () =>
      scoped
        .map((group) => ({
          group,
          comments: group.comments.filter((comment) => comment.status === tab),
        }))
        .filter((entry) => entry.comments.length > 0),
    [scoped, tab]
  )

  /**
   * What the pane is showing.
   *
   * Two deliberate properties, both of them fixes for the pane going blank.
   *
   * It resolves against the client scope, NOT the active tab. Replying moves a
   * comment from Needs reply to Answered; resolving against the tab-filtered list
   * emptied the pane the instant you sent, so the card vanished with no sign it had
   * worked. Against the scope it stays put and your reply appears threaded under it.
   *
   * And it FALLS BACK to the first comment in the tab rather than to nothing. An
   * empty pane beside a full queue is a dead end — it puts the burden on the reader
   * to discover that rows are clickable, and it is what someone lands on every time
   * they open the page. Falling back also covers deleting the selected comment,
   * which would otherwise leave the pane empty until the next click.
   */
  const active = useMemo(() => {
    const first = visible[0]
    const fallback = first?.comments[0] ? { group: first.group, comment: first.comments[0] } : null
    if (!selection) return fallback
    const group = scoped.find((candidate) => candidate.igMediaId === selection.groupId)
    const comment = group?.comments.find((candidate) => candidate.id === selection.commentId)
    return group && comment ? { group, comment } : fallback
  }, [scoped, visible, selection])

  const tabs: Array<TabItem<CommentStatus>> = TABS.map((entry) => ({
    id: entry.id,
    label: entry.label,
    count: countInTab(scoped, entry.id),
    warn: entry.id === 'needs_reply' && countInTab(scoped, 'needs_reply') > 0,
  }))

  /** Applies a change to our copy so the queue is right before the server catches up. */
  function patch(commentId: string, change: (comment: QueuedComment) => QueuedComment | null) {
    setGroups((current) =>
      current
        .map((group) => ({
          ...group,
          comments: group.comments.flatMap((comment) => {
            if (comment.id !== commentId) return [comment]
            const next = change(comment)
            return next ? [next] : []
          }),
        }))
        .filter((group) => group.comments.length > 0)
    )
  }

  /**
   * `done` is not decoration. Every action here changes something on Instagram that
   * the page cannot show you — the reply is live under someone else's comment, the
   * hidden comment is gone from public view. Without a word back, the only evidence
   * of success is a row quietly moving tabs, which reads as the click having failed.
   */
  function run(action: () => Promise<{ ok: boolean; error?: string }>, done: string) {
    setError(null)
    startTransition(async () => {
      const result = await action()
      if (result.ok) {
        toast.success(done)
        return
      }
      setError(result.error ?? 'Something went wrong')
      // Our optimistic copy is now a lie. The server holds the truth.
      router.refresh()
    })
  }

  function reply(comment: QueuedComment, group: CommentGroup, message: string) {
    const accountName = accountNames[group.clientId] ?? null
    patch(comment.id, (current) => ({
      ...current,
      status: 'answered',
      replies: [
        ...current.replies,
        {
          id: `pending-${current.id}`,
          authorUsername: accountName,
          text: message,
          commentedAt: new Date().toISOString(),
          fromUs: true,
        },
      ],
    }))
    const handle = accountName ? `@${accountName}` : 'the client'
    run(() => replyToCommentAction({ commentId: comment.id, message }), `Replied as ${handle}`)
    return true
  }

  const headerCount = stats.needsReply + stats.answered + stats.hidden

  return (
    <>
      <PageHeader
        crumb={[{ label: 'Comments' }]}
        title="Comments"
        count={headerCount}
        meta={
          <HeaderMeta
            parts={[
              stats.needsReply > 0 ? (
                <MetaFlag>{pluralise(stats.needsReply, 'reply', 'replies')} owed</MetaFlag>
              ) : (
                'Everything published has been answered'
              ),
              stats.oldestWaitingMs !== null &&
                `oldest waiting ${formatDuration(stats.oldestWaitingMs)}`,
              stats.medianReplyMs !== null &&
                `usually answered in ${formatDuration(stats.medianReplyMs)}`,
            ]}
          />
        }
        actions={
          <>
            <ClientFilter
              clients={clients}
              value={selectedClientId}
              onChange={(id) => {
                setSelectedClientId(id)
                setSelection(null)
              }}
            />
            <Button
              size="sm"
              variant="secondary"
              loading={refreshing}
              onClick={() => startRefresh(() => router.refresh())}
            >
              <RefreshCw size={13} aria-hidden="true" />
              Refresh
            </Button>
          </>
        }
        tabs={
          <TabRail
            items={tabs}
            active={tab}
            label="Filter comments"
            onSelect={(next) => {
              setTab(next)
              setSelection(null)
            }}
          />
        }
      />

      <div className={cn(PAGE_SHELL, 'pb-10 pt-5')}>
        {error && (
          <p
            role="alert"
            className="mb-4 rounded-sm border border-line2 bg-surface px-3 py-2 text-caption text-ink"
          >
            {error}
          </p>
        )}

        {withheldPostCount > 0 && (
          <p className="mb-4 rounded-card border border-line2 bg-surface px-3.5 py-3 text-caption leading-relaxed text-text2">
            <span className="font-semibold text-ink">
              Instagram is not releasing comments on{' '}
              {pluralise(withheldPostCount, 'published post')} yet.
            </span>{' '}
            It reports how many there are but withholds who wrote them and what they say until the
            app has Advanced Access for comment moderation, which Meta grants through App Review.
            Comments from anyone with a role on the Meta app come through in the meantime.
          </p>
        )}

        {visible.length === 0 && !active ? (
          <EmptyState
            icon={<MessageCircle size={18} aria-hidden="true" />}
            title={emptyTitle(tab)}
            description={emptyDescription(tab, groups.length > 0)}
          />
        ) : (
          /* `!active` above, not just an empty list: answering the last unanswered
             comment empties this tab, and collapsing to a full-width empty state would
             take the pane — and the reply you just sent — down with it. */
          <div className="grid gap-6 min-[1140px]:grid-cols-[minmax(0,1fr)_316px] min-[1140px]:items-start">
            <div className="flex flex-col gap-3">
              {visible.length === 0 ? (
                <EmptyState
                  icon={<MessageCircle size={18} aria-hidden="true" />}
                  title={emptyTitle(tab)}
                  description={emptyDescription(tab, groups.length > 0)}
                />
              ) : (
                visible.map((entry) => (
                  <PostGroup
                    key={entry.group.igMediaId}
                    group={entry.group}
                    comments={entry.comments}
                    // The EFFECTIVE selection, not the raw one: with the fallback
                    // above, the pane can be showing a comment nobody clicked, and
                    // the row it belongs to has to look selected or the two disagree.
                    selectedCommentId={active?.comment.id ?? null}
                    onSelect={(comment, group) =>
                      setSelection({ groupId: group.igMediaId, commentId: comment.id })
                    }
                    now={now}
                  />
                ))
              )}
            </div>

            {/**
             * Below 1140px there is no second column, so this used to be hidden
             * outright — which made clicking a comment do nothing whatsoever on a
             * narrower window. A control that silently has no effect is worse than
             * one that is absent.
             *
             * Now it appears ABOVE the queue, and only once something has actually
             * been clicked: the auto-selected fallback would otherwise push the list
             * off the screen on arrival, on the one layout that can least afford it.
             *
             * Sticky on wide screens so it stays beside the row you picked while you
             * read down a long queue.
             */}
            <div
              className={cn(
                'max-[1139px]:order-first min-[1140px]:sticky min-[1140px]:top-4',
                !selection && 'max-[1139px]:hidden'
              )}
            >
              {active ? (
                <CommentThread
                  group={active.group}
                  comment={active.comment}
                  accountName={accountNames[active.group.clientId] ?? null}
                  now={now}
                  pending={pending}
                  onReply={async (message) => reply(active.comment, active.group, message)}
                  onToggleHidden={() => {
                    const hidden = !active.comment.hidden
                    patch(active.comment.id, (current) => ({
                      ...current,
                      hidden,
                      status: hidden
                        ? 'hidden'
                        : current.replies.some((reply) => reply.fromUs)
                          ? 'answered'
                          : 'needs_reply',
                    }))
                    run(
                      () => setCommentHiddenAction({ commentId: active.comment.id, hidden }),
                      hidden ? 'Hidden from public view — its author is not told' : 'Visible again'
                    )
                  }}
                  onDelete={() => {
                    patch(active.comment.id, () => null)
                    setSelection(null)
                    run(
                      () => deleteCommentAction({ commentId: active.comment.id }),
                      'Deleted from Instagram'
                    )
                  }}
                />
              ) : (
                <aside className="rounded-card border border-dashed border-line2 px-3.5 py-6 text-center text-caption text-text3">
                  Pick a comment to see the post it is on, and reply here.
                </aside>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  )
}

function countInTab(groups: readonly CommentGroup[], status: CommentStatus): number {
  return groups.reduce(
    (total, group) => total + group.comments.filter((comment) => comment.status === status).length,
    0
  )
}

function emptyTitle(tab: CommentStatus): string {
  if (tab === 'needs_reply') return 'Nothing waiting on a reply'
  if (tab === 'answered') return 'Nothing answered yet'
  return 'Nothing hidden'
}

function emptyDescription(tab: CommentStatus, hasAny: boolean): string {
  if (!hasAny) {
    return 'Comments appear here within half an hour of someone leaving one on a published post.'
  }
  if (tab === 'needs_reply') return 'Every question on a published post has an answer.'
  if (tab === 'answered') return 'Replies you send from here will collect in this tab.'
  return 'Hiding a comment removes it from public view without telling its author.'
}
