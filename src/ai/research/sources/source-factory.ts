import type { ClientSourceRow } from '../types'
import type { ResearchSource } from './research-source'
import { RssResearchSource } from './rss-source'
import { WebsiteResearchSource } from './website-source'
import { FileResearchSource } from './file-source'

/**
 * Factory for creating the correct ResearchSource subclass
 * based on the database row's type field.
 */
export class SourceFactory {
  /** Create a ResearchSource from a DB row. Returns null for unknown types. */
  static create(row: ClientSourceRow): ResearchSource | null {
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

  /** Create an array of sources from DB rows, filtering out unknown types. */
  static createAll(rows: ClientSourceRow[]): ResearchSource[] {
    return rows
      .map((r) => SourceFactory.create(r))
      .filter((s): s is ResearchSource => s !== null)
  }
}
