'use client'

import { Minus, Plus } from 'lucide-react'
import { MIN_CAROUSEL_SLIDES, MAX_CAROUSEL_SLIDES } from '@/utils/constants'
import type { PostType } from '@/types/api'

/** Posts-per-run bounds — mirrors POSTS_PER_RUN_OPTIONS's 1–7 plus one. */
const MIN_POSTS = 1
const MAX_POSTS = 8

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
          <> · carousels run {MIN_CAROUSEL_SLIDES}–{MAX_CAROUSEL_SLIDES} slides</>
        )}
      </p>
    </div>
  )
}
