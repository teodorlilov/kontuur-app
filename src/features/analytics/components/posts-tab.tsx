'use client'

import type { AnalyticsMetrics, IGPost, FBPost } from '@/types/api'
import { MetricCard } from '@/components/ui/metric-card'
import { AiSummaryStrip } from './ai-summary-strip'
import { PostDayBreakdown } from './post-day-breakdown'
import { TopPostsTable } from './top-posts-table'
import { PostGrid } from './post-grid'

interface PostsTabProps {
  metrics: AnalyticsMetrics
  aiSummary: string
}

/** Posts tab — AI summary, 4 metric cards, best day chart, full posts table. */
export function PostsTab({ metrics, aiSummary }: PostsTabProps) {
  const { summary } = metrics
  const { totalLikes, avgReachPerPost } = computePostMetrics(metrics)

  return (
    <div className="space-y-6">
      <AiSummaryStrip summary={aiSummary} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Avg engagement rate"
          value={`${summary.avg_engagement_rate}%`}
          delta={`across ${summary.posts_published} posts`}
          deltaType="neutral"
          accentColor="var(--accent-m1)"
        />
        <MetricCard
          label="Total likes"
          value={totalLikes.toLocaleString()}
          delta="↑ in selected period"
          deltaType="positive"
          accentColor="var(--accent-m2)"
        />
        <MetricCard
          label="Avg reach per post"
          value={avgReachPerPost > 0 ? avgReachPerPost.toLocaleString() : '—'}
          delta={`across ${summary.posts_published} posts`}
          deltaType="neutral"
          accentColor="var(--accent-m3)"
        />
        <MetricCard
          label="Avg save rate"
          value={summary.avg_save_rate > 0 ? `${summary.avg_save_rate}%` : '—'}
          delta="saves / reach per post"
          deltaType="neutral"
          accentColor="var(--accent-m4)"
        />
        {summary.total_shares > 0 && (
          <MetricCard
            label="Total shares"
            value={summary.total_shares.toLocaleString()}
            delta="in selected period"
            deltaType="neutral"
            accentColor="var(--accent-m1)"
          />
        )}
      </div>

      <PostDayBreakdown metrics={metrics} />
      <TopPostsTable metrics={metrics} />
      <PostGrid metrics={metrics} />
    </div>
  )
}

function computePostMetrics(metrics: AnalyticsMetrics): { totalLikes: number; avgReachPerPost: number } {
  const igPosts = metrics.platform === 'instagram' ? (metrics.posts as IGPost[]) : []
  const fbPosts = metrics.platform === 'facebook' ? (metrics.posts as FBPost[]) : []

  const totalLikes =
    metrics.platform === 'instagram'
      ? igPosts.reduce((s, p) => s + p.like_count, 0)
      : fbPosts.reduce((s, p) => s + p.reactions, 0)

  const totalReach =
    metrics.platform === 'instagram'
      ? igPosts.reduce((s, p) => s + (p.reach ?? 0), 0)
      : fbPosts.reduce((s, p) => s + (p.reach ?? 0), 0)

  const avgReachPerPost =
    metrics.summary.posts_published > 0
      ? Math.round(totalReach / metrics.summary.posts_published)
      : 0

  return { totalLikes, avgReachPerPost }
}
