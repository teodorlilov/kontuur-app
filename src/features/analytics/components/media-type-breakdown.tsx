import type { AnalyticsMetrics } from '@/types/api'

interface MediaTypeBreakdownProps {
  metrics: AnalyticsMetrics
}

function formatType(type: string): string {
  if (type === 'CAROUSEL_ALBUM') return 'Carousel'
  if (type === 'REELS') return 'Reels'
  if (type === 'VIDEO') return 'Video'
  if (type === 'IMAGE') return 'Image'
  return type
}

const TYPE_COLORS: Record<string, string> = {
  CAROUSEL_ALBUM: '#534AB7',
  REELS: '#7c6fd0',
  VIDEO: '#9b8fe0',
  IMAGE: '#c4bff0',
  Post: '#534AB7',
}

export function MediaTypeBreakdown({ metrics }: MediaTypeBreakdownProps) {
  const breakdown = metrics.media_type_breakdown
  if (!breakdown || breakdown.length < 2) return null

  const maxRate = Math.max(...breakdown.map((b) => b.avg_engagement_rate), 0.01)

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-medium text-gray-700">Performance by media type</p>
        <p className="text-xs text-gray-400">avg engagement rate</p>
      </div>
      <div className="space-y-3">
        {breakdown.map((item) => {
          const color = TYPE_COLORS[item.type] ?? '#534AB7'
          const widthPct = Math.round((item.avg_engagement_rate / maxRate) * 100)
          return (
            <div key={item.type} className="flex items-center gap-3">
              <span className="text-xs text-gray-600 w-16 shrink-0 text-right">{formatType(item.type)}</span>
              <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${widthPct}%`, backgroundColor: color }}
                />
              </div>
              <span className="text-xs font-medium text-gray-700 w-10 shrink-0">{item.avg_engagement_rate}%</span>
            </div>
          )
        })}
      </div>
      <p className="text-xs text-gray-400 mt-3">
        {breakdown.reduce((s, b) => s + b.count, 0)} posts analysed
      </p>
    </div>
  )
}
