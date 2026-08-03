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
            // A quiet emphasis panel — Wash is the documented tint behind Deep
            // Pine text. It was a terracotta wash with terracotta-dark ink.
            background: 'var(--wash)',
            border: '1px solid var(--line)',
            borderRadius: 'var(--radius-md)',
            padding: '10px 14px',
          }}
        >
          <p style={{ fontSize: 'var(--text-caption)', color: 'var(--forest)', lineHeight: 1.55 }}>
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
              // Selected is an active state: Deep Pine edge on Wash. Not lime —
              // a 4% tint cannot carry it, and the plate would need dark ink.
              value === opt.type
                ? 'border-forest bg-wash'
                : 'border-line2 bg-surface hover:border-text3/45'
            )}
          >
            <span className="text-headline mt-0.5">{opt.icon}</span>
            <div>
              <span
                className={cn(
                  'text-body font-medium block',
                  value === opt.type ? 'text-[var(--ink)]' : 'text-ink'
                )}
              >
                {opt.label}
              </span>
              <span className="text-body text-text3 mt-0.5 block">{opt.sub}</span>
            </div>
          </button>
        ))}
      </div>

      {value === 'carousel' && (
        <div className="flex items-center gap-3">
          <label className="text-body font-medium text-text2">Slide count</label>
          <input
            type="number"
            min={3}
            max={10}
            value={slideCount}
            // Clearing the field yields '', and parseInt('') is NaN — which React then rejects as
            // a `value`. Only a real number is propagated; an empty field keeps the last one.
            onChange={(e) => {
              const next = parseInt(e.target.value, 10)
              if (!Number.isNaN(next)) onSlideCountChange(next)
            }}
            className="w-20 rounded-lg border border-line2 px-4 py-3 text-lead md:text-body text-ink focus:border-[var(--line2)] focus:outline-none focus:ring-1 focus:ring-[var(--line2)]"
          />
          <span className="text-body text-text3">3–10 slides</span>
        </div>
      )}
    </div>
  )
}
