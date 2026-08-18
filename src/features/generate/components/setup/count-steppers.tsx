'use client'

import { Minus, Plus } from 'lucide-react'
import { MIN_CAROUSEL_SLIDES, MAX_CAROUSEL_SLIDES, POSTS_PER_RUN_OPTIONS } from '@/utils/constants'
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
        <Minus aria-hidden className="size-3" strokeWidth={1.8} />
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
        <Plus aria-hidden className="size-3" strokeWidth={1.8} />
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
  onPostCount: (value: number) => void
  onSlideCount: (value: number) => void
}

/**
 * How many posts, and how many slides each — one row, because they are one
 * decision: the size of the run. The slides stepper hides in place when the
 * format is a single image, so nothing below it moves.
 */
export function CountSteppers({
  postCount,
  slideCount,
  postType,
  postsPerWeek,
  briefCount,
  onPostCount,
  onSlideCount,
}: CountSteppersProps) {
  const isCarousel = postType === 'carousel'
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-6">
        <span className="flex items-center gap-2">
          <Stepper
            value={postCount}
            min={MIN_POSTS}
            max={MAX_POSTS}
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
