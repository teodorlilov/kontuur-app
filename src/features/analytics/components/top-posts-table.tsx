import Image from 'next/image'
import type { AnalyticsMetrics, IGPost, FBPost } from '@/types/api'
import { typeColorStyle, formatType } from '../utils/media-type'

interface TopPostsTableProps {
  metrics: AnalyticsMetrics
  limit?: number
}

export function TopPostsTable({ metrics, limit = 5 }: TopPostsTableProps) {
  if (metrics.platform === 'instagram') {
    const posts = [...(metrics.posts as IGPost[])]
      .sort((a, b) => (b.reach ?? 0) - (a.reach ?? 0))
      .slice(0, limit)

    if (posts.length === 0) return null

    const followers = metrics.account.followers_count || 1

    return (
      <div className="bg-surface rounded-xl border border-line p-5">
        <p className="text-body font-medium text-text2 mb-4">Top posts by reach</p>
        <div className="space-y-3">
          {posts.map((post, idx) => {
            const engagements = post.like_count + post.comments_count
            const denominator = post.reach && post.reach > 0 ? post.reach : followers
            const engagementRate = Math.round((engagements / denominator) * 1000) / 10
            const saveRate =
              post.reach && post.reach > 0
                ? Math.round(((post.saved ?? 0) / post.reach) * 1000) / 10
                : null
            return (
              <div
                key={post.id}
                className="flex items-center gap-3 py-2 border-b border-line last:border-0"
              >
                <span className="text-caption font-medium text-text3 w-4 shrink-0">{idx + 1}</span>
                {post.thumbnail_url ? (
                  <Image
                    src={post.thumbnail_url}
                    alt=""
                    width={40}
                    height={40}
                    className="w-10 h-10 rounded object-cover shrink-0"
                  />
                ) : (
                  <div
                    className="w-10 h-10 rounded shrink-0 flex items-center justify-center text-label font-semibold text-white"
                    style={typeColorStyle(post.media_type)}
                  >
                    {formatType(post.media_type).slice(0, 3).toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0 overflow-hidden">
                  {post.permalink ? (
                    <a
                      href={post.permalink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-body text-ink truncate hover:underline block"
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = 'var(--spring-text)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = ''
                      }}
                    >
                      {post.caption ?? '(no caption)'}
                    </a>
                  ) : (
                    <p className="text-body text-ink truncate">{post.caption ?? '(no caption)'}</p>
                  )}
                  <p className="text-caption text-text3 mt-0.5">
                    {new Date(post.timestamp).toLocaleDateString()} · {formatType(post.media_type)}
                  </p>
                </div>
                <div className="flex gap-4 text-right shrink-0">
                  {saveRate !== null && (
                    <div>
                      <p className="text-caption font-semibold text-ink">{saveRate}%</p>
                      <p className="text-caption text-text3">saved</p>
                    </div>
                  )}
                  <div>
                    <p className="text-caption font-medium text-text2">{engagementRate}%</p>
                    <p className="text-caption text-text3">eng.</p>
                  </div>
                  <div>
                    <p className="text-caption font-medium text-text2">
                      {(post.reach ?? 0).toLocaleString()}
                    </p>
                    <p className="text-caption text-text3">reach</p>
                  </div>
                  {(post.shares ?? 0) > 0 && (
                    <div>
                      <p className="text-caption font-medium text-text2">
                        {(post.shares ?? 0).toLocaleString()}
                      </p>
                      <p className="text-caption text-text3">shares</p>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // Facebook
  const posts = [...(metrics.posts as FBPost[])]
    .sort((a, b) => {
      const erA = (a.reactions + a.comments + a.shares) / ((a.reach ?? 0) || 1)
      const erB = (b.reactions + b.comments + b.shares) / ((b.reach ?? 0) || 1)
      return erB - erA
    })
    .slice(0, limit)

  if (posts.length === 0) return null

  const fans = metrics.account.fan_count || 1

  return (
    <div className="bg-surface rounded-xl border border-line p-5">
      <p className="text-body font-medium text-text2 mb-4">Top posts by engagement</p>
      <div className="space-y-3">
        {posts.map((post, idx) => {
          const engagements = post.reactions + post.comments + post.shares
          const engagementRate = Math.round((engagements / fans) * 1000) / 10
          return (
            <div
              key={post.id}
              className="flex items-center gap-3 py-2 border-b border-line last:border-0"
            >
              <span className="text-caption font-medium text-text3 w-4 shrink-0">{idx + 1}</span>
              <div className="w-10 h-10 rounded shrink-0 flex items-center justify-center text-label font-semibold text-white bg-spring">
                POST
              </div>
              <div className="flex-1 min-w-0 overflow-hidden">
                <p className="text-body text-ink truncate">{post.message ?? '(no text)'}</p>
                <p className="text-caption text-text3 mt-0.5">
                  {new Date(post.created_time).toLocaleDateString()}
                </p>
              </div>
              <div className="flex gap-4 text-right shrink-0">
                <div>
                  <p className="text-caption font-semibold text-ink">{engagementRate}%</p>
                  <p className="text-caption text-text3">eng.</p>
                </div>
                <div>
                  <p className="text-caption font-medium text-text2">
                    {(post.reach ?? 0).toLocaleString()}
                  </p>
                  <p className="text-caption text-text3">reach</p>
                </div>
                <div>
                  <p className="text-caption font-medium text-text2">
                    {post.shares.toLocaleString()}
                  </p>
                  <p className="text-caption text-text3">shares</p>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
