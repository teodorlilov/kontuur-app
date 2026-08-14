'use client'

import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Link, Mail } from 'lucide-react'
import { useCalendar } from '@/features/calendar/hooks/use-calendar'
import { useApproval, type ClientEntry } from '@/features/calendar/hooks/use-approval'
import { toast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { HeaderMeta, MetaFlag, PageHeader } from '@/components/layout/page-header/page-header'
import { SelectControl } from '@/components/layout/page-header/select-control'
import { TOOL_ROW } from '@/components/layout/page-header/shared'
import { cn } from '@/utils/cn'
import { useShell } from '@/components/layout/shell-context'
import { deletePost } from '@/lib/actions/post-actions'
import { getMondayISO, getWeekRange, shiftDateKey, toDateKey } from '@/utils/date-helpers'
import { DAYS_PER_WEEK } from '@/utils/constants'
import {
  monthViewIn,
  monthViewOfWeek,
  nextMonthView,
  nextWeekView,
  prevMonthView,
  prevWeekView,
  weekViewIn,
  weekViewOfMonth,
  type MonthView,
  type WeekView,
} from '@/features/calendar/lib/calendar-range'
import { WeekGrid } from './week-grid'
import { ClientsView } from './clients-view'
import { buildClientWeek, buildWeekLanes } from '@/features/calendar/lib/week-model'
import { TabRail } from '@/components/layout/page-header/tab-rail'
import { MonthGrid } from './month-grid'
import { QueueRail } from './queue-rail'
import { ScheduleCard } from './schedule-card'
import type { CalendarPost } from '@/types/api'

/** Which unit the calendar is showing. */
type CalendarMode = 'week' | 'month' | 'clients'

interface CalendarViewProps {
  initialPosts: CalendarPost[]
  clients: ClientEntry[]
}

interface ApprovalButtonProps {
  icon: React.ElementType
  label: string
  loadingLabel: string
  loading: boolean
  disabled?: boolean
  disabledReason?: string
  clients: ClientEntry[]
  pickerOpen: boolean
  onTogglePicker: () => void
  onSelectClient: (id: string) => void
}

/** A rail utility that sends the week to a client, with a picker when several qualify. */
function ApprovalButton({
  icon: Icon,
  label,
  loadingLabel,
  loading,
  disabled,
  disabledReason,
  clients,
  pickerOpen,
  onTogglePicker,
  onSelectClient,
}: ApprovalButtonProps) {
  const isDisabled = disabled || loading

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          if (isDisabled) return
          if (clients.length === 1) {
            onSelectClient(clients[0]!.id)
          } else {
            onTogglePicker()
          }
        }}
        disabled={isDisabled}
        title={disabled ? disabledReason : undefined}
        className={cn(
          TOOL_ROW,
          'text-caption',
          isDisabled &&
            'cursor-not-allowed text-text3 opacity-60 hover:bg-transparent hover:text-text3'
        )}
      >
        <Icon className="size-3.5 shrink-0" />
        {loading ? loadingLabel : label}
      </button>

      {pickerOpen && clients.length > 1 && (
        <div className="absolute right-0 top-9 z-30 min-w-[180px] rounded-panel border border-line bg-surface py-1 shadow-pop">
          <p className="px-3 py-1.5 text-label font-semibold uppercase text-text3">Select client</p>
          {clients.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onSelectClient(c.id)}
              className="w-full px-3 py-2 text-left text-body text-ink transition-colors hover:bg-wash"
            >
              {c.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

/** Month navigation, inline with the title it moves. */
function MonthStepBtn({ onClick, direction }: { onClick: () => void; direction: 'prev' | 'next' }) {
  const Icon = direction === 'prev' ? ChevronLeft : ChevronRight
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={direction === 'prev' ? 'Previous month' : 'Next month'}
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
  // One piece of state, not two: stepping across a year boundary changes both, and splitting them
  // forced the month updater to call setYear from inside itself. Updaters must be pure — React
  // double-invokes them under StrictMode, so that fired twice and skipped a whole year.
  const [view, setView] = useState<MonthView>(() => monthViewIn(timezone))
  const { year, month } = view
  // The week is its own state rather than derived from the month: stepping weeks must
  // not drag the month grid around behind it, and a week straddles two months anyway.
  const [weekStart, setWeekStart] = useState<WeekView>(() => weekViewIn(timezone))
  const [mode, setMode] = useState<CalendarMode>('week')
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
    removePost,
    upsertPostImage,
    removePostImage,
    markPostPublished,
    saving,
  } = useCalendar(initialPosts)

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
  const activeIndex = filteredUnscheduled.findIndex((p) => p.id === activePostId)

  const stepBack = useCallback(
    () => (mode === 'month' ? setView(prevMonthView) : setWeekStart(prevWeekView)),
    [mode]
  )
  const stepForward = useCallback(
    () => (mode === 'month' ? setView(nextMonthView) : setWeekStart(nextWeekView)),
    [mode]
  )

  const goToToday = useCallback(() => {
    setView(monthViewIn(timezone))
    setWeekStart(weekViewIn(timezone))
  }, [timezone])

  // Switching views keeps the reader where they were. Opening Month from a week in
  // September lands on September; opening Week from a month lands on a week inside it,
  // unless the week already showing is in that month.
  const selectMode = useCallback(
    (next: CalendarMode) => {
      setMode(next)
      if (next === 'month') {
        setView(monthViewOfWeek(weekStart))
      } else {
        const weeksMonth = monthViewOfWeek(weekStart)
        if (weeksMonth.year !== year || weeksMonth.month !== month) {
          setWeekStart(weekViewOfMonth({ year, month }))
        }
      }
    },
    [weekStart, year, month]
  )

  const handlePanelPostClick = useCallback((post: CalendarPost) => {
    setActivePostId(post.id)
    setCardOpen(true)
  }, [])

  const handleGridPostClick = useCallback((postId: string) => {
    setActivePostId(postId)
    setCardOpen(true)
  }, [])

  const handleUnschedule = useCallback(
    (postId: string) => {
      void unschedulePost(postId)
      setCardOpen(false)
      setActivePostId(null)
    },
    [unschedulePost]
  )

  const closeCard = useCallback(() => {
    setCardOpen(false)
    setEditMode(false)
    setSlotPrefill(null)
  }, [])

  function handleNavPost(dir: 1 | -1) {
    const next = filteredUnscheduled[activeIndex + dir]
    if (next) setActivePostId(next.id)
  }

  async function handleSchedule(postId: string, scheduledAt: string, platform: string) {
    const idx = filteredUnscheduled.findIndex((p) => p.id === postId)
    await schedulePost(postId, scheduledAt, platform)
    setCardOpen(false)
    const nextPost = filteredUnscheduled[idx + 1]
    setActivePostId(nextPost?.id ?? null)
  }

  function handleSkip(postId: string) {
    setCardOpen(false)
    const idx = filteredUnscheduled.findIndex((p) => p.id === postId)
    const nextPost = filteredUnscheduled[idx + 1]
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
      setCardOpen(false)
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

  const { from: weekFrom, to: weekTo } = getWeekRange(weekStart, timezone)
  const scheduledThisWeek = filteredScheduled.filter(
    (post) => post.scheduled_at && post.scheduled_at >= weekFrom && post.scheduled_at < weekTo
  ).length

  // The deficit, surfaced in the rail so it is visible without opening the tab. Counts
  // clients who are behind their own target — a client with no cadence set has no target
  // to be behind, so they are not counted.
  const laneClients = useMemo(
    () =>
      clients.map((client) => ({
        id: client.id,
        name: client.name,
        // Instagram is the only platform the suggestion source is populated for today;
        // when a client carries a default platform this reads it instead.
        platform: 'Instagram',
        bestTimes: client.best_times,
      })),
    [clients]
  )

  /**
   * Placing into a suggested slot: open the dialog the product already has, with the
   * client, date and time filled in. The stepper scopes to that client, because stepping
   * the whole agency backlog from one client's slot offers posts it cannot take.
   */
  const handleSlotClick = useCallback(
    (slot: { clientName: string; at: string }) => {
      const client = clients.find((c) => c.name === slot.clientName)
      if (!client) return
      const firstWaiting = filteredUnscheduled.find((p) => p.client_id === client.id)
      setSlotPrefill({ clientId: client.id, at: slot.at })
      setActivePostId(firstWaiting?.id ?? null)
      setCardOpen(true)
    },
    [clients, filteredUnscheduled]
  )

  const clientsBehind = useMemo(() => {
    const lanes = buildWeekLanes({
      posts: filteredScheduled,
      clients: laneClients,
      weekStartISO: weekStart,
      timeZone: timezone,
      now: new Date(),
    })
    return clients.filter((client) => {
      if (client.posts_per_week <= 0) return false
      const { verdict } = buildClientWeek({
        clientId: client.id,
        lanes,
        weekStartISO: weekStart,
        target: client.posts_per_week,
      })
      return verdict === 'Dark this week' || verdict.endsWith('short')
    }).length
  }, [clients, laneClients, filteredScheduled, weekStart, timezone])

  /** "3 – 9 August 2026", collapsing the month when both ends share one. */
  const weekRangeLabel = (() => {
    const end = shiftDateKey(weekStart, DAYS_PER_WEEK - 1)
    const [startYear, startMonth, startDay] = weekStart.split('-').map(Number)
    const [endYear, endMonth, endDay] = end.split('-').map(Number)
    const startPart =
      startMonth === endMonth ? `${startDay}` : `${startDay} ${MONTH_NAMES[startMonth! - 1]}`
    const yearPart = startYear === endYear ? `${endYear}` : `${startYear} – ${endYear}`
    return `${startPart} – ${endDay} ${MONTH_NAMES[endMonth! - 1]} ${yearPart}`
  })()

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
            {mode === 'month' ? `${MONTH_NAMES[month]} ${year}` : weekRangeLabel}
            <span className="inline-flex items-center gap-0.5">
              <MonthStepBtn onClick={stepBack} direction="prev" />
              <MonthStepBtn onClick={stepForward} direction="next" />
            </span>
          </>
        }
        railTools={
          clients.length > 0 ? (
            <>
              <ApprovalButton
                icon={Link}
                label="Copy link"
                loadingLabel="Generating..."
                loading={copyLinkSending}
                disabled={noPostsThisWeek}
                disabledReason="No posts scheduled this week"
                clients={currentWeekClients}
                pickerOpen={copyLinkPicker}
                onTogglePicker={() => setCopyLinkPicker((v: boolean) => !v)}
                onSelectClient={(id) => {
                  void handleCopyLink(id)
                }}
              />
              <ApprovalButton
                icon={Mail}
                label="Email client"
                loadingLabel="Sending..."
                loading={emailSending}
                disabled={noPostsThisWeek}
                disabledReason="No posts scheduled this week"
                clients={currentWeekClients}
                pickerOpen={emailPicker}
                onTogglePicker={() => setEmailPicker((v: boolean) => !v)}
                onSelectClient={(id) => {
                  void handleEmailClient(id)
                }}
              />
            </>
          ) : null
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
            <Button variant="secondary" size="sm" onClick={goToToday}>
              Today
            </Button>
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
          </>
        }
      />

      <div className="flex min-h-0 flex-1">
        <div className="flex min-h-0 flex-1 flex-col px-2 pb-[18px] pt-2.5 md:px-[18px]">
        {mode === 'week' ? (
          <WeekGrid
            weekStartISO={weekStart}
            scheduledPosts={filteredScheduled}
            clients={laneClients}
            timeZone={timezone}
            onPostClick={handleGridPostClick}
            onSlotClick={handleSlotClick}
          />
        ) : mode === 'clients' ? (
          <ClientsView
            clients={clients}
            laneClients={laneClients}
            scheduledPosts={filteredScheduled}
            weekStartISO={weekStart}
            timeZone={timezone}
          />
        ) : (
          <MonthGrid
            year={year}
            month={month}
            timeZone={timezone}
            scheduledPosts={filteredScheduled}
            onPostClick={handleGridPostClick}
          />
        )}
        </div>

        {/* Docked, not floating: a sibling of the grid rather than a layer over it. */}
        <div className="hidden md:flex">
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
      </div>

      <ScheduleCard
        post={activePost}
        timeZone={timezone}
        slotPrefill={slotPrefill}
        postIndex={activeIndex}
        totalPosts={filteredUnscheduled.length}
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
        approvalSending={approvalSending}
        isScheduling={saving}
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
