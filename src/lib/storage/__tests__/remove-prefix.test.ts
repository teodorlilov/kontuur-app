import { describe, expect, it, vi } from 'vitest'
import { collectPrefixObjects } from '../remove-prefix'

/**
 * The walk behind deleteClient's storage sweep.
 *
 * Every defect here is invisible in review and expensive in production: a missed recursion
 * level silently orphans a client's images forever, and a paging bug stops at 100 objects
 * while reporting success. The lister is injected precisely so this can be exercised without
 * a storage client.
 */

/** A page of entries. Folders arrive with a null id — the only thing marking them as folders. */
function file(name: string) {
  return { name, id: `id-${name}` }
}
function folder(name: string) {
  return { name, id: null }
}

/** A lister backed by a fixed prefix→entries map, recording the calls it received. */
function listerFor(tree: Record<string, Array<{ name: string; id: string | null }>>) {
  const calls: Array<{ prefix: string; offset: number }> = []
  const list = vi.fn(async (prefix: string, offset: number) => {
    calls.push({ prefix, offset })
    return (tree[prefix] ?? []).slice(offset, offset + 100)
  })
  return { list, calls }
}

describe('collectPrefixObjects', () => {
  it('returns the objects directly under a flat prefix', async () => {
    const { list } = listerFor({ 'client-1': [file('a.jpg'), file('b.jpg')] })
    expect(await collectPrefixObjects(list, 'client-1')).toEqual([
      'client-1/a.jpg',
      'client-1/b.jpg',
    ])
  })

  it('descends into folders instead of reporting them as objects', async () => {
    // The real shape: {clientId}/{postId}/file and {clientId}/drafts/{draftId}/assets/file.
    // A folder emitted as a path would be handed to .remove(), which silently does nothing —
    // the files under it survive and nothing says so.
    const { list } = listerFor({
      'client-1': [folder('post-1'), folder('drafts')],
      'client-1/post-1': [file('hero.jpg')],
      'client-1/drafts': [folder('draft-9')],
      'client-1/drafts/draft-9': [file('0-preview.jpg'), folder('assets')],
      'client-1/drafts/draft-9/assets': [file('logo.svg')],
    })

    expect(await collectPrefixObjects(list, 'client-1')).toEqual([
      'client-1/post-1/hero.jpg',
      'client-1/drafts/draft-9/0-preview.jpg',
      'client-1/drafts/draft-9/assets/logo.svg',
    ])
  })

  it('keeps paging while a page comes back full', async () => {
    // A client with more than 100 objects is ordinary. Stopping at the first page would
    // report success having swept a fraction of the tree.
    const many = Array.from({ length: 250 }, (_, i) => file(`${i}.jpg`))
    const { list, calls } = listerFor({ 'client-1': many })

    const paths = await collectPrefixObjects(list, 'client-1')

    expect(paths).toHaveLength(250)
    expect(paths[0]).toBe('client-1/0.jpg')
    expect(paths[249]).toBe('client-1/249.jpg')
    // 100, 100, 50 — the short page is what ends the loop.
    expect(calls.map((c) => c.offset)).toEqual([0, 100, 200])
  })

  it('stops at an empty prefix without looping', async () => {
    const { list, calls } = listerFor({})
    expect(await collectPrefixObjects(list, 'client-1')).toEqual([])
    expect(calls).toHaveLength(1)
  })
})
