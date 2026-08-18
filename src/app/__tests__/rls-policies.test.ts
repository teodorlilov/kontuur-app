import { readdirSync, readFileSync } from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

/**
 * No migration may create a policy that is not scoped to a caller.
 *
 * On 2026-08-18 a probe with nothing but the public anon key — no JWT, no session — read
 * rows from `post_approval_tokens`. One policy was responsible:
 *
 *     post_approval_tokens_public_read  FOR SELECT TO public USING (true)
 *
 * `batch_id` in that table is not data, it is the credential: `sendApprovalBatch` mints it
 * as a random UUID so an approval link cannot be guessed, and this published it. Anyone
 * could read a client's unpublished posts and forge their approval.
 *
 * It survived because **no policy had ever been in version control**. All 18 were made in
 * the dashboard, so there was no diff for a reviewer to catch it in. The baseline
 * migration fixes the visibility; this test is what makes visibility worth something.
 *
 * The rule: a `create policy` whose USING/WITH CHECK is `true` — or which names no caller
 * at all — fails. Deliberate exceptions go in EXEMPT with their reason.
 */

const MIGRATIONS = path.resolve(__dirname, '../../../supabase/migrations')

/** How a policy proves it knows who is asking. */
const IDENTIFIES_CALLER = /auth\.uid\(\)|auth\.jwt\(\)|current_setting\(/

/**
 * Policies that legitimately do not scope to one caller's own rows.
 *
 * "The route checks ownership in code" is NOT a reason — the whole point of RLS is that it
 * holds when the code is wrong or bypassed.
 */
const EXEMPT: Record<string, string> = {
  language_rules_read_all:
    'Shared reference data with no agency_id: per-LANGUAGE writing rules (native CTA phrases, formality defaults, banned anglicisms) that are identical for every agency. Still gated on auth.uid() IS NOT NULL and SELECT-only, so it is readable by any signed-in user and writable by none.',
}

interface Policy {
  file: string
  name: string
  body: string
}

/** Every `create policy` statement in the migrations, with its body up to the terminating `;`. */
function policies(): Policy[] {
  const found: Policy[] = []
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql'))) {
    const sql = readFileSync(path.join(MIGRATIONS, file), 'utf8')
    // Comments may quote a bad policy to explain it — the baseline migration's header
    // quotes the exact one that caused this. Strip them before matching.
    const code = sql.replace(/^\s*--.*$/gm, '')
    for (const match of code.matchAll(/create\s+policy\s+"?([^"\s]+)"?[\s\S]*?;/gi)) {
      found.push({ file, name: match[1] ?? '(unnamed)', body: match[0] })
    }
  }
  return found
}

describe('RLS policies in migrations', () => {
  const all = policies()

  it('finds the policies to check', () => {
    // A parser that matched nothing would make every assertion below vacuous. The baseline
    // migration alone carries 17.
    expect(all.length).toBeGreaterThan(10)
  })

  it('has no policy that is open to everyone', () => {
    const offenders = all
      .filter(({ name }) => !(name in EXEMPT))
      .filter(({ body }) => /using\s*\(\s*true\s*\)|with\s+check\s*\(\s*true\s*\)/i.test(body))
      .map(({ file, name }) => `${file}: ${name} — USING (true)`)

    // A `USING (true)` policy leaves a table exactly as exposed as no RLS at all, while
    // reporting as protected to anything that counts policies instead of reading them.
    expect(offenders).toEqual([])
  })

  it('has no policy that cannot tell who is asking', () => {
    const offenders = all
      .filter(({ name }) => !(name in EXEMPT))
      .filter(({ body }) => !IDENTIFIES_CALLER.test(body))
      .map(({ file, name }) => `${file}: ${name} — no auth.uid()/auth.jwt()/current_setting`)

    expect(offenders).toEqual([])
  })

  it('every exemption explains itself', () => {
    for (const [name, why] of Object.entries(EXEMPT)) {
      expect(why.length, `${name} needs a real reason`).toBeGreaterThan(40)
    }
  })

  it('has no stale EXEMPT entry', () => {
    const declared = new Set(all.map((p) => p.name))
    expect(Object.keys(EXEMPT).filter((name) => !declared.has(name))).toEqual([])
  })
})
