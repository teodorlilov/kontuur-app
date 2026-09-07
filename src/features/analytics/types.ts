import type { AnalyticsReportRow } from '@/types'

/**
 * One row of the report archive, as every surface that lists them needs it.
 *
 * Here rather than in `report-archive.tsx` because it crosses the page boundary: the analytics
 * page fetches these (`fetchReportArchive`) and hands them to both documents, so keeping the
 * type in a component module would have a server page importing from one.
 */
export type ArchiveEntry = Pick<
  AnalyticsReportRow,
  'id' | 'period_start' | 'period_end' | 'created_at'
>
