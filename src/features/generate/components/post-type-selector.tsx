'use client'

import { cn } from '@/utils/cn'
import type { PostType } from '@/types/api'

interface PostTypeSelectorProps {
  value: PostType
  slideCount: number
  platform: string
  onChange: (type: PostType) => void
  onSlideCountChange: (count: number) => void
}

export function PostTypeSelector({
  value,
  slideCount,
  platform,
  onChange,
  onSlideCountChange,
}: PostTypeSelectorProps) {
  const isInstagram = platform === 'Instagram'

  const options: Array<{ type: PostType; label: string; sub: string; icon: string }> = [
    { type: 'single', label: 'Single image', sub: 'One polished caption', icon: '📸' },
    ...(isInstagram
      ? [
          {
            type: 'carousel' as PostType,
            label: 'Carousel',
            sub: 'Multiple slides with rich content',
            icon: '🎠',
          },
          {
            type: 'reels' as PostType,
            label: 'Reels script',
            sub: '15–60 second spoken script',
            icon: '🎬',
          },
        ]
      : []),
  ]

  return (
    <div className="flex flex-col gap-5">
      {isInstagram && (
        <div className="bg-brand-purple-light border border-brand-purple/20 rounded-lg px-5 py-3">
          <p className="text-sm text-brand-purple font-medium">
            Carousels drive the highest engagement in 2026. Recommended: 2 carousels + 1 single per
            week.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {options.map((opt) => (
          <button
            key={opt.type}
            type="button"
            onClick={() => onChange(opt.type)}
            className={cn(
              'text-left px-5 py-4 rounded-lg border transition-colors flex items-start gap-4',
              value === opt.type
                ? 'border-brand-purple bg-brand-purple-light'
                : 'border-gray-200 hover:border-gray-300 bg-white'
            )}
          >
            <span className="text-xl mt-0.5">{opt.icon}</span>
            <div>
              <span
                className={cn(
                  'text-base font-medium block',
                  value === opt.type ? 'text-brand-purple' : 'text-gray-800'
                )}
              >
                {opt.label}
              </span>
              <span className="text-sm text-gray-400 mt-0.5 block">{opt.sub}</span>
            </div>
          </button>
        ))}
      </div>

      {value === 'carousel' && (
        <div className="flex items-center gap-3">
          <label className="text-base font-medium text-gray-700">Slide count</label>
          <input
            type="number"
            min={3}
            max={10}
            value={slideCount}
            onChange={(e) => onSlideCountChange(parseInt(e.target.value, 10))}
            className="w-20 rounded-lg border border-gray-300 px-4 py-3 text-base text-gray-900 focus:border-brand-purple focus:outline-none focus:ring-1 focus:ring-brand-purple"
          />
          <span className="text-sm text-gray-400">3–10 slides</span>
        </div>
      )}
    </div>
  )
}
