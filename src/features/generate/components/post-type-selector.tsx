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
        ]
      : []),
  ]

  return (
    <div className="flex flex-col gap-5">
      {isInstagram && (
        <div
          style={{
            background: 'rgba(192,123,85,0.10)',
            border: '1px solid rgba(192,123,85,0.20)',
            borderRadius: '9px',
            padding: '10px 14px',
          }}
        >
          <p style={{ fontSize: '12px', color: '#7A4A35', lineHeight: 1.55 }}>
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
                ? 'border-[var(--color-terracotta)] bg-[rgba(192,123,85,0.04)]'
                : 'border-gray-200 hover:border-gray-300 bg-white'
            )}
          >
            <span className="text-xl mt-0.5">{opt.icon}</span>
            <div>
              <span
                className={cn(
                  'text-base font-medium block',
                  value === opt.type ? 'text-[var(--color-text-1)]' : 'text-gray-800'
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
            className="w-20 rounded-lg border border-gray-300 px-4 py-3 text-base text-gray-900 focus:border-[var(--color-border-3)] focus:outline-none focus:ring-1 focus:ring-[var(--color-border-3)]"
          />
          <span className="text-sm text-gray-400">3–10 slides</span>
        </div>
      )}
    </div>
  )
}
