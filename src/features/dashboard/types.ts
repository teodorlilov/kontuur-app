import type { DashboardChangeRequest } from '@/types/api'
import type { BriefingItem } from '@/ai/intelligence/schema'
import type { Tables } from '@/types'

/** Tone of the small pill on a dashboard stat card. */
export type StatPillTone = 'positive' | 'attention' | 'muted' | 'accent' | 'danger'

/**
 * The week's brief as the bar renders it: which week, and the verified changes. Derived from the
 * row so the column cannot drift; `items` is the parsed jsonb, typed by the schema that wrote it.
 */
export type DashboardBriefing = Pick<Tables<'intelligence_briefings'>, 'week_start'> & {
  items: BriefingItem[]
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

/** Everything the dashboard page renders about the agency; the brief is global and read beside it. */
export interface DashboardData {
  metrics: DashboardMetrics
  pendingPosts: PendingPostPreview[]
  changeRequests: DashboardChangeRequest[]
  upcomingPublishes: UpcomingPublish[]
  failedPublishes: FailedPublish[]
}
