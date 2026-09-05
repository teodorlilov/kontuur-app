import { describe, it, expect } from 'vitest'
import { computeTriage, postAgeDays } from '../triage'
import type { QueuePost } from '../queue-post'
import type { ValidationData } from '@/types/api'
import type { PostImage } from '@/types/api'

const now = new Date('2026-08-04T12:00:00Z')

function image(position: number): PostImage {
  return {
    id: `img-${position}`,
    publicUrl: `https://cdn/img-${position}.jpg`,
    storagePath: `posts/img-${position}.jpg`,
    position,
    fileName: null,
    fileSize: null,
    contentType: null,
  }
}

function post(overrides: Partial<QueuePost> = {}): QueuePost {
  return {
    id: 'p1',
    client_id: 'c1',
    caption: 'caption',
    post_type: 'single',
    slides_json: null,
    validation_json: null,
    validation: validation(),
    needsSlopCheck: false,
    destinations: ['instagram'],
    status: 'pending_review',
    priority: false,
    quality_score_avg: 8,
    was_rewritten: false,
    rewrite_count: 0,
    pillar: null,
    source_url: null,
    source_title: null,
    source_type: null,
    source_excerpt: null,
    topic_summary: null,
    scheduled_at: null,
    created_at: '2026-08-03T12:00:00Z',
    client_name: 'Client',
    is_health_niche: false,
    images: [image(0)],
    composedPositions: [0],
    approval: null,
    ...overrides,
  }
}

function validation(
  overrides: {
    overall?: number | null
    human?: number | null
    aiTells?: string[]
    healthCompliant?: boolean | null
  } = {}
): ValidationData {
  const { overall = 8, human = 8, aiTells = [], healthCompliant = null } = overrides
  return {
    criteria: {
      ai_tells: aiTells,
      worst_offending_phrase: null,
      structure_followed: null,
      source_claims: null,
      health_compliant: healthCompliant,
      issues: [],
    },
    scores: { overall_score: overall, human_score: human, language_score: 9, source_score: null },
    language: { passes: true, language_score: 9, issues: [], corrected_text: null },
    slop: {
      reads_as_human: aiTells.length === 0,
      ai_tells_found: aiTells,
      worst_offending_phrase: null,
      human_authenticity_score: human,
    },
  }
}

function triageOne(p: QueuePost, v: ValidationData) {
  return computeTriage([{ post: p, validation: v }], now)[0]!
}

describe('computeTriage — reasons land a post in needs_attention', () => {
  it('a clean post is ready to ship', () => {
    const t = triageOne(post(), validation())
    expect(t.bucket).toBe('ready')
    expect(t.reasons).toEqual([])
  })

  it('a weak overall score flags low_quality', () => {
    const t = triageOne(post({ quality_score_avg: 6 }), validation({ overall: 6 }))
    expect(t.bucket).toBe('needs_attention')
    expect(t.reasons).toContain('low_quality')
  })

  it('AI tells flag the post even when scores look fine', () => {
    const t = triageOne(post(), validation({ aiTells: ['in today world'] }))
    expect(t.reasons).toContain('ai_tells')
  })

  it('a measured-low authenticity score flags without any named tells', () => {
    const t = triageOne(post(), validation({ human: 4 }))
    expect(t.reasons).toContain('ai_tells')
  })

  it('an unmeasured authenticity score does not flag, but a measured 0 does', () => {
    // 0 used to be an in-band sentinel for "not measured yet", so a genuinely
    // terrible score was indistinguishable from an absent one and neither flagged.
    // Absence has its own value now, and 0 means what it says.
    expect(triageOne(post(), validation({ human: null })).reasons).not.toContain('ai_tells')
    expect(triageOne(post(), validation({ human: 0 })).reasons).toContain('ai_tells')
  })

  it('an unjudged post is never ready — it flags not_validated instead of low_quality', () => {
    // Ready's copy says "Clean scores, nothing flagged" above one-click bulk
    // approval; a post no judge read must not sit under it.
    const t = triageOne(post({ quality_score_avg: null }), validation({ overall: null }))
    expect(t.bucket).toBe('needs_attention')
    expect(t.reasons).toContain('not_validated')
    expect(t.reasons).not.toContain('low_quality')
  })

  it('health clients need a human check until compliance is affirmed', () => {
    const flagged = triageOne(
      post({ is_health_niche: true }),
      validation({ healthCompliant: null })
    )
    expect(flagged.reasons).toContain('health_review')
    const cleared = triageOne(
      post({ is_health_niche: true }),
      validation({ healthCompliant: true })
    )
    expect(cleared.reasons).not.toContain('health_review')
    const nonHealth = triageOne(
      post({ is_health_niche: false }),
      validation({ healthCompliant: null })
    )
    expect(nonHealth.reasons).not.toContain('health_review')
  })

  it('a sourced post flags stale strictly past the threshold; unsourced never does', () => {
    const eightDays = post({ source_url: 'https://x', created_at: '2026-07-27T12:00:00Z' })
    expect(triageOne(eightDays, validation()).reasons).toContain('stale_source')
    // Exactly at the boundary (7 days) stays fresh — the flag reads "older than".
    const sevenDays = post({ source_url: 'https://x', created_at: '2026-07-28T12:00:00Z' })
    expect(triageOne(sevenDays, validation()).reasons).not.toContain('stale_source')
    const unsourced = post({ source_url: null, created_at: '2026-07-01T12:00:00Z' })
    expect(triageOne(unsourced, validation()).reasons).not.toContain('stale_source')
  })

  it('missing visuals count against the slide count for carousels, one for singles', () => {
    const slides = [1, 2, 3].map((n) => ({ slide_number: n, headline: `h${n}`, body: '' }))
    const carousel = post({ post_type: 'carousel', slides_json: slides, images: [image(0)] })
    expect(triageOne(carousel, validation()).reasons).toContain('missing_visuals')
    const bare = post({ images: [] })
    expect(triageOne(bare, validation()).reasons).toContain('missing_visuals')
    const covered = post({ images: [image(0)] })
    expect(triageOne(covered, validation()).reasons).not.toContain('missing_visuals')
  })
})

describe('computeTriage — waiting on client wins over everything', () => {
  it('a pending unexpired token outranks attention reasons', () => {
    const t = triageOne(
      post({ approval: { status: 'pending', expiresAt: '2026-08-05T12:00:00Z' } }),
      validation({ overall: 4 })
    )
    expect(t.bucket).toBe('waiting_on_client')
  })

  it('an expired token releases the post back to triage', () => {
    const t = triageOne(
      post({ approval: { status: 'pending', expiresAt: '2026-08-01T12:00:00Z' } }),
      validation()
    )
    expect(t.bucket).toBe('ready')
  })
})

describe('computeTriage — ordering drains the queue', () => {
  it('oldest first, priority posts leading', () => {
    const items = [
      { post: post({ id: 'new', created_at: '2026-08-04T09:00:00Z' }), validation: validation() },
      { post: post({ id: 'old', created_at: '2026-07-27T09:00:00Z' }), validation: validation() },
      {
        post: post({ id: 'prio', priority: true, created_at: '2026-08-04T10:00:00Z' }),
        validation: validation(),
      },
    ]
    expect(computeTriage(items, now).map((t) => t.post.id)).toEqual(['prio', 'old', 'new'])
  })
})

describe('helpers', () => {
  it('postAgeDays floors to whole days', () => {
    expect(postAgeDays('2026-07-27T11:00:00Z', now)).toBe(8)
    expect(postAgeDays('2026-08-04T01:00:00Z', now)).toBe(0)
  })
})
