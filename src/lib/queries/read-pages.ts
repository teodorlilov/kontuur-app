import type { PostgrestError } from '@supabase/supabase-js'
import { unwrap } from './unwrap'

/**
 * The most rows PostgREST answers in one response — Supabase's default Max Rows; past it the rest
 * are cut without an error — and so the largest page `readPages` may ask for.
 */
const MAX_PAGE_ROWS = 1000

/**
 * Every page of an ordered PostgREST read, `pageSize` rows at a time, ending on the first short
 * page — so a read PostgREST would cut at its row cap is read whole. `readPage(from, to)` builds
 * the query for that inclusive row range. Its order must be total (end on a unique column), or rows
 * move between pages and are read twice or never; and a caller that takes rows out of its own
 * filter while it pages (a delivery stamping what it read) reads every page first, since each page
 * is an offset. A page is never empty. A failed page throws from the iteration (`unwrap`, named
 * `what`) after the pages before it were yielded, so a caller that keeps a partial read tells the
 * first page failing from a later one by what it already holds. `pageSize` must not pass
 * `MAX_PAGE_ROWS`, or a full page would look short and end the read early.
 */
export async function* readPages<Row>(
  what: string,
  readPage: (
    from: number,
    to: number
  ) => PromiseLike<{ data: Row[] | null; error: PostgrestError | null }>,
  pageSize = MAX_PAGE_ROWS
): AsyncGenerator<Row[]> {
  for (let from = 0; ; from += pageSize) {
    const rows = unwrap(await readPage(from, from + pageSize - 1), what) ?? []
    if (rows.length > 0) yield rows
    if (rows.length < pageSize) return
  }
}
