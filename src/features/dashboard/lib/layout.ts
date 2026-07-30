/**
 * Geometry shared by the two columns under the stat row. The coverage list and
 * the review queue sit side by side, so their scroll areas have to resolve to
 * the same height — reserving it here keeps a part-full page of clients from
 * shrinking the section, and keeps the two files from drifting apart.
 */

/** Clients per page of the coverage list. */
export const COVERAGE_ROWS_PER_PAGE = 3

/** A row is its 44px badge plus 14px padding top and bottom. */
const COVERAGE_ROW_HEIGHT = 72
const COVERAGE_ROW_GAP = 12

/** Height both columns reserve for their row area. */
export const COVERAGE_LIST_HEIGHT =
  COVERAGE_ROWS_PER_PAGE * COVERAGE_ROW_HEIGHT + (COVERAGE_ROWS_PER_PAGE - 1) * COVERAGE_ROW_GAP
