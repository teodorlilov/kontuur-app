'use client'

import { Chip, ChipGroup, Field, FormSection, ToggleRow } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { cn } from '@/utils/cn'
import {
  CAROUSEL_SLIDE_OPTIONS,
  PLATFORMS,
  POSTS_PER_RUN_OPTIONS,
  WEEKDAY_OPTIONS,
} from '@/utils/constants'
import type { BrandDraft, ScheduleDraft } from '@/features/clients/lib/client-draft'

/** Only these two can publish today; the rest are shown so the roadmap is legible. */
const LIVE_PLATFORMS = new Set(['Instagram', 'Facebook'])

// No "Text only" option: nothing downstream generates it.
const POST_TYPE_OPTIONS = [
  { value: 'single', label: 'Single image' },
  { value: 'carousel', label: 'Carousel' },
]

const SLIDE_OPTIONS = CAROUSEL_SLIDE_OPTIONS.map((n) => ({ value: String(n), label: `${n} slides` }))

interface ScheduleTabProps {
  brand: BrandDraft
  schedule: ScheduleDraft
  /** Lower-cased platform names with a live connection, for the chip dots. */
  connectedPlatforms: Set<string>
  onBrandChange: (patch: Partial<BrandDraft>) => void
  onScheduleChange: (patch: Partial<ScheduleDraft>) => void
}

/** Platform, format and autonomous generation. */
export function ScheduleTab({
  brand,
  schedule,
  connectedPlatforms,
  onBrandChange,
  onScheduleChange,
}: ScheduleTabProps) {
  return (
    <>
      <FormSection legend="Platform" description="Only connected platforms can publish.">
        <div className="col-span-12">
          <ChipGroup label="Publishing platform">
            {PLATFORMS.map((platform) => {
              const supported = LIVE_PLATFORMS.has(platform)
              return (
                <Chip
                  key={platform}
                  pressed={supported && brand.activePlatform === platform}
                  disabled={!supported}
                  live={supported ? connectedPlatforms.has(platform.toLowerCase()) : undefined}
                  onClick={() => onBrandChange({ activePlatform: platform })}
                >
                  {supported ? platform : `${platform} · soon`}
                </Chip>
              )
            })}
          </ChipGroup>
        </div>

        <Field label="Default post type" span={4}>
          <Select
            value={brand.defaultPostType}
            onChange={(e) => onBrandChange({ defaultPostType: e.target.value })}
            options={POST_TYPE_OPTIONS}
          />
        </Field>
        {brand.defaultPostType === 'carousel' && (
          <Field label="Default slides" span={3}>
            <Select
              value={brand.defaultCarouselSlides}
              onChange={(e) => onBrandChange({ defaultCarouselSlides: e.target.value })}
              options={SLIDE_OPTIONS}
            />
          </Field>
        )}
      </FormSection>

      <FormSection
        legend="Autonomous generation"
        description="Kontuur drafts posts on a schedule; they still need your approval."
      >
        <ToggleRow
          title="Generate automatically"
          description="Drafts land in the review queue — nothing publishes without you."
          checked={schedule.isActive}
          onChange={(v) => onScheduleChange({ isActive: v })}
          className="pt-0"
        />

        <div
          className={cn(
            'col-span-12 grid grid-cols-12 gap-x-5 gap-y-[18px] transition-opacity duration-200',
            !schedule.isActive && 'opacity-45'
          )}
          // `inert`, not `aria-hidden` + `pointer-events-none`: those dim the block visually but
          // leave the selects in the tab order, so a keyboard user lands on fields that are not
          // supposed to be reachable. `inert` removes them from both focus and the a11y tree.
          inert={!schedule.isActive}
        >
          <Field label="How many" span={3}>
            <Select
              value={schedule.freqValue}
              onChange={(e) => onScheduleChange({ freqValue: e.target.value })}
              options={POSTS_PER_RUN_OPTIONS}
            />
          </Field>
          <Field label="Generate on" span={4}>
            <Select
              value={schedule.autoDay}
              onChange={(e) => onScheduleChange({ autoDay: e.target.value })}
              options={[...WEEKDAY_OPTIONS]}
            />
          </Field>
          <Field label="Time" span={4}>
            {/* A native time input, matching onboarding. A fixed list of slots could not
                represent a value already saved there. */}
            <Input
              type="time"
              value={schedule.autoTime}
              onChange={(e) => onScheduleChange({ autoTime: e.target.value })}
            />
          </Field>

          <WeekPreview
            day={schedule.autoDay}
            count={schedule.isActive ? parseInt(schedule.freqValue, 10) || 0 : 0}
          />
        </div>
      </FormSection>
    </>
  )
}

/**
 * Seven day cells showing which one the run lands on.
 *
 * Purely visual, so it is `aria-hidden` with the same fact spelled out in a sentence beside it —
 * the rule DESIGN.md sets for the coverage strip.
 */
function WeekPreview({ day, count }: { day: string; count: number }) {
  const dayLabel = WEEKDAY_OPTIONS.find((w) => w.value === day)?.label ?? day

  return (
    <div className="col-span-12">
      <div aria-hidden className="grid grid-cols-7 gap-1.5">
        {WEEKDAY_OPTIONS.map((weekday) => {
          const isRunDay = weekday.value === day
          return (
            <div
              key={weekday.value}
              className={cn(
                'rounded-md border py-2 text-center text-[11px]',
                isRunDay
                  ? 'border-forest bg-forest text-surface/65'
                  : 'border-line bg-surface text-text3'
              )}
            >
              {weekday.label.slice(0, 3)}
              <b
                className={cn(
                  'mt-0.5 block text-[12.5px] font-semibold',
                  isRunDay ? 'text-surface' : 'text-ink'
                )}
              >
                {isRunDay && count > 0 ? count : '—'}
              </b>
            </div>
          )
        })}
      </div>
      <p className="sr-only">
        {count > 0
          ? `${count} post${count === 1 ? '' : 's'} generated every ${dayLabel}.`
          : 'Autonomous generation is off.'}
      </p>
    </div>
  )
}
