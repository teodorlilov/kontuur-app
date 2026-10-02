'use client'

import { Stepper } from '@/components/ui/stepper'
import { MIN_CAROUSEL_SLIDES, MAX_CAROUSEL_SLIDES, POSTS_PER_RUN_OPTIONS } from '@/utils/constants'
import { postsLeft as postsLeftLine, type ImagePool } from '@/lib/billing/copy'
import { runCeiling, type PostsAffordable } from '@/lib/billing/post-allowance'
import { cn } from '@/utils/cn'
import type { PostType } from '@/types/api'

/**
 * Posts-per-run bounds. 0 is valid and means "only the briefs" — an idea or a
 * campaign post with no researched mix alongside it. The ceiling derives from
 * the settings picker so the wizard cannot drift from what a schedule allows.
 */
const MIN_POSTS = 0
const MAX_POSTS = Math.max(...POSTS_PER_RUN_OPTIONS.map((o) => Number(o.value)))

interface CountSteppersProps {
  postCount: number
  slideCount: number
  postType: PostType
  postsPerWeek: number
  /** Priority briefs ride on top of the stepper's researched count. */
  briefCount: number
  /** Posts this period can still pay for — the stepper cannot ask for more; null when unmetered. */
  affordable: PostsAffordable
  /** The image pool, for saying why pictures bind: what is left, one post's cost, what is owed. */
  pool?: ImagePool
  onPostCount: (value: number) => void
  onSlideCount: (value: number) => void
}

/**
 * How many posts, and how many slides each — one row, because they are one
 * decision: the size of the run. The slides stepper hides in place when the
 * format is a single image, so nothing below it moves. The posts ceiling is
 * what the period can still pay for at this format, less the briefs — they are posts too, and
 * raising the slide count lowers the ceiling because each slide is another picture
 * (`runCeiling`). The briefs are said beside the count with the total, or a locked idea's
 * "0 posts" beside a panel promising 1 would read as a contradiction rather than a sum.
 */
export function CountSteppers({
  postCount,
  slideCount,
  postType,
  postsPerWeek,
  briefCount,
  affordable,
  pool,
  onPostCount,
  onSlideCount,
}: CountSteppersProps) {
  const isCarousel = postType === 'carousel'
  const { posts, limiting } = affordable
  const maxPosts = Math.min(MAX_POSTS, runCeiling(affordable, briefCount))
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
          {postsLeftLine(posts, limiting, 0, pool)}
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
