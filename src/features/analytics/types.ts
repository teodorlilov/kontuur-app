import type { AnalyticsReportRow } from '@/types'

/**
 * One row of the report archive, as every surface that lists them needs it.
 *
 * Lives here rather than in `report-archive.tsx` because it crosses the page boundary: the
 * analytics page constructs these and hands them down, so a server page was reaching into a
 * component module for a type. The four other features with a `types.ts` set the precedent.
 */
export type ArchiveEntry = Pick<
  AnalyticsReportRow,
  'id' | 'period_start' | 'period_end' | 'created_at'
>
