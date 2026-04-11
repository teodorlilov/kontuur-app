import type { ClientSourceRow } from '../types'
import type { ResearchSource } from './research-source'
import { RssResearchSource } from './rss-source'
import { WebsiteResearchSource } from './website-source'
import { FileResearchSource } from './file-source'

/** Create a ResearchSource from a DB row. Returns null for unknown types. */
export function createSource(row: ClientSourceRow): ResearchSource | null {
  switch (row.type) {
    case 'rss':
      return new RssResearchSource(row)
    case 'website':
      return new WebsiteResearchSource(row)
    case 'file':
      return new FileResearchSource(row)
    default:
      return null
  }
}

/** Create sources from all DB rows, filtering out unknown types. */
export function createAllSources(rows: ClientSourceRow[]): ResearchSource[] {
  return rows.map((r) => createSource(r)).filter((s): s is ResearchSource => s !== null)
}
