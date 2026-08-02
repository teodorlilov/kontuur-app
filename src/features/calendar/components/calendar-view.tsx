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
import { monthViewIn, nextMonthView, prevMonthView, type MonthView } from '../helpers'
import { MonthGrid } from './month-grid'
import { ScheduleFab } from './schedule-fab'
import { UnscheduledPanel } from './unscheduled-panel'
import { ScheduleCard } from './schedule-card'
import type { CalendarPost } from '@/types/api'

const noop = () => {}

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
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const [cardOpen, setCardOpen] = useState(false)
  const [activePostId, setActivePostId] = useState<string | null>(null)
  const [editMode, setEditMode] = useState(false)
  const editParamProcessed = useRef(false)

  const {
    posts: allPosts,
    unscheduledPosts,
    scheduledPosts,
    schedulePost,
    unschedulePost,
    updatePostContent,
    handleDrop,
    removePost,
    upsertPostImage,
    removePostImage,
    markPostPublished,
    saving,
  } = useCalendar(initialPosts)

  // Auto-open modal in edit mode when navigated from dashboard with ?editPost=<id>.
  // Genuinely an effect, not a render-time adjustment: it consumes a one-shot URL param and
  // navigates to clear it, which is a side effect and must not run during render.
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

  const prevMonth = useCallback(() => setView(prevMonthView), [])
  const nextMonth = useCallback(() => setView(nextMonthView), [])

  const goToToday = useCallback(() => setView(monthViewIn(timezone)), [timezone])

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
  }, [])
  const closePanel = useCallback(() => setPanelOpen(false), [])
  const togglePanel = useCallback(() => setPanelOpen((v) => !v), [])

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
  } = useApproval({ clients, filteredScheduled, allPosts })

  async function handleSaveAndResend(
    postId: string,
    updates: { caption?: string; slides_json?: unknown }
  ) {
    const ok = await updatePostContent(postId, updates)
    if (!ok) return
    void handleSendApproval(postId)
    setEditMode(false)
  }

  // Scoped to the month on screen, so the figure matches the grid beneath it.
  const scheduledThisMonth = filteredScheduled.filter((post) => {
    if (!post.scheduled_at) return false
    const at = new Date(post.scheduled_at)
    return at.getFullYear() === year && at.getMonth() === month
  }).length

  return (
    <div className="relative flex min-h-full flex-col">
      <PageHeader
        crumb={[{ label: 'Calendar' }]}
        // The month is the title and "Calendar" demotes to the crumb — the way
        // every calendar already behaves.
        title={
          <>
            {MONTH_NAMES[month]} {year}
            <span className="inline-flex items-center gap-0.5">
              <MonthStepBtn onClick={prevMonth} direction="prev" />
              <MonthStepBtn onClick={nextMonth} direction="next" />
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
              `${scheduledThisMonth} scheduled this month`,
              filteredUnscheduled.length > 0 && (
                <MetaFlag>{filteredUnscheduled.length} waiting to be scheduled</MetaFlag>
              ),
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

      <MonthGrid
        year={year}
        month={month}
        scheduledPosts={filteredScheduled}
        onPostClick={handleGridPostClick}
        onDayClick={noop}
        onDrop={handleDrop}
      />

      <ScheduleFab
        unscheduledCount={filteredUnscheduled.length}
        isOpen={panelOpen}
        onClick={togglePanel}
      />

      <UnscheduledPanel
        posts={filteredUnscheduled}
        isOpen={panelOpen}
        activePostId={activePostId}
        onPostClick={handlePanelPostClick}
        onClose={closePanel}
      />

      <ScheduleCard
        post={activePost}
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
