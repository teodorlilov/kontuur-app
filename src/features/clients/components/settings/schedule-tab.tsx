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
  isActive: boolean
  onActivePlatformChange: (v: string) => void
  onDefaultPostTypeChange: (v: string) => void
  onDefaultCarouselSlidesChange: (v: string) => void
  onFreqValueChange: (v: string) => void
  onAutoDayChange: (v: string) => void
  onIsActiveChange: (v: boolean) => void
}

/** Schedule tab: platform, post type, and autonomous generation settings. */
export function ScheduleTab({
  activePlatform,
  defaultPostType,
  defaultCarouselSlides,
  freqValue,
  autoDay,
  isActive,
  onActivePlatformChange,
  onDefaultPostTypeChange,
  onDefaultCarouselSlidesChange,
  onFreqValueChange,
  onAutoDayChange,
  onIsActiveChange,
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

          {/* Enable/disable toggle */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 16,
              marginBottom: 16,
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: 'var(--color-text-1)',
                  marginBottom: 2,
                }}
              >
                Autonomous generation
              </div>
              <div style={{ fontSize: 11, color: 'var(--color-muted)' }}>
                Automatically generate posts on the schedule below
              </div>
            </div>
            <button
              type="button"
              onClick={() => onIsActiveChange(!isActive)}
              className={cn(
                'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                isActive ? 'bg-[#1A2630]' : 'bg-gray-200'
              )}
              style={{ flexShrink: 0 }}
            >
              <span
                className={cn(
                  'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
                  isActive ? 'translate-x-6' : 'translate-x-1'
                )}
              />
            </button>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 12,
              opacity: isActive ? 1 : 0.45,
              pointerEvents: isActive ? 'auto' : 'none',
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
