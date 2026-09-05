import type { DashboardChangeRequest } from '@/types/api'

/** Tone of the small pill on a dashboard stat card. */
export type StatPillTone = 'positive' | 'attention' | 'muted' | 'accent' | 'danger'

export interface DashboardBriefing {
  briefing_text: string | null
  action_nudge: string | null
  weekly_tip: string | null
  platform_updates: string[] | null
  week_start: string | null
  coaching_points: string[] | null
}

export interface PendingPostPreview {
  id: string
  /** Nullable, like the column. The row type claimed otherwise and the preview line trusted it. */
  caption: string | null
  pillar: string
  createdAt: string
  clientName: string
  imageUrl: string | null
}

export interface DashboardMetrics {
  /** null means the query failed — the dashboard must not render that as 0. */
  scheduledThisWeek: number | null
  pendingCount: number
  /** Oldest pending post's created_at, or null when the queue is empty. */
  oldestPendingAt: string | null
  clientPendingMap: Record<string, number>
  clientsAddedThisMonth: number
  connectedClientCount: number
}

/** A publish the cron will attempt, soonest first. */
export interface UpcomingPublish {
  id: string
  clientName: string
  scheduledAt: string
}

/** A publish the cron already attempted and lost. */
export interface FailedPublish {
  id: string
  clientName: string
  scheduledAt: string | null
}

/** Everything the dashboard page renders. */
export interface DashboardData {
  metrics: DashboardMetrics
  briefing: DashboardBriefing | null
  pendingPosts: PendingPostPreview[]
  changeRequests: DashboardChangeRequest[]
  upcomingPublishes: UpcomingPublish[]
  failedPublishes: FailedPublish[]
}
