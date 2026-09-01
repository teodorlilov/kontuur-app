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

/**
 * Tables that are deliberately left with no policy at all, i.e. service-role only.
 *
 * Empty, and that is the point. Eleven tables sat here until 2026-08-24 — every read of them
 * went through `createAdminSupabaseClient`, which bypasses RLS, so cross-agency safety was a
 * hand-written predicate repeated across 59 files. `GET /api/extract/status` is what happens
 * when one of them is missed: it read `brand_kit_extractions` on session id alone, and nothing
 * could catch it because the only guard was a convention.
 *
 * Adding an entry here means accepting that posture for that table. Say why, and say what
 * checks ownership instead.
 */
const POLICYLESS: Record<string, string> = {}

interface Policy {
  file: string
  name: string
  table: string
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
    // A quoted name may contain spaces — two of the live policies are spelled
    // "Users can manage their agency's client sources". The previous pattern used
    // `[^"\s]+` for the name, which stopped at the first space, recorded those two as
    // being named `Users`, and never reached their `on` clause. It reported them as
    // checked while checking nothing, which is the §7.4 failure exactly: a detector
    // wrong in the safe-looking direction.
    for (const match of code.matchAll(
      /create\s+policy\s+(?:"([^"]+)"|(\S+))\s+on\s+(?:public\.)?"?([a-z_]+)"?[\s\S]*?;/gi
    )) {
      found.push({
        file,
        name: match[1] ?? match[2] ?? '(unnamed)',
        table: match[3] ?? '',
        body: match[0],
      })
    }
  }
  return found
}

/**
 * Every table in the database, read from the schema baseline plus any migration
 * written since.
 *
 * The baseline is what §8.2 bought beyond "the database can be rebuilt": until
 * `00000000_baseline.sql` existed, the migrations described 12 of 31 tables, so a test could not
 * enumerate what it was supposed to be checking. Coverage was unmeasurable, which is the same
 * reason the bad policy survived — nothing could see the whole surface at once.
 *
 * The later migrations are read too because the baseline is REGENERATED FROM PRODUCTION. A table
 * created in a migration that has not been applied yet is therefore absent from it, and reading
 * the baseline alone made the policy on such a table look like a policy on a table that does not
 * exist. That is backwards: the window between writing a migration and applying it is exactly
 * when this check has the most to say, and it was the one window it was blind in.
 */
function tables(): string[] {
  const sources = readdirSync(MIGRATIONS)
    .filter((name) => name.endsWith('.sql'))
    .map((name) => readFileSync(path.join(MIGRATIONS, name), 'utf8'))
  // `public.` is optional: the baseline is generated fully qualified, hand-written
  // migrations usually are not.
  const found = sources.flatMap((sql) => [
    ...sql.matchAll(/^create table (?:if not exists )?(?:public\.)?([a-z_]+)/gim),
  ])
  return [...new Set(found.map((m) => m[1] ?? ''))]
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

describe('RLS policy coverage', () => {
  const all = policies()
  const declared = tables()
  const covered = new Set(all.map((p) => p.table))

  it('reads the schema baseline', () => {
    // Every assertion below is vacuous if this parses nothing, and it would parse nothing if
    // the baseline were ever regenerated into a different shape.
    expect(declared.length).toBeGreaterThan(25)
  })

  it('every table has a policy', () => {
    const bare = declared.filter((t) => !covered.has(t) && !(t in POLICYLESS))

    // A table with no policy is not "locked down" — it is delegated to code. That is a
    // defensible choice, but it has to be a choice someone made in a diff, not a state a
    // table drifts into by being created in the dashboard.
    expect(bare).toEqual([])
  })

  it('every accepted exception explains itself', () => {
    for (const [table, why] of Object.entries(POLICYLESS)) {
      expect(why.length, `${table} needs a real reason`).toBeGreaterThan(40)
    }
  })

  it('has no stale POLICYLESS entry', () => {
    // Same shrink-only shape as the §7.3/§7.4 backlogs: giving a table a policy and leaving
    // its exemption behind would let the list overstate the debt as easily as understate it.
    expect(Object.keys(POLICYLESS).filter((t) => covered.has(t))).toEqual([])
  })

  it('names a real table in every policy', () => {
    const known = new Set(declared)
    const orphans = all.filter((p) => !known.has(p.table)).map((p) => `${p.file}: ${p.name}`)

    // Catches the parser silently failing and the policy on a table that no longer exists —
    // both of which would otherwise read as coverage.
    expect(orphans).toEqual([])
  })
})
