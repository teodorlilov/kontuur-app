import { describe, it, expect } from 'vitest'
import {
  MAX_VISUAL_ATTEMPTS,
  missingPositions,
  pickVisualBacklog,
  toPostType,
  totalVisualSlots,
  type BacklogPost,
} from '../visual-backlog'
import type { PostImage } from '@/types/api'

const HOUR_MS = 3_600_000
/** Client c1 of agency a1, whose image pool is not what these cases are about. */
const options = {
  maxImagesPerRun: 12,
  retrySpacingMs: 6 * HOUR_MS,
  agencyOf: new Map([['c1', 'a1']]),
  imagesLeft: new Map([['a1', Infinity]]),
  generatingByPost: new Map<string, number[]>(),
}
/** Pinned so a spacing assertion measures the gap, not the wall clock. */
const NOW = new Date('2026-08-03T12:00:00Z')

function post(overrides: Partial<BacklogPost> = {}): BacklogPost {
  return {
    id: 'p1',
    client_id: 'c1',
    status: 'pending_review',
    post_type: 'single',
    slides_json: null,
    quality_score_avg: 8,
    visuals_attempts: 0,
    visuals_attempted_at: null,
    created_at: '2026-08-01T09:00:00Z',
    ...overrides,
  }
}

/** An attempt `hoursAgo` before NOW, as the column stores it. */
function attemptedHoursAgo(hoursAgo: number): string {
  return new Date(NOW.getTime() - hoursAgo * HOUR_MS).toISOString()
}

function image(position: number): PostImage {
  return {
    id: `img-${position}`,
    publicUrl: `https://cdn/${position}.jpg`,
    storagePath: `posts/${position}.jpg`,
    position,
    fileName: null,
    fileSize: null,
    contentType: null,
  }
}

function slides(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    slide_number: i + 1,
    headline: `h${i}`,
    body: '',
  }))
}

describe('pickVisualBacklog', () => {
  it('a bare single post yields one position', () => {
    expect(pickVisualBacklog([post()], new Map(), options).jobs).toEqual([
      { postId: 'p1', clientId: 'c1', positions: [0] },
    ])
  })

  it('expands carousels to their uncovered positions only', () => {
    const carousel = post({ id: 'car', post_type: 'carousel', slides_json: slides(4) })
    const { jobs } = pickVisualBacklog(
      [carousel],
      new Map([['car', [image(0), image(2)]]]),
      options
    )
    expect(jobs).toEqual([{ postId: 'car', clientId: 'c1', positions: [1, 3] }])
  })

  it('skips posts below the quality floor — no art spend on likely discards', () => {
    expect(pickVisualBacklog([post({ quality_score_avg: 4 })], new Map(), options).jobs).toEqual([])
  })

  it('an unjudged post is eligible — the judge failing is not the post failing', () => {
    expect(
      pickVisualBacklog([post({ quality_score_avg: null })], new Map(), options).jobs
    ).toHaveLength(1)
  })

  it('skips posts that already burned their attempts', () => {
    expect(
      pickVisualBacklog([post({ visuals_attempts: MAX_VISUAL_ATTEMPTS })], new Map(), options).jobs
    ).toEqual([])
  })

  it('holds a post back until the retry gap has passed, so one outage cannot spend all its attempts', () => {
    const justTried = post({ visuals_attempts: 1, visuals_attempted_at: attemptedHoursAgo(1) })
    expect(pickVisualBacklog([justTried], new Map(), options, NOW).jobs).toEqual([])
  })

  it('retries once the gap has passed', () => {
    const cooledOff = post({ visuals_attempts: 1, visuals_attempted_at: attemptedHoursAgo(7) })
    expect(pickVisualBacklog([cooledOff], new Map(), options, NOW).jobs).toHaveLength(1)
  })

  it('a never-attempted post has no gap to wait out', () => {
    expect(
      pickVisualBacklog([post({ visuals_attempted_at: null })], new Map(), options, NOW).jobs
    ).toHaveLength(1)
  })

  it('fully covered posts are not jobs', () => {
    expect(pickVisualBacklog([post()], new Map([['p1', [image(0)]]]), options).jobs).toEqual([])
  })

  it('oldest posts drain first, each whole: one the run budget cannot fit is passed over for a smaller one behind it', () => {
    const older = post({
      id: 'old',
      post_type: 'carousel',
      slides_json: slides(3),
      created_at: '2026-07-28T09:00:00Z',
    })
    const newer = post({
      id: 'new',
      post_type: 'carousel',
      slides_json: slides(3),
      created_at: '2026-08-02T09:00:00Z',
    })
    const single = post({ id: 'one', created_at: '2026-08-03T09:00:00Z' })
    const { jobs } = pickVisualBacklog([single, newer, older], new Map(), {
      ...options,
      maxImagesPerRun: 4,
    })
    expect(jobs).toEqual([
      { postId: 'old', clientId: 'c1', positions: [0, 1, 2] },
      { postId: 'one', clientId: 'c1', positions: [0] },
    ])
  })

  it('refuses a post the workspace pool cannot pay for whole, and paints a sibling client’s post it can', () => {
    const carousel = post({ id: 'car', post_type: 'carousel', slides_json: slides(4) })
    const sibling = post({ id: 'sib', client_id: 'c2', created_at: '2026-08-02T09:00:00Z' })
    const { jobs, refused } = pickVisualBacklog([carousel, sibling], new Map(), {
      ...options,
      agencyOf: new Map([
        ['c1', 'a1'],
        ['c2', 'a1'],
      ]),
      imagesLeft: new Map([['a1', 3]]),
    })
    expect(refused.map((p) => p.id)).toEqual(['car'])
    expect(jobs).toEqual([{ postId: 'sib', clientId: 'c2', positions: [0] }])
  })
})

describe('pickVisualBacklog — live claims', () => {
  it('leaves a claimed position to whoever is painting it and, since it is already reserved, measures the pool without it', () => {
    const carousel = post({ id: 'car', post_type: 'carousel', slides_json: slides(4) })
    const { jobs, refused } = pickVisualBacklog([carousel], new Map(), {
      ...options,
      imagesLeft: new Map([['a1', 3]]),
      generatingByPost: new Map([['car', [1]]]),
    })
    expect(refused).toEqual([])
    expect(jobs).toEqual([{ postId: 'car', clientId: 'c1', positions: [0, 2, 3] }])
  })
})

describe('missingPositions', () => {
  it('owes no picture for a position a live claim is already making', () => {
    const carousel = { post_type: 'carousel', slides_json: slides(4) }
    expect(missingPositions(carousel, [image(0)], [2])).toEqual([1, 3])
  })
})

describe('totalVisualSlots', () => {
  it('reads the slide count for carousels, one for singles', () => {
    expect(totalVisualSlots({ post_type: 'carousel', slides_json: slides(2) })).toBe(2)
    expect(totalVisualSlots({ post_type: 'single', slides_json: null })).toBe(1)
  })
})

describe('toPostType', () => {
  it('is a carousel only for "carousel"', () => {
    expect(toPostType('carousel')).toBe('carousel')
    expect(toPostType('single')).toBe('single')
  })

  it('reads anything else — a null brand default, a value this bundle does not know — as a single', () => {
    expect(toPostType(null)).toBe('single')
    expect(toPostType(undefined)).toBe('single')
    expect(toPostType('reel')).toBe('single')
  })
})
