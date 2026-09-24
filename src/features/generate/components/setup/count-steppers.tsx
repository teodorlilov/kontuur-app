'use client'

import { AddIcon, MinusIcon } from '@solar-icons/react/linear'
import { Icon } from '@/components/ui/icon'
import { MIN_CAROUSEL_SLIDES, MAX_CAROUSEL_SLIDES, POSTS_PER_RUN_OPTIONS } from '@/utils/constants'
import { postsLeft as postsLeftLine } from '@/lib/billing/copy'
import type { PostsAffordable } from '@/lib/billing/post-allowance'
import { cn } from '@/utils/cn'
import type { PostType } from '@/types/api'

/**
 * Posts-per-run bounds. 0 is valid and means "only the briefs" — an idea or a
 * campaign post with no researched mix alongside it. The ceiling derives from
 * the settings picker so the wizard cannot drift from what a schedule allows.
 */
const MIN_POSTS = 0
const MAX_POSTS = Math.max(...POSTS_PER_RUN_OPTIONS.map((o) => Number(o.value)))

interface StepperProps {
  value: number
  min: number
  max: number
  decrementLabel: string
  incrementLabel: string
  onChange: (value: number) => void
}

/** A −/value/+ control. Feature-local; promote only on a consumer outside generate. */
function Stepper({ value, min, max, decrementLabel, incrementLabel, onChange }: StepperProps) {
  return (
    <span className="inline-flex items-center gap-1 rounded-chip border border-line2 bg-surface p-1">
      <button
        type="button"
        aria-label={decrementLabel}
        disabled={value <= min}
        onClick={() => onChange(value - 1)}
        className="grid size-7 place-items-center rounded-sm text-text2 transition-colors duration-150 ease-contour hover:bg-wash hover:text-forest disabled:pointer-events-none disabled:opacity-35"
      >
        <Icon glyph={MinusIcon} size="xs" />
      </button>
      <span className="min-w-8 text-center text-title font-semibold tabular-nums text-ink">
        {value}
      </span>
      <button
        type="button"
        aria-label={incrementLabel}
        disabled={value >= max}
        onClick={() => onChange(value + 1)}
        className="grid size-7 place-items-center rounded-sm text-text2 transition-colors duration-150 ease-contour hover:bg-wash hover:text-forest disabled:pointer-events-none disabled:opacity-35"
      >
        <Icon glyph={AddIcon} size="xs" />
      </button>
    </span>
  )
}

interface CountSteppersProps {
  postCount: number
  slideCount: number
  postType: PostType
  postsPerWeek: number
  /** Priority briefs ride on top of the stepper's researched count. */
  briefCount: number
  /** Posts this period can still pay for — the stepper cannot ask for more; null when unmetered. */
  affordable: PostsAffordable
  onPostCount: (value: number) => void
  onSlideCount: (value: number) => void
}

/**
 * How many posts, and how many slides each — one row, because they are one
 * decision: the size of the run. The slides stepper hides in place when the
 * format is a single image, so nothing below it moves. The posts ceiling is
 * what the period can still pay for at this format, less the briefs — they are posts too, and
 * raising the slide count lowers the ceiling because each slide is another picture.
 */
export function CountSteppers({
  postCount,
  slideCount,
  postType,
  postsPerWeek,
  briefCount,
  affordable,
  onPostCount,
  onSlideCount,
}: CountSteppersProps) {
  const isCarousel = postType === 'carousel'
  const { posts, limiting } = affordable
  const maxPosts =
    posts === null ? MAX_POSTS : Math.max(MIN_POSTS, Math.min(MAX_POSTS, posts - briefCount))
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-6">
        <span className="flex items-center gap-2">
          <Stepper
            value={postCount}
            min={MIN_POSTS}
            max={maxPosts}
            decrementLabel="One post fewer"
            incrementLabel="One post more"
            onChange={onPostCount}
          />
          <span className="text-body text-text2">posts</span>
        </span>
        {isCarousel && (
          <span className="flex items-center gap-2">
            <Stepper
              value={slideCount}
              min={MIN_CAROUSEL_SLIDES}
              max={MAX_CAROUSEL_SLIDES}
              decrementLabel="One slide fewer"
              incrementLabel="One slide more"
              onChange={onSlideCount}
            />
            <span className="text-body text-text2">slides each</span>
          </span>
        )}
      </div>
      {posts !== null && (
        <p className={cn('text-caption', posts === 0 ? 'text-danger' : 'text-text2')}>
          {postsLeftLine(posts, limiting)}
        </p>
      )}
      <p className="text-caption text-text2">
        This client posts{' '}
        <span className="font-medium text-ink">
          {postsPerWeek} time{postsPerWeek === 1 ? '' : 's'} a week
        </span>
        {isCarousel && (
          <>
            {' '}
            · carousels run {MIN_CAROUSEL_SLIDES}–{MAX_CAROUSEL_SLIDES} slides
          </>
        )}
        {/* Briefs are not in the stepper — without this line, a locked idea
            makes "0 posts" sit beside a panel promising 1 and the two look
            like a contradiction instead of a sum. */}
        {briefCount > 0 && (
          <>
            {' '}
            · + {briefCount} priority brief{briefCount === 1 ? '' : 's'} ·{' '}
            <span className="font-medium text-ink">
              {postCount + briefCount} post{postCount + briefCount === 1 ? '' : 's'} total
            </span>
          </>
        )}
      </p>
    </div>
  )
}
