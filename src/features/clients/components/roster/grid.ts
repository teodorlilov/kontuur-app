/**
 * One grid template shared by the header row and every body row, so the two can
 * never drift out of alignment.
 *
 * Applied to <tr> rather than to a div stack: `display: grid` on a table row
 * reproduces the mock's column widths while keeping real <th scope="col">
 * association for screen readers.
 *
 * Below 1180px the Channels and Next-post columns are dropped rather than
 * squeezed — the mock's call, carried over deliberately.
 */
export const ROSTER_GRID = [
  'grid gap-[18px]',
  'grid-cols-[minmax(170px,1.4fr)_minmax(170px,1fr)_26px]',
  'min-[1180px]:grid-cols-[minmax(190px,1.45fr)_116px_minmax(178px,1fr)_112px_26px]',
].join(' ')
