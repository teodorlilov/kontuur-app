import { describe, expect, it, vi, beforeEach } from 'vitest'

const remove = vi.fn(async () => ({ error: null }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminSupabaseClient: () => ({ storage: { from: () => ({ remove }) } }),
}))

import { putPostImage, putPostImages } from '../storage'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * The one writer of `post_images` at a position.
 *
 * Four routes used to do this by hand and three could lose a post's picture: they deleted the row
 * and its storage object, then inserted, so an insert that failed left the slide with nothing and
 * the old file already gone. That failure is invisible in review and permanent in production — the
 * bytes are not coming back — so the ordering is pinned here rather than trusted to a comment.
 */

const WRITE = {
  postId: 'post-1',
  position: 0,
  publicUrl: 'https://cdn/new.jpg',
  storagePath: 'client-1/post-1/2-new.jpg',
  fileName: 'new.jpg',
  fileSize: 100,
  contentType: 'image/jpeg',
}

/** A Supabase double: the row a position holds, and whether the upsert succeeds. */
function fakeAdmin(existing: { storage_path: string } | null, upsertFails = false) {
  const upsert = vi.fn((rows: Array<Record<string, unknown>>) => ({
    select: async () =>
      upsertFails
        ? { data: null, error: { message: 'unique violation' } }
        : { data: rows.map((row, i) => ({ id: `row-${i}`, ...row })), error: null },
  }))
  const select = vi.fn(() => ({
    eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: existing }) }) }),
  }))
  const client = { from: vi.fn(() => ({ upsert, select })) } as unknown as SupabaseClient
  return { client, upsert, select }
}

beforeEach(() => {
  remove.mockClear()
})

describe('putPostImage', () => {
  it('never deletes the old file when the write fails', async () => {
    const { client } = fakeAdmin({ storage_path: 'client-1/post-1/1-old.jpg' }, true)

    await expect(putPostImage(client, WRITE)).rejects.toThrow(/unique violation/)

    // The whole point of the upsert. A slide that already had a picture still has it.
    expect(remove).not.toHaveBeenCalled()
  })

  it('unlinks the replaced file once the row points at the new one', async () => {
    const { client, upsert } = fakeAdmin({ storage_path: 'client-1/post-1/1-old.jpg' })

    await putPostImage(client, WRITE)

    expect(upsert).toHaveBeenCalledWith(expect.anything(), { onConflict: 'post_id,position' })
    expect(remove).toHaveBeenCalledWith(['client-1/post-1/1-old.jpg'])
  })

  it('keeps the preserved file alive — the editor still points a doc at it', async () => {
    const clean = 'client-1/post-1/0-clean.jpg'
    const { client } = fakeAdmin({ storage_path: clean })

    await putPostImage(client, { ...WRITE, preserveStoragePath: clean })

    // The canvas save replaces the clean background's ROW with the flattened export while the
    // stored doc still renders over that same file. Deleting it breaks every later edit.
    expect(remove).not.toHaveBeenCalled()
  })

  it('does not delete a file the write is pointing at', async () => {
    const { client } = fakeAdmin({ storage_path: WRITE.storagePath })

    await putPostImage(client, WRITE)

    expect(remove).not.toHaveBeenCalled()
  })

  it('reads the row itself only when the caller has not', async () => {
    const passed = fakeAdmin(null)
    await putPostImage(passed.client, WRITE, { storage_path: 'client-1/post-1/1-old.jpg' })
    // The canvas save and the generator both read this row already; re-reading it here was a
    // second identical query on paths that run once per generated slide.
    expect(passed.select).not.toHaveBeenCalled()
    expect(remove).toHaveBeenCalledWith(['client-1/post-1/1-old.jpg'])

    const omitted = fakeAdmin({ storage_path: 'client-1/post-1/1-old.jpg' })
    await putPostImage(omitted.client, WRITE)
    expect(omitted.select).toHaveBeenCalled()
  })

  it('treats an explicit null as "there was nothing here"', async () => {
    const { client, select } = fakeAdmin({ storage_path: 'should-not-be-read.jpg' })

    await putPostImage(client, WRITE, null)

    expect(select).not.toHaveBeenCalled()
    expect(remove).not.toHaveBeenCalled()
  })
})

describe('putPostImages', () => {
  it('writes a whole carousel in one statement', async () => {
    const { client, upsert } = fakeAdmin(null)

    const rows = await putPostImages(client, [
      { ...WRITE, position: 0 },
      { ...WRITE, position: 1 },
      { ...WRITE, position: 2 },
    ])

    // Approving a wizard draft attaches every slide at once. One round trip, not one per slide.
    expect(upsert).toHaveBeenCalledTimes(1)
    expect(rows).toHaveLength(3)
  })

  it('spells out the columns it has no value for', async () => {
    const { client, upsert } = fakeAdmin(null)

    await putPostImages(client, [
      { postId: 'p', position: 0, publicUrl: 'https://cdn/a.jpg', storagePath: 'c/p/a.jpg' },
    ])

    // PostgREST rejects a batch whose objects have differing keys, so every key is present on
    // every row. It also keeps PostImageWrite honest: an omitted field CLEARS the column.
    expect(upsert.mock.calls[0]?.[0]).toEqual([
      expect.objectContaining({ file_name: null, file_size: null, content_type: null }),
    ])
  })

  it('does not touch storage — cleanup belongs to the single-row path', async () => {
    const { client } = fakeAdmin({ storage_path: 'client-1/post-1/1-old.jpg' })

    await putPostImages(client, [WRITE])

    // The batch is for positions known to be empty. If it silently deleted whatever a position
    // held, the caller that has read nothing would be unlinking files it never looked at.
    expect(remove).not.toHaveBeenCalled()
  })

  it('never issues a statement for an empty carousel', async () => {
    const { client, upsert } = fakeAdmin(null)

    expect(await putPostImages(client, [])).toEqual([])
    expect(upsert).not.toHaveBeenCalled()
  })
})
