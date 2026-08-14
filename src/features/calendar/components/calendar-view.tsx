'use client'

import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Link, Mail } from 'lucide-react'
import { useCalendar } from '@/features/calendar/hooks/use-calendar'
import { useApproval, type ClientEntry } from '@/features/calendar/hooks/use-approval'
import { toast } from '@/components/ui/toast'
import { DiscardToast, DISCARD_TOAST_MS } from '@/components/ui/discard-toast'
import { HeaderMeta, MetaFlag, PageHeader } from '@/components/layout/page-header/page-header'
import { SelectControl } from '@/components/layout/page-header/select-control'
import { useShell } from '@/components/layout/shell-context'
import { cn } from '@/utils/cn'
import { deletePost } from '@/lib/actions/post-actions'
import { getMondayISO, toDateKey } from '@/utils/date-helpers'
import { formatScheduleDate } from '@/utils/format'
import { useCalendarRange } from '@/features/calendar/hooks/use-calendar-range'
import { ApprovalAction } from './approval-tools'
import { WeekGrid } from './week-grid'
import { ClientsView } from './clients-view'
import { countClientsBehind, postsInWeek } from '@/features/calendar/lib/week-model'
import { suggestionPlatform } from '@/lib/scheduling/slot-picker'
import { TabRail } from '@/components/layout/page-header/tab-rail'
import { MonthCoverage } from './month-coverage'
import { QueueRail } from './queue-rail'
import { ScheduleCard } from './schedule-card'
import type { CalendarPost } from '@/types/api'

interface CalendarViewProps {
  initialPosts: CalendarPost[]
  clients: ClientEntry[]
}

/** Month navigation, inline with the title it moves. */
function RangeStepBtn({
  onClick,
  direction,
  unit,
}: {
  onClick: () => void
  direction: 'prev' | 'next'
  /** What a step actually moves — the button announced "month" in all three views. */
  unit: 'month' | 'week'
}) {
  const Icon = direction === 'prev' ? ChevronLeft : ChevronRight
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${direction === 'prev' ? 'Previous' : 'Next'} ${unit}`}
      className="grid size-7 place-items-center rounded-sm text-text2 transition-colors duration-150 ease-contour hover:bg-ink/[0.06] hover:text-ink"
    >
      <Icon className="size-3" />
    </button>
  )
}

export function CalendarView({ initialPosts, clients }: CalendarViewProps) {
  const { timezone } = useShell()
  const router = useRouter()
  const searchParams = useSearchParams()
  // What range is on screen and every way of moving it — one concern, one hook.
  const {
    year,
    month,
    weekStart,
    mode,
    title,
    stepUnit,
    selectMode,
    openWeek,
    stepBack,
    stepForward,
    goToToday,
  } = useCalendarRange(timezone)
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null)
  const [cardOpen, setCardOpen] = useState(false)
  const [activePostId, setActivePostId] = useState<string | null>(null)
  const [editMode, setEditMode] = useState(false)
  /** Set when the card was opened from a suggested slot, so it can prefill and scope. */
  const [slotPrefill, setSlotPrefill] = useState<{ clientId: string; at: string } | null>(null)
  const editParamProcessed = useRef(false)

  const {
    posts: allPosts,
    unscheduledPosts,
    scheduledPosts,
    schedulePost,
    unschedulePost,
    updatePostContent,
    movePostByDays,
    movePostToDay,
    restoreSchedule,
    rearmPost,
    removePost,
    upsertPostImage,
    removePostImage,
    markPostPublished,
    adoptServerPosts,
    pendingIds,
  } = useCalendar(initialPosts, timezone)

  /**
   * Come back to the tab and see what actually happened.
   *
   * The publish cron runs every five minutes and this page never asked again, so a post
   * that failed at 09:05 kept rendering as "Scheduled" until a hard reload — the state
   * the calendar is least able to afford being wrong about.
   *
   * Only on focus, not after every mutation: those already patch state optimistically,
   * and this page's query is still unbounded (P7), so firing it on every click would
   * refetch every post in five statuses to confirm something already on screen.
   */
  useEffect(() => {
    function refresh() {
      router.refresh()
    }
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [router])

  /**
   * Adopt server data when a refresh lands, keeping whatever the user is working on.
   *
   * Guarded on the *identity* of `initialPosts` rather than running whenever its
   * dependencies change: without the ref this re-adopts the same server snapshot every
   * time a mutation settles, and quietly reverts the optimistic patch that just landed.
   */
  const adopted = useRef(initialPosts)
  useEffect(() => {
    if (adopted.current === initialPosts) return
    adopted.current = initialPosts
    const keepLocal = new Set(pendingIds)
    if (activePostId) keepLocal.add(activePostId)
    adoptServerPosts(initialPosts, keepLocal)
  }, [initialPosts, activePostId, pendingIds, adoptServerPosts])

  // Auto-open modal in edit mode when navigated from dashboard with ?editPost=<id>.
  // Genuinely an effect, not a render-time adjustment: it consumes a one-shot URL param and
  // navigates to clear it, which is a side effect and must not run during render.
  /* eslint-disable react-hooks/set-state-in-effect -- the ref makes this run once per
     param, and the router.replace below is a navigation, so none of it can move into
     render. */
  useEffect(() => {
    if (editParamProcessed.current) return
    const editPostId = searchParams.get('editPost')
    if (!editPostId) return
    editParamProcessed.current = true
    setActivePostId(editPostId)
    setCardOpen(true)
    setEditMode(true)
    router.replace('/calendar', { scroll: false })
  }, [searchParams, router])
  /* eslint-enable react-hooks/set-state-in-effect */

  const filteredUnscheduled = useMemo(
    () =>
      selectedClientId
        ? unscheduledPosts.filter((p) => p.client_id === selectedClientId)
        : unscheduledPosts,
    [unscheduledPosts, selectedClientId]
  )
  const filteredScheduled = useMemo(
    () =>
      selectedClientId
        ? scheduledPosts.filter((p) => p.client_id === selectedClientId)
        : scheduledPosts,
    [scheduledPosts, selectedClientId]
  )

  // Active post — search all posts so both grid and panel clicks work
  const activePost = allPosts.find((p) => p.id === activePostId) ?? null

  /**
   * What the card's stepper walks.
   *
   * Scoped to one client when the card was opened from that client's suggested slot,
   * which is what `slotPrefill.clientId` is for — it was stored, typed and passed to the
   * card, and then read by nothing, so the header still said "3 of 48" while offering to
   * step through posts that could not go in the slot being filled. Entered from the queue
   * there is no prefill and this is the whole backlog, exactly as before.
   */
  const cardQueue = useMemo(
    () =>
      slotPrefill
        ? filteredUnscheduled.filter((p) => p.client_id === slotPrefill.clientId)
        : filteredUnscheduled,
    [filteredUnscheduled, slotPrefill]
  )
  const activeIndex = cardQueue.findIndex((p) => p.id === activePostId)

  const handlePanelPostClick = useCallback((post: CalendarPost) => {
    setActivePostId(post.id)
    setCardOpen(true)
  }, [])

  const handleGridPostClick = useCallback((postId: string) => {
    setActivePostId(postId)
    setCardOpen(true)
  }, [])

  /**
   * Close the card and forget what it was opened for.
   *
   * Every path that dismisses the card goes through here. Four of them used to call a
   * bare `setCardOpen(false)` and leave `slotPrefill` standing, so after placing a post
   * into a Tuesday 09:00 slot the *next* post opened from the queue — any client, any day
   * — arrived prefilled with that Tuesday and that hour, because the card's prefill
   * effect reads the slot before it reads the post's own time.
   */
  const closeCard = useCallback(() => {
    setCardOpen(false)
    setEditMode(false)
    setSlotPrefill(null)
  }, [])

  const handleUnschedule = useCallback(
    (postId: string) => {
      void unschedulePost(postId)
      closeCard()
      setActivePostId(null)
    },
    [unschedulePost, closeCard]
  )

  function handleNavPost(dir: 1 | -1) {
    const next = cardQueue[activeIndex + dir]
    if (next) setActivePostId(next.id)
  }

  async function handleSchedule(postId: string, scheduledAt: string, platform: string) {
    const idx = cardQueue.findIndex((p) => p.id === postId)
    await schedulePost(postId, scheduledAt, platform)
    closeCard()
    const nextPost = cardQueue[idx + 1]
    setActivePostId(nextPost?.id ?? null)
  }

  /**
   * Move a post a day, and offer to put it back.
   *
   * An Undo window rather than a confirmation: moving is cheap, reversible and usually
   * right, so asking first would tax the common case to guard the rare one. Letting the
   * toast expire commits, which is the same contract `DiscardToast` already carries on
   * the review queue and the ideas inbox.
   */
  const offerUndo = useCallback(
    (postId: string, moved: { from: string; to: string }) => {
      const toastId = toast.custom(
        () => (
          <DiscardToast
            title={`Moved to ${formatScheduleDate(new Date(moved.to), timezone)}`}
            onUndo={() => {
              toast.dismiss(toastId)
              // The exact instant it left, written back. Not a reversed delta and not a
              // recomputed day: both of those re-derive the origin from state, and the
              // state a toast callback can see is the one captured before the move. The
              // relative form re-applied the shift to the original time and landed a day
              // early; the absolute form resolved to the value already stored, which the
              // move path correctly declines to write, so Undo did nothing at all.
              void restoreSchedule(postId, moved.from)
            }}
          />
        ),
        { duration: DISCARD_TOAST_MS }
      )
    },
    [timezone, restoreSchedule]
  )

  /** Nudged with the keyboard. */
  const handleMovePost = useCallback(
    async (postId: string, days: number) => {
      const moved = await movePostByDays(postId, days)
      if (moved) offerUndo(postId, moved)
    },
    [movePostByDays, offerUndo]
  )

  /** Dropped on a day. Same command, same Undo. */
  const handleDropPost = useCallback(
    async (postId: string, dayKey: string) => {
      const moved = await movePostToDay(postId, dayKey)
      if (moved) offerUndo(postId, moved)
    },
    [movePostToDay, offerUndo]
  )

  // The grid's props are void-returning, and both handlers are async. Adapting them here
  // once keeps the reference stable; doing it inline in the JSX is what defeated `memo`.
  const onMovePost = useCallback(
    (postId: string, days: number) => void handleMovePost(postId, days),
    [handleMovePost]
  )
  const onDropPost = useCallback(
    (postId: string, dayKey: string) => void handleDropPost(postId, dayKey),
    [handleDropPost]
  )

  /** Retry a failed publish at the time the card's form is showing. */
  async function handleRearm(postId: string, scheduledAt: string) {
    const ok = await rearmPost(postId, scheduledAt)
    // Left open on failure, so the reason the action gave is next to the form that
    // produced it rather than behind a closed dialog.
    if (ok) closeCard()
  }

  function handleSkip(postId: string) {
    const idx = cardQueue.findIndex((p) => p.id === postId)
    closeCard()
    const nextPost = cardQueue[idx + 1]
    if (nextPost) setActivePostId(nextPost.id)
  }

  async function handleSaveContent(
    postId: string,
    updates: { caption?: string; slides_json?: unknown }
  ): Promise<boolean> {
    return updatePostContent(postId, updates)
  }

  async function handleDeletePost(postId: string) {
    const result = await deletePost(postId)
    if (result.ok) {
      removePost(postId)
      toast.success('Post deleted')
      closeCard()
      setActivePostId(null)
    } else {
      toast.error('Failed to delete post')
    }
  }

  const {
    copyLinkSending,
    copyLinkPicker,
    setCopyLinkPicker,
    emailSending,
    emailPicker,
    setEmailPicker,
    approvalSending,
    currentWeekClients,
    noPostsThisWeek,
    handleCopyLink,
    handleEmailClient,
    handleSendApproval,
  } = useApproval({
    clients,
    filteredScheduled,
    allPosts,
    // The week on screen when there is one. In Month the calendar has no single week
    // to send, so it falls back to the current one — and the buttons say which.
    weekStartISO: mode === 'week' ? weekStart : getMondayISO(new Date(), timezone),
    timeZone: timezone,
  })

  async function handleSaveAndResend(
    postId: string,
    updates: { caption?: string; slides_json?: unknown }
  ) {
    const ok = await updatePostContent(postId, updates)
    if (!ok) return
    void handleSendApproval(postId)
    setEditMode(false)
  }

  // Scoped to the month on screen, so the figure matches the grid beneath it — and
  // resolved in the agency zone, because the grid itself is. Reading getMonth() off the
  // instant asks the browser's calendar, which disagrees with the header on the first
  // and last day of every month for any agency not on the viewer's zone.
  const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`
  const scheduledThisMonth = filteredScheduled.filter(
    (post) =>
      post.scheduled_at && toDateKey(new Date(post.scheduled_at), timezone).startsWith(monthPrefix)
  ).length

  // Compared as instants, not as strings — see `postsInWeek`.
  const scheduledThisWeek = postsInWeek(filteredScheduled, weekStart, timezone).length

  const laneClients = useMemo(
    () =>
      clients.map((client) => ({
        id: client.id,
        name: client.name,
        // Read off what the client actually has stored rather than asserted. This was
        // hardcoded 'Instagram' for every client, so a client whose suggestions are
        // Facebook-only matched nothing and drew no slots at all.
        platform: suggestionPlatform(client.best_times),
        bestTimes: client.best_times,
      })),
    [clients]
  )

  /**
   * Placing into a suggested slot: open the dialog the product already has, with the
   * client, date and time filled in. The stepper scopes to that client via `cardQueue`,
   * because stepping the whole agency backlog from one client's slot offers posts it
   * cannot take.
   *
   * The slot carries the client's **id**. It always knew it — `LaneItem` has held a
   * `clientId` since the lanes were built — but the click only forwarded the display
   * name, so this had to look the client back up by `name`. Two clients sharing a name
   * resolved to whichever came first, and a renamed client resolved to none, which
   * returned early and made the slot look inert.
   */
  const handleSlotClick = useCallback(
    (slot: { clientId: string; clientName: string; at: string }) => {
      const firstWaiting = filteredUnscheduled.find((p) => p.client_id === slot.clientId)
      // Nothing to place. Opening the card here showed an empty overlay — `ScheduleCard`
      // renders nothing without a post — so the click read as broken on exactly the
      // clients whose gaps the slot exists to point at.
      if (!firstWaiting) {
        toast.info(`Nothing waiting for ${slot.clientName}. Generate a post to fill this slot.`)
        return
      }
      setSlotPrefill({ clientId: slot.clientId, at: slot.at })
      setActivePostId(firstWaiting.id)
      setCardOpen(true)
    },
    [filteredUnscheduled]
  )

  /**
   * The deficit, surfaced in the rail so it is visible without opening the tab.
   *
   * Deliberately **unfiltered**: this is an agency-wide signal shown in all three modes,
   * and it was reading the client-filtered posts against the full roster — so narrowing
   * the header picker to one client made every other client look dark and drove the count
   * to nearly the size of the roster.
   */
  const clientsBehind = useMemo(
    () => countClientsBehind(scheduledPosts, clients, weekStart, timezone),
    [scheduledPosts, clients, weekStart, timezone]
  )

  /** The Clients tab honours the header filter — on both axes, or it reports false gaps. */
  const visibleClients = useMemo(
    () => (selectedClientId ? clients.filter((c) => c.id === selectedClientId) : clients),
    [clients, selectedClientId]
  )

  return (
    // h-full, not min-h-full: the calendar is a fixed-size workspace, not a document.
    // `.app-shell` is already h-screen/overflow-hidden with <main> as the only scroller,
    // so min-h-full let a tall day lane grow the grid, grow the page, and scroll the
    // column headers and the queue rail off the top together. Bounded here, the lanes'
    // and the rail's own overflow-y-auto are what move.
    <div className="relative flex h-full flex-col overflow-hidden">
      <PageHeader
        crumb={[{ label: 'Calendar' }]}
        // The month is the title and "Calendar" demotes to the crumb — the way
        // every calendar already behaves.
        title={
          <>
            {title}
            {/* Back, forward and home are one cluster. `Today` sat in the actions row
                beside things that act on posts, where it read as a fourth command and
                repeated the date the rail already shows — it navigates, so it belongs
                with the arrows that navigate. */}
            <span className="inline-flex items-center gap-0.5">
              <RangeStepBtn onClick={stepBack} direction="prev" unit={stepUnit} />
              <RangeStepBtn onClick={stepForward} direction="next" unit={stepUnit} />
              <button
                type="button"
                onClick={goToToday}
                className={cn(
                  'ml-0.5 h-7 rounded-sm px-2 text-caption font-medium text-text2',
                  'transition-colors duration-150 ease-contour hover:bg-ink/[0.06] hover:text-ink'
                )}
              >
                Today
              </button>
            </span>
          </>
        }
        meta={
          <HeaderMeta
            parts={[
              mode === 'month'
                ? `${scheduledThisMonth} scheduled this month`
                : `${scheduledThisWeek} scheduled this week`,
              filteredUnscheduled.length > 0 && (
                <MetaFlag>{filteredUnscheduled.length} waiting to be scheduled</MetaFlag>
              ),
            ]}
          />
        }
        tabs={
          <TabRail
            label="Calendar view"
            active={mode}
            onSelect={selectMode}
            items={[
              { id: 'week', label: 'Week' },
              { id: 'month', label: 'Month' },
              {
                id: 'clients',
                label: 'Clients',
                // Amber, not lime: this is something needing care, not where you are.
                ...(clientsBehind > 0 ? { count: clientsBehind, warn: true } : {}),
              },
            ]}
          />
        }
        actions={
          <>
            {clients.length > 1 && (
              <SelectControl
                label="Client"
                value={selectedClientId ?? ''}
                options={[
                  { value: '', label: 'All clients' },
                  ...clients.map((c) => ({ value: c.id, label: c.name })),
                ]}
                onChange={(id) => setSelectedClientId(id || null)}
              />
            )}
            {/* Out of the crumb row, which is `overflow-hidden` so it can collapse when
                the header sticks — its client picker was opening into a 44px clipping
                box, invisible, which read as the button doing nothing. */}
            {clients.length > 0 && (
              <ApprovalAction
                variant="secondary"
                icon={Link}
                label="Copy link"
                loadingLabel="Generating…"
                loading={copyLinkSending}
                disabled={noPostsThisWeek}
                disabledReason="No posts scheduled this week"
                clients={currentWeekClients}
                pickerOpen={copyLinkPicker}
                onTogglePicker={() => setCopyLinkPicker((v) => !v)}
                onSelectClient={(id) => {
                  void handleCopyLink(id)
                }}
              />
            )}
            {/* The page's one Deep Pine commitment. Everything else in this header
                narrows or navigates; this is the only control that acts on anything. */}
            {clients.length > 0 && (
              <ApprovalAction
                variant="primary"
                icon={Mail}
                // Month has no single week to send, so the action falls back to the
                // current one. The label says so rather than leaving the reader to
                // discover it from the email — which is what the hook's own comment
                // already claimed happened.
                label={mode === 'month' ? 'Send this week for approval' : 'Send week for approval'}
                loadingLabel="Sending…"
                loading={emailSending}
                disabled={noPostsThisWeek}
                disabledReason="No posts scheduled this week"
                clients={currentWeekClients}
                pickerOpen={emailPicker}
                onTogglePicker={() => setEmailPicker((v) => !v)}
                onSelectClient={(id) => {
                  void handleEmailClient(id)
                }}
              />
            )}
          </>
        }
      />

      {/* Two panes side by side on desktop; one column that scrolls on a phone, where
          there is no width to dock a 300px rail into. The backlog moves below the week
          rather than behind a button: it was a floating panel once, and the layer it
          needed is what buried its own close control. */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto md:flex-row md:overflow-hidden">
        <div className="flex flex-col px-2 pb-[18px] pt-2.5 md:min-h-0 md:flex-1 md:px-[18px]">
        {mode === 'week' ? (
          <WeekGrid
            weekStartISO={weekStart}
            scheduledPosts={filteredScheduled}
            clients={laneClients}
            timeZone={timezone}
            onPostClick={handleGridPostClick}
            onSlotClick={handleSlotClick}
            // Stable references, not fresh arrows every render. `WeekGrid` is memoised and
            // forwards `onDropPost` straight to all seven `DayColumn`s, which are memoised
            // too — an inline lambda here re-rendered the entire grid on every keystroke in
            // the queue's search box.
            onMovePost={onMovePost}
            onDropPost={onDropPost}
          />
        ) : mode === 'clients' ? (
          <ClientsView
            clients={visibleClients}
            laneClients={laneClients}
            scheduledPosts={filteredScheduled}
            weekStartISO={weekStart}
            timeZone={timezone}
          />
        ) : (
          <MonthCoverage
            year={year}
            month={month}
            timeZone={timezone}
            scheduledPosts={filteredScheduled}
            onPostClick={handleGridPostClick}
            onSelectWeek={openWeek}
          />
        )}
        </div>

        {/* Docked, not floating: a sibling of the grid rather than a layer over it. */}
        <QueueRail
          posts={filteredUnscheduled}
          totalCount={unscheduledPosts.length}
          activePostId={activePostId}
          clientFilterName={
            selectedClientId ? (clients.find((c) => c.id === selectedClientId)?.name ?? null) : null
          }
          onPostClick={handlePanelPostClick}
        />
      </div>

      <ScheduleCard
        post={activePost}
        timeZone={timezone}
        slotPrefill={slotPrefill}
        postIndex={activeIndex}
        totalPosts={cardQueue.length}
        isOpen={cardOpen}
        onClose={closeCard}
        onPrev={() => handleNavPost(-1)}
        onNext={() => handleNavPost(1)}
        onSchedule={handleSchedule}
        onUnschedule={handleUnschedule}
        onSkip={handleSkip}
        onDelete={(id) => {
          void handleDeletePost(id)
        }}
        onSendApproval={(id) => {
          void handleSendApproval(id)
        }}
        onRearm={(id, at) => {
          void handleRearm(id, at)
        }}
        approvalSending={approvalSending}
        // This card's post, not "any post anywhere" — the shared boolean this replaces
        // spun the dialog's button because an unrelated card in the grid was saving.
        isScheduling={activePostId !== null && pendingIds.has(activePostId)}
        editMode={editMode}
        onExitEditMode={() => setEditMode(false)}
        onSaveContent={handleSaveContent}
        onSaveAndResend={handleSaveAndResend}
        onPublished={markPostPublished}
        onImageUpserted={upsertPostImage}
        onImageDeleted={removePostImage}
      />
    </div>
  )
}
