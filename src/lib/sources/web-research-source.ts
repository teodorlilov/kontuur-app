import type { Json } from '@/types'
import { WEB_RESEARCH_SOURCE_LABEL } from '@/utils/constants'

/**
 * The `client_sources` row that represents a client's web research.
 *
 * Web research is a per-client capability rather than a source someone adds, so it has no "add"
 * button: the row is seeded when the client is created, and the sources screen only ever toggles
 * and configures it. That made its shape an invariant asserted in three places — `createClient`'s
 * seed, `setWebResearch`'s insert branch, and the SQL backfill in migration 20260814 — and they
 * had already drifted, with one sending `config` explicitly and the other riding the column default.
 *
 * Nothing read that difference. It is the state a duplicated row shape sits in right up until
 * someone adds a fifth column to one copy: `shouldSearchWeb` is `!!tavilyRow`, so a row that fails
 * to match turns web research off for a client with no error anywhere.
 *
 * The SQL backfill is deliberately NOT folded in — it runs once, against clients that predate the
 * seed, and a migration cannot import TypeScript.
 */
export function webResearchSourceRow(
  clientId: string,
  options?: { isActive?: boolean; config?: Json }
): {
  client_id: string
  type: 'tavily'
  label: string
  url: string
  is_active: boolean
  config: Json
} {
  return {
    client_id: clientId,
    type: 'tavily',
    label: WEB_RESEARCH_SOURCE_LABEL,
    // `url` is NOT NULL and this source has no URL — the research runs against the open web.
    url: '',
    is_active: options?.isActive ?? true,
    config: options?.config ?? {},
  }
}
