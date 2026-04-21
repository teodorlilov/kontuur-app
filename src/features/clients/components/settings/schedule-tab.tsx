'use client'

import { cn } from '@/utils/cn'
import { Select } from '@/components/ui/select'
import { PanelHeader } from './basic-info-tab'
import { PLATFORMS, WEEKDAY_OPTIONS, CAROUSEL_SLIDE_OPTIONS } from '@/utils/constants'

const POSTS_OPTIONS = [1, 2, 3, 4, 5, 6, 7].map((n) => ({
  value: String(n),
  label: String(n),
}))

const POST_TYPE_OPTIONS = [
  { value: 'single', label: 'Single image' },
  { value: 'carousel', label: 'Carousel' },
]

const SLIDE_OPTIONS = CAROUSEL_SLIDE_OPTIONS.map((n) => ({
  value: String(n),
  label: `${n} slides`,
}))

interface ScheduleTabProps {
  activePlatform: string
  defaultPostType: string
  defaultCarouselSlides: string
  freqValue: string
  autoDay: string
  onActivePlatformChange: (v: string) => void
  onDefaultPostTypeChange: (v: string) => void
  onDefaultCarouselSlidesChange: (v: string) => void
  onFreqValueChange: (v: string) => void
  onAutoDayChange: (v: string) => void
}

/** Schedule tab: platform, post type, and autonomous generation settings. */
export function ScheduleTab({
  activePlatform,
  defaultPostType,
  defaultCarouselSlides,
  freqValue,
  autoDay,
  onActivePlatformChange,
  onDefaultPostTypeChange,
  onDefaultCarouselSlidesChange,
  onFreqValueChange,
  onAutoDayChange,
}: ScheduleTabProps) {
  return (
    <>
      <PanelHeader
        title="Schedule"
        subtitle="Platform, post type, and autonomous generation settings"
      />
      <div style={{ padding: '20px 22px' }}>
        {/* Platform selector */}
        <div style={{ marginBottom: 20 }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 500,
              color: 'var(--color-text-2)',
              letterSpacing: '0.01em',
              marginBottom: 10,
            }}
          >
            Active platform
          </div>
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
            {PLATFORMS.map((platform) => (
              <button
                key={platform}
                type="button"
                onClick={() => onActivePlatformChange(platform)}
                className={cn(
                  'px-4 py-2 rounded-full text-sm font-medium border transition-colors',
                  activePlatform === platform
                    ? 'bg-[var(--color-brand)] text-[var(--color-text-inv)] border-[var(--color-brand)]'
                    : 'bg-[var(--color-surface)] text-[var(--color-muted)] border-[var(--color-border-2)] hover:border-[var(--color-border-3)]'
                )}
                style={{ fontFamily: 'inherit' }}
              >
                {platform}
              </button>
            ))}
          </div>
        </div>

        {/* Post defaults — only for Instagram */}
        {activePlatform === 'Instagram' && (
          <div style={{ marginBottom: 20 }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: defaultPostType === 'carousel' ? '1fr 1fr' : '1fr',
                gap: 12,
                maxWidth: defaultPostType === 'carousel' ? undefined : 220,
              }}
            >
              <Select
                label="Default post type"
                value={defaultPostType}
                onChange={(e) => onDefaultPostTypeChange(e.target.value)}
                options={POST_TYPE_OPTIONS}
              />
              {defaultPostType === 'carousel' && (
                <Select
                  label="Default carousel slides"
                  value={defaultCarouselSlides}
                  onChange={(e) => onDefaultCarouselSlidesChange(e.target.value)}
                  options={SLIDE_OPTIONS}
                />
              )}
            </div>
          </div>
        )}

        {/* Autonomous schedule */}
        <div
          style={{
            borderTop: '0.5px solid var(--color-border-1)',
            paddingTop: 18,
            marginTop: 4,
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 500,
              color: 'var(--color-text-2)',
              letterSpacing: '0.01em',
              marginBottom: 12,
            }}
          >
            Autonomous schedule
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 12,
            }}
          >
            <Select
              label="How many posts"
              value={freqValue}
              onChange={(e) => onFreqValueChange(e.target.value)}
              options={POSTS_OPTIONS}
            />
            <Select
              label="Generate on"
              value={autoDay}
              onChange={(e) => onAutoDayChange(e.target.value)}
              options={[...WEEKDAY_OPTIONS]}
            />
          </div>
        </div>
      </div>
    </>
  )
}
