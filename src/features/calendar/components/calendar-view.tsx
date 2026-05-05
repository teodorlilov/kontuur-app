'use client'

import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Link, Mail } from 'lucide-react'
import { useCalendar } from '@/features/calendar/hooks/use-calendar'
import { useApproval, type ClientEntry } from '@/features/calendar/hooks/use-approval'
import { toast } from '@/components/ui/toast'
import { deletePost } from '@/lib/actions/post-actions'
import { CalendarTopbar } from './calendar-topbar'
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
    <div style={{ position: 'relative' }}>
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
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          fontSize: 10,
          fontWeight: 500,
          color: isDisabled ? 'var(--color-muted)' : 'var(--color-terracotta)',
          background: isDisabled ? 'rgba(44,62,80,0.05)' : 'rgba(192,123,85,0.10)',
          border: isDisabled ? '0.5px solid var(--color-border-2)' : '0.5px solid rgba(192,123,85,0.25)',
          borderRadius: 6,
          padding: '5px 10px',
          cursor: isDisabled ? 'not-allowed' : 'pointer',
          fontFamily: 'inherit',
          transition: 'all 0.15s',
          opacity: isDisabled ? 0.5 : 1,
        }}
      >
        <Icon style={{ width: 12, height: 12 }} />
        {loading ? loadingLabel : label}
      </button>

      {pickerOpen && clients.length > 1 && (
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: 32,
            background: '#fff',
            borderRadius: 8,
            border: '0.5px solid var(--color-border-1)',
            boxShadow: '0 8px 24px rgba(44,62,80,0.12)',
            zIndex: 30,
            padding: '4px 0',
            minWidth: 180,
          }}
        >
          <p style={{ padding: '6px 12px', fontSize: 10, color: 'var(--color-muted)', fontWeight: 500 }}>
            Select client
          </p>
          {clients.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onSelectClient(c.id)}
              style={{
                width: '100%',
                textAlign: 'left',
                padding: '8px 12px',
                fontSize: 12,
                color: 'var(--color-text-1)',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'inherit',
                transition: 'background 0.1s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-overlay)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function CalendarView({ initialPosts, clients }: CalendarViewProps) {
  const now = new Date()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
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
    markPostPublished,
    saving,
  } = useCalendar(initialPosts)

  // Auto-open modal in edit mode when navigated from dashboard with ?editPost=<id>
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
    () => selectedClientId
      ? unscheduledPosts.filter((p) => p.client_id === selectedClientId)
      : unscheduledPosts,
    [unscheduledPosts, selectedClientId],
  )
  const filteredScheduled = useMemo(
    () => selectedClientId
      ? scheduledPosts.filter((p) => p.client_id === selectedClientId)
      : scheduledPosts,
    [scheduledPosts, selectedClientId],
  )

  // Active post — search all posts so both grid and panel clicks work
  const activePost = allPosts.find((p) => p.id === activePostId) ?? null
  const activeIndex = filteredUnscheduled.findIndex((p) => p.id === activePostId)

  const prevMonth = useCallback(() => {
    setMonth((m) => {
      if (m === 0) { setYear((y) => y - 1); return 11 }
      return m - 1
    })
  }, [])

  const nextMonth = useCallback(() => {
    setMonth((m) => {
      if (m === 11) { setYear((y) => y + 1); return 0 }
      return m + 1
    })
  }, [])

  const goToToday = useCallback(() => {
    const t = new Date()
    setYear(t.getFullYear())
    setMonth(t.getMonth())
  }, [])

  const handlePanelPostClick = useCallback((post: CalendarPost) => {
    setActivePostId(post.id)
    setCardOpen(true)
  }, [])

  const handleGridPostClick = useCallback((postId: string) => {
    setActivePostId(postId)
    setCardOpen(true)
  }, [])

  const handleUnschedule = useCallback((postId: string) => {
    void unschedulePost(postId)
    setCardOpen(false)
    setActivePostId(null)
  }, [unschedulePost])

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

  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--color-page)',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <CalendarTopbar
        year={year}
        month={month}
        onPrevMonth={prevMonth}
        onNextMonth={nextMonth}
        onToday={goToToday}
        selectedClientId={selectedClientId}
        clients={clients}
        onClientChange={setSelectedClientId}
      />

      {/* Approval buttons row — always visible when clients exist */}
      {clients.length > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 6,
            padding: '8px 22px 0',
            flexShrink: 0,
          }}
        >
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
            onSelectClient={(id) => { void handleCopyLink(id) }}
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
            onSelectClient={(id) => { void handleEmailClient(id) }}
          />
        </div>
      )}

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
        onDelete={(id) => { void handleDeletePost(id) }}
        onSendApproval={(id) => { void handleSendApproval(id) }}
        approvalSending={approvalSending}
        isScheduling={saving}
        editMode={editMode}
        onExitEditMode={() => setEditMode(false)}
        onSaveContent={handleSaveContent}
        onSaveAndResend={handleSaveAndResend}
        onPublished={markPostPublished}
      />
    </div>
  )
}
