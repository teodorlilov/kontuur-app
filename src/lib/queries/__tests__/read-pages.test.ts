import { describe, expect, it } from 'vitest'
import { PostgrestError } from '@supabase/supabase-js'
import { readPages } from '../read-pages'

/** A table of `count` numbered rows, answered by range the way PostgREST answers `.range()`. */
function table(count: number, failAt?: number) {
  const rows = Array.from({ length: count }, (_, i) => ({ n: i }))
  const ranges: Array<[number, number]> = []
  const readPage = (from: number, to: number) => {
    ranges.push([from, to])
    if (from === failAt) {
      const error = new PostgrestError({ message: 'timeout', details: '', hint: '', code: '' })
      return Promise.resolve({ data: null, error })
    }
    return Promise.resolve({ data: rows.slice(from, to + 1), error: null })
  }
  return { readPage, ranges }
}

async function collect<Row>(pages: AsyncGenerator<Row[]>): Promise<Row[][]> {
  const out: Row[][] = []
  for await (const page of pages) out.push(page)
  return out
}

describe('readPages', () => {
  it('reads past the 1000-row answer, a page at a time, until a page comes back short', async () => {
    const { readPage, ranges } = table(2500)
    const pages = await collect(readPages('rows read', readPage))
    expect(ranges).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ])
    expect(pages.map((page) => page.length)).toEqual([1000, 1000, 500])
    expect(pages.flat().map((row) => row.n)).toEqual(Array.from({ length: 2500 }, (_, i) => i))
  })

  it('never yields an empty page, whether the read is empty or ends on a full page', async () => {
    expect(await collect(readPages('rows read', table(0).readPage))).toEqual([])
    const exact = table(4)
    const pages = await collect(readPages('rows read', exact.readPage, 2))
    expect(pages.map((page) => page.length)).toEqual([2, 2])
    expect(exact.ranges).toEqual([
      [0, 1],
      [2, 3],
      [4, 5],
    ])
  })

  it('yields the pages before a failed one, for a caller that keeps a partial read, then throws naming the read', async () => {
    const { readPage } = table(10, 4)
    const seen: number[][] = []
    await expect(
      (async () => {
        for await (const page of readPages('rows read', readPage, 2)) {
          seen.push(page.map((row) => row.n))
        }
      })()
    ).rejects.toThrow('rows read failed: timeout')
    expect(seen).toEqual([
      [0, 1],
      [2, 3],
    ])
  })
})
