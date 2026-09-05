/**
 * One grid template shared by the header row and every body row, so the two can
 * never drift out of alignment.
 *
 * Applied to `<tr>` rather than to a div stack: `display: grid` on a table row
 * gives the column widths freely while keeping real `<th scope="col">`
 * association for screen readers — the same trade `ROSTER_GRID` makes on
 * /clients, and the reason both surfaces are real tables.
 *
 * Below 1180px Target drops rather than squeezes. A clipped date
 * reads as a different date, which is worse than not showing one.
 */
export const IDEA_GRID = [
  'grid items-center gap-3.5 px-4',
  'grid-cols-[22px_minmax(0,1fr)_66px_minmax(150px,auto)]',
  'min-[1180px]:grid-cols-[22px_minmax(0,1fr)_116px_66px_minmax(150px,auto)]',
].join(' ')

/** Cells that drop with the columns above. */
export const IDEA_GRID_DROP = 'hidden min-[1180px]:block'
