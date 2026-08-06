'use client'

import { Chip, ChipGroup, Field, FormSection, ToggleRow } from '@/components/ui/form'
import { Select } from '@/components/ui/select'
import { WeekPreview } from '@/components/ui/week-preview'
import { cn } from '@/utils/cn'
import {
  CAROUSEL_SLIDE_OPTIONS,
  GENERATION_HOUR_OPTIONS,
  LIVE_PLATFORMS,
  PLATFORMS,
  POSTS_PER_RUN_OPTIONS,
  WEEKDAY_OPTIONS,
} from '@/utils/constants'
import type { BrandDraft, ScheduleDraft } from '@/features/clients/lib/client-draft'
import type { PostType } from '@/types/api'

// No "Text only" option: nothing downstream generates it. Values are typed as
// PostType so this picker cannot offer something the pipeline does not accept.
const POST_TYPE_OPTIONS: Array<{ value: PostType; label: string }> = [
  { value: 'single', label: 'Single image' },
  { value: 'carousel', label: 'Carousel' },
]

const SLIDE_OPTIONS = CAROUSEL_SLIDE_OPTIONS.map((n) => ({
  value: String(n),
  label: `${n} slides`,
}))

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
            onChange={(value) => onBrandChange({ defaultPostType: value })}
            options={POST_TYPE_OPTIONS}
          />
        </Field>
        {brand.defaultPostType === 'carousel' && (
          <Field label="Default slides" span={3}>
            <Select
              value={brand.defaultCarouselSlides}
              onChange={(value) => onBrandChange({ defaultCarouselSlides: value })}
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
              onChange={(value) => onScheduleChange({ freqValue: value })}
              options={POSTS_PER_RUN_OPTIONS}
            />
          </Field>
          <Field label="Generate on" span={4}>
            <Select
              value={schedule.autoDay}
              onChange={(value) => onScheduleChange({ autoDay: value })}
              options={[...WEEKDAY_OPTIONS]}
            />
          </Field>
          <Field label="Time" span={4}>
            {/* Hour slots, not a free time input: the cron matches day + hour, so minutes
                would be accepted but never honoured. Saved values snap on hydration. */}
            <Select
              value={schedule.autoTime}
              onChange={(value) => onScheduleChange({ autoTime: value })}
              options={GENERATION_HOUR_OPTIONS}
            />
          </Field>

          <WeekPreview
            className="col-span-12"
            day={schedule.autoDay}
            count={schedule.isActive ? parseInt(schedule.freqValue, 10) || 0 : 0}
          />
        </div>
      </FormSection>
    </>
  )
}
