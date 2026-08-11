import { describe, it, expect } from 'vitest'
import { pickVisualBacklog, totalVisualSlots, type BacklogPost } from '../visual-backlog'
import type { PostImage } from '@/types/api'

const options = { qualityFloor: 5, maxAttempts: 3, maxImagesPerRun: 12 }

function post(overrides: Partial<BacklogPost> = {}): BacklogPost {
  return {
    id: 'p1',
    client_id: 'c1',
    post_type: 'single',
    slides_json: null,
    quality_score_avg: 8,
    visuals_attempts: 0,
    created_at: '2026-08-01T09:00:00Z',
    ...overrides,
  }
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
    expect(pickVisualBacklog([post()], new Map(), options)).toEqual([
      { postId: 'p1', clientId: 'c1', positions: [0] },
    ])
  })

  it('expands carousels to their uncovered positions only', () => {
    const carousel = post({ id: 'car', post_type: 'carousel', slides_json: slides(4) })
    const jobs = pickVisualBacklog([carousel], new Map([['car', [image(0), image(2)]]]), options)
    expect(jobs).toEqual([{ postId: 'car', clientId: 'c1', positions: [1, 3] }])
  })

  it('skips posts below the quality floor — no art spend on likely discards', () => {
    expect(pickVisualBacklog([post({ quality_score_avg: 4 })], new Map(), options)).toEqual([])
  })

  it('an unjudged post is eligible — the judge failing is not the post failing', () => {
    // null used to be treated as below every floor, so a judge outage silently
    // denied art to a whole batch — and triage then flagged `missing_visuals`
    // forever, blaming the post for our failure. The cron's `.or(...)` mirrors this.
    expect(pickVisualBacklog([post({ quality_score_avg: null })], new Map(), options)).toHaveLength(1)
  })

  it('skips posts that already burned their attempts', () => {
    expect(pickVisualBacklog([post({ visuals_attempts: 3 })], new Map(), options)).toEqual([])
  })

  it('fully covered posts are not jobs', () => {
    expect(pickVisualBacklog([post()], new Map([['p1', [image(0)]]]), options)).toEqual([])
  })

  it('oldest posts drain first and the image budget is a hard ceiling', () => {
    const older = post({ id: 'old', post_type: 'carousel', slides_json: slides(3), created_at: '2026-07-28T09:00:00Z' })
    const newer = post({ id: 'new', post_type: 'carousel', slides_json: slides(3), created_at: '2026-08-02T09:00:00Z' })
    const jobs = pickVisualBacklog([newer, older], new Map(), { ...options, maxImagesPerRun: 4 })
    expect(jobs.map((j) => j.postId)).toEqual(['old', 'new'])
    expect(jobs[0]?.positions).toEqual([0, 1, 2])
    // Only one budget slot left for the newer carousel.
    expect(jobs[1]?.positions).toEqual([0])
  })
})

describe('totalVisualSlots', () => {
  it('reads the slide count for carousels, one for singles', () => {
    expect(totalVisualSlots({ post_type: 'carousel', slides_json: slides(2) })).toBe(2)
    expect(totalVisualSlots({ post_type: 'single', slides_json: null })).toBe(1)
  })
})
