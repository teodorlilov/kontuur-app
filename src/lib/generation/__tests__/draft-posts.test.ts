import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { DraftPost } from '@/ai/generation/types'
import { insertDraftPosts, persistStreamedDraft } from '../draft-posts'

vi.mock('server-only', () => ({}))

const recordPostTopics = vi.fn()
vi.mock('@/lib/queries/post-history', () => ({
  recordPostTopics: (...args: unknown[]) => recordPostTopics(...args),
}))
const resolveScheme = vi.fn()
vi.mock('@/lib/visual/post-color', () => ({
  resolveScheme: (...args: unknown[]) => resolveScheme(...args),
}))

type InsertResult = {
  data: Array<{ id: string }> | null
  error: { message: string } | null
}

/** Captures the inserted rows and replays one canned result. */
function makeSupabase(result: InsertResult) {
  const inserted: Array<Array<Record<string, unknown>>> = []
  const supabase = {
    from: () => ({
      insert: (rows: Array<Record<string, unknown>>) => {
        inserted.push(rows)
        return { select: () => Promise.resolve(result) }
      },
    }),
  } as unknown as SupabaseClient
  return { supabase, inserted }
}

const DRAFT = {
  client_id: 'c1',
  caption: 'Hello',
  post_type: 'single',
  slides_json: null,
  validation_json: null,
  quality_score_avg: 8,
  topic_summary: 'Lip sync accuracy',
}

beforeEach(() => {
  recordPostTopics.mockReset().mockResolvedValue(undefined)
})

describe('insertDraftPosts', () => {
  it('writes the caller-owned columns beside the draft facts, per status', async () => {
    const { supabase, inserted } = makeSupabase({ data: [{ id: 'p1' }], error: null })

    const saved = await insertDraftPosts(
      supabase,
      [{ ...DRAFT, id: 'p1', priority: true, visual_ground: '#111111', visual_accent: '#eeeeee' }],
      'draft'
    )

    expect(saved).toEqual([{ id: 'p1' }])
    expect(inserted[0]?.[0]).toMatchObject({
      id: 'p1',
      client_id: 'c1',
      caption: 'Hello',
      generated_caption: 'Hello',
      status: 'draft',
      priority: true,
      visual_ground: '#111111',
      visual_accent: '#eeeeee',
    })
  })

  it('lets the database mint the id and defaults what the caller did not decide', async () => {
    const { supabase, inserted } = makeSupabase({ data: [{ id: 'p2' }], error: null })

    await insertDraftPosts(supabase, [DRAFT], 'pending_review')

    const row = inserted[0]?.[0] ?? {}
    expect(row).not.toHaveProperty('id')
    expect(row).toMatchObject({
      status: 'pending_review',
      priority: false,
      visual_ground: null,
      visual_accent: null,
      generation_run_id: null,
      client_idea_id: null,
    })
  })

  it("keeps the AI's own words when the caller carries them, and falls back when it does not", async () => {
    const { supabase, inserted } = makeSupabase({ data: [{ id: 'p1' }], error: null })

    await insertDraftPosts(
      supabase,
      [
        { ...DRAFT, caption: 'The reviewer rewrote this', generated_caption: 'What the AI wrote' },
        DRAFT,
      ],
      'pending_review'
    )

    // A duplicate of an edited post: the baseline is the ORIGINAL's, or the edit-diff the style
    // memo reads would file the reviewer's own wording as the model's.
    expect(inserted[0]?.[0]).toMatchObject({
      caption: 'The reviewer rewrote this',
      generated_caption: 'What the AI wrote',
    })
    // A freshly generated draft has no baseline yet — it IS the baseline.
    expect(inserted[0]?.[1]).toMatchObject({ caption: 'Hello', generated_caption: 'Hello' })
  })

  it("writes nothing to the client's topic history — a draft is not a topic the client has had", async () => {
    const { supabase } = makeSupabase({ data: [{ id: 'p1' }, { id: 'p2' }], error: null })

    await insertDraftPosts(supabase, [DRAFT, { ...DRAFT, topic_summary: 'Avatars' }], 'draft')
    await insertDraftPosts(supabase, [DRAFT], 'pending_review')

    // The history is the "do not suggest this again" list. A discarded draft must leave it
    // untouched, so the topic joins it when a reviewer keeps the post (`recordKeptTopics`).
    expect(recordPostTopics).not.toHaveBeenCalled()
  })

  it('throws on a failed insert — a generated draft is expensive to lose silently', async () => {
    const { supabase } = makeSupabase({ data: null, error: { message: 'boom' } })

    await expect(insertDraftPosts(supabase, [DRAFT], 'draft')).rejects.toThrow(
      'Failed to save generated posts: boom'
    )
    expect(recordPostTopics).not.toHaveBeenCalled()
  })
})

const STREAMED = {
  ...DRAFT,
  id: 'p9',
  status: 'draft',
  priority: true,
  source_url: null,
  source_title: null,
  source_type: null,
  source_excerpt: null,
  client_source_id: null,
  pillar: null,
  target_date: '2026-09-25',
  created_at: '2026-09-20T08:00:00.000Z',
} as unknown as DraftPost

describe('persistStreamedDraft', () => {
  beforeEach(() => {
    resolveScheme.mockReset().mockResolvedValue({ ground: '#111111', accent: '#eeeeee' })
  })

  it('picks the pair against the run and inserts the draft wearing it, under its own id', async () => {
    const { supabase, inserted } = makeSupabase({ data: [{ id: 'p9' }], error: null })

    await persistStreamedDraft(supabase, {
      post: STREAMED,
      identity: { palette: {}, style: 'editorial' } as never,
      run: { id: 'run-1', index: 2, clientId: 'c1' },
      clientIdeaId: 'idea-7',
    })

    expect(resolveScheme).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: 'c1', base: 'run-1', offset: 2 })
    )
    expect(resolveScheme.mock.calls[0]?.[0]).not.toHaveProperty('postId')
    expect(inserted[0]?.[0]).toMatchObject({
      id: 'p9',
      status: 'draft',
      priority: true,
      visual_ground: '#111111',
      visual_accent: '#eeeeee',
      // What the draft must still know once the browser is gone.
      generation_run_id: 'run-1',
      client_idea_id: 'idea-7',
      target_date: '2026-09-25',
    })
  })

  it('falls back to the client for the pair when no run could be opened', async () => {
    const { supabase, inserted } = makeSupabase({ data: [{ id: 'p9' }], error: null })

    await persistStreamedDraft(supabase, {
      post: STREAMED,
      identity: { palette: {}, style: 'editorial' } as never,
      run: { id: null, index: 1, clientId: 'c1' },
      clientIdeaId: null,
    })

    expect(resolveScheme).toHaveBeenCalledWith(expect.objectContaining({ base: 'c1', offset: 1 }))
    expect(inserted[0]?.[0]).toMatchObject({ generation_run_id: null, client_idea_id: null })
  })

  it('a run whose kit could not be read inserts without a pair rather than not at all', async () => {
    const { supabase, inserted } = makeSupabase({ data: [{ id: 'p9' }], error: null })

    await persistStreamedDraft(supabase, {
      post: STREAMED,
      identity: null,
      run: { id: 'run-1', index: 0, clientId: 'c1' },
      clientIdeaId: null,
    })

    expect(resolveScheme).not.toHaveBeenCalled()
    expect(inserted[0]?.[0]).toMatchObject({ visual_ground: null, visual_accent: null })
  })
})
