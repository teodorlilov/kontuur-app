import { readdirSync, readFileSync, statSync } from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

const SRC = path.resolve(__dirname, '../../..')

/**
 * Every place a person can make Kontuur spend money, publish, or create a brand, and the gate it
 * must carry (src/lib/billing/require-entitled.ts). The gate is one line after the auth at each
 * site rather than inside the auth funnels, so read paths stay open for a paused workspace — and
 * that choice is only safe while this list is what "each site must remember" is checked against.
 *
 * Adding a route or action that reaches a provider means adding it here. The second test makes
 * it automatic: any file under app/ or features/ that declares who is spending (`runAsSpender`)
 * is about to pay a provider and must appear in this list — or in EXEMPT, with the reason its
 * gate lives somewhere else.
 */
const GATED: Record<string, 'spend' | 'publish' | 'create'> = {
  'app/api/ai/analyze-url/route.ts': 'spend',
  'app/api/ai/detect-slop/route.ts': 'spend',
  'app/api/ai/generate-background/route.ts': 'spend',
  'app/api/ai/generate-stream/route.ts': 'spend',
  'app/api/ai/generate-svg/route.ts': 'spend',
  'app/api/ai/generate-visual/route.ts': 'spend',
  'app/api/ai/inpaint/route.ts': 'spend',
  'app/api/ai/isolate-subject/route.ts': 'spend',
  'app/api/ai/rewrite/route.ts': 'spend',
  'app/api/ai/suggest-sources/route.ts': 'spend',
  'app/api/clients/[id]/brand-profile/reanalyze/route.ts': 'spend',
  'app/api/clients/[id]/visual-identity/reanalyze/route.ts': 'spend',
  'app/api/extract/start/route.ts': 'create',
  'app/api/posts/[id]/visuals/route.ts': 'spend',
  'app/api/posts/[id]/publish/route.ts': 'publish',
  'features/clients/actions/style-memo-actions.ts': 'spend',
  'features/clients/actions/client-actions.ts': 'create',
  'lib/actions/post-actions.ts': 'publish',
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (entry !== '__tests__' && entry !== 'node_modules') sourceFiles(full, out)
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

/** Spenders whose gate is not a human's: the crons filter by entitlement before they loop, and the two narratives run only after their page or action checked `canSpend`. */
const EXEMPT: Record<string, string> = {
  'app/api/cron/generate/route.ts':
    'a cron — gated per agency by the entitlements its roster read derives (cron-invariants.test.ts)',
  'app/api/cron/visuals/route.ts':
    'a cron — gated by fetchEntitledClients ahead of its LIMIT (cron-invariants.test.ts)',
  'features/analytics/lib/instagram/narrative.ts':
    'called only after the analytics page or report action checked canSpend; the spender is declared inside the cache callback',
  'features/analytics/lib/facebook/facebook-narrative.ts':
    'the Facebook sibling of the Instagram narrative, under the same check',
}

describe('every human spend, publish and create site carries its gate', () => {
  it('each listed file calls the gate with the need it is listed for', () => {
    const wrong = Object.entries(GATED)
      .map(([rel, need]) => {
        const src = readFileSync(path.join(SRC, rel), 'utf8')
        const gated = new RegExp(`requireEntitled(Route|Action)\\([^)]*'${need}'`).test(src)
        return gated ? null : `${rel} — no requireEntitled*(…, '${need}')`
      })
      .filter((line): line is string => line !== null)

    expect(wrong).toEqual([])
  })

  it('every file that declares a spender is in the list, or exempt with a reason', () => {
    const spenders = sourceFiles(path.join(SRC, 'app'))
      .concat(sourceFiles(path.join(SRC, 'features')))
      .filter((file) => /\brunAsSpender\(/.test(readFileSync(file, 'utf8')))
      .map((file) => path.relative(SRC, file))
      .sort()

    const unlisted = spenders.filter((rel) => !(rel in GATED) && !(rel in EXEMPT))
    expect(unlisted).toEqual([])
    expect(spenders.length).toBeGreaterThanOrEqual(15)
  })
})
