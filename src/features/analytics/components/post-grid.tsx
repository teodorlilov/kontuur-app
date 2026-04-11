import type { AnalyticsMetrics, IGPost } from '@/types/api'
import { typeColor, formatType } from '../utils/media-type'

interface PostGridProps {
  metrics: AnalyticsMetrics
}

export function PostGrid({ metrics }: PostGridProps) {
  if (metrics.platform !== 'instagram') return null

  const posts = metrics.posts as IGPost[]
  if (posts.length === 0) return null

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <p className="text-sm font-medium text-gray-700 mb-4">All posts</p>
      <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-2">
        {posts.map((post) => {
          const saveRate =
            post.reach && post.reach > 0 && post.saved != null
              ? Math.round((post.saved / post.reach) * 1000) / 10
              : null
          return (
            <a
              key={post.id}
              href={post.permalink ?? undefined}
              target="_blank"
              rel="noopener noreferrer"
              className="relative aspect-square rounded-lg overflow-hidden bg-gray-100 block group"
            >
              {post.thumbnail_url ? (
                <img src={post.thumbnail_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <div
                  className={`w-full h-full flex items-center justify-center text-xs font-semibold text-white ${typeColor(post.media_type)}`}
                >
                  {formatType(post.media_type)}
                </div>
              )}
              {/* Media type badge */}
              <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded text-[9px] font-medium bg-black/50 text-white leading-none">
                {formatType(post.media_type)}
              </span>
              {/* Save rate badge */}
              {saveRate !== null && (
                <span className="absolute bottom-1.5 left-1.5 px-1 py-0.5 rounded text-[9px] font-medium bg-black/40 text-white leading-none">
                  {saveRate}% saved
                </span>
              )}
            </a>
          )
        })}
      </div>
    </div>
  )
}
