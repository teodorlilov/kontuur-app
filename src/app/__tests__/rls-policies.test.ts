import { readdirSync, readFileSync } from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

/**
 * No migration may create a policy that is not scoped to a caller: a `create policy` whose
 * USING/WITH CHECK is `true`, or which never reads auth.uid()/auth.jwt()/current_setting(), fails.
 * Deliberate exceptions go in EXEMPT with their reason. A `USING (true)` policy once exposed
 * `post_approval_tokens.batch_id`, the credential in every approval link, to the bare anon key
 * (20260818_drop_approval_token_public_read.sql).
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
  intelligence_briefings_read_all:
    'Shared reference data with no agency_id: the one weekly platform brief every dashboard shows (migration 20260851). Same posture as language_rules — gated on auth.uid() IS NOT NULL, SELECT-only, written only by the cron through the service role.',
}

/**
 * Tables deliberately left with no policy at all: RLS is enabled on each (the migration its entry
 * names), so only the service role reaches it, through `createAdminSupabaseClient`, which bypasses
 * RLS. Nothing in the database then keeps one agency out of another's rows; the server code that
 * touches the table is the only guard.
 *
 * A table belongs here only when no policy could name a caller as the owner of its rows: a row
 * that belongs to no tenant (the document counter), a claim only server code takes and releases
 * (a visual job), or a proof of membership read before its user has a workspace (an invite).
 * Adding an entry means accepting that posture for the table. Say why no policy can name a caller,
 * and what checks ownership instead.
 */
const POLICYLESS: Record<string, string> = {
  document_counters:
    'One counter row, read and written by the service role alone through the issue_sale_document RPC (migration 20260855). No tenant ever selects it, so no predicate could name a caller; the row belongs to nobody, and ownership is not a concept here.',
  post_visual_jobs:
    'A claim on a slide position while its picture is being generated (migration 20260859), taken and released by the service role inside generatePostVisual and read by the server components that decide what still owes a picture. No browser touches it; a forgeable claim would let one session stop another generating, which is exactly what the service-role-only posture prevents.',
  team_invites:
    'An invite is the one proof of which workspace a new login may join (migration 20260861). It is written by inviteMember (src/features/settings/lib/invite-member.ts) after the admin check in the invite route, read by createUserRecord through the service role, and removed with a member. An invitee has no workspace yet, so no predicate could name them as its owner; letting any session read or write it would bring back the user_metadata hole it replaces.',
}

interface Policy {
  file: string
  name: string
  table: string
  body: string
}

/**
 * Every `create policy` statement in the migrations, with its body up to the terminating `;`.
 * Whole-line SQL comments are stripped first, because a migration's header may quote a bad policy
 * to explain it. A quoted name may contain spaces ("Users can manage their agency's client
 * sources"), so the quoted-name branch must not stop at whitespace: one that did recorded such a
 * policy as `Users` and skipped its body.
 */
function policies(): Policy[] {
  const found: Policy[] = []
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql'))) {
    const sql = readFileSync(path.join(MIGRATIONS, file), 'utf8')
    const code = sql.replace(/^\s*--.*$/gm, '')
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
 * Every table a migration creates: the schema baseline (regenerated from production) plus every
 * later migration, since a table whose migration is not applied yet is absent from the baseline
 * and its policy would otherwise look orphaned. `drop table` is not read, so a dropped table still
 * counts. `public.` is optional: the baseline is fully qualified, hand-written migrations usually
 * are not.
 */
function tables(): string[] {
  const sources = readdirSync(MIGRATIONS)
    .filter((name) => name.endsWith('.sql'))
    .map((name) => readFileSync(path.join(MIGRATIONS, name), 'utf8'))
  const found = sources.flatMap((sql) => [
    ...sql.matchAll(/^create table (?:if not exists )?(?:public\.)?([a-z_]+)/gim),
  ])
  return [...new Set(found.map((m) => m[1] ?? ''))]
}

describe('RLS policies in migrations', () => {
  const all = policies()

  it('finds the policies to check, since a parser that matched nothing would let the policy checks below pass vacuously', () => {
    expect(all.length).toBeGreaterThan(10)
  })

  it('has no policy open to everyone: USING/WITH CHECK (true) is as exposed as no RLS, yet still counts as a policy', () => {
    const offenders = all
      .filter(({ name }) => !(name in EXEMPT))
      .filter(({ body }) => /using\s*\(\s*true\s*\)|with\s+check\s*\(\s*true\s*\)/i.test(body))
      .map(({ file, name }) => `${file}: ${name} — USING (true)`)

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

  it('reads the schema baseline, since a baseline the parser misses would drop its tables from the coverage check', () => {
    expect(declared.length).toBeGreaterThan(25)
  })

  it('every table has a policy or a POLICYLESS entry: leaving a table to code must be a choice made in a diff', () => {
    const bare = declared.filter((t) => !covered.has(t) && !(t in POLICYLESS))

    expect(bare).toEqual([])
  })

  it('every accepted exception explains itself', () => {
    for (const [table, why] of Object.entries(POLICYLESS)) {
      expect(why.length, `${table} needs a real reason`).toBeGreaterThan(40)
    }
  })

  it('has no POLICYLESS entry for a table that has a policy, so the list never overstates what is left to code', () => {
    expect(Object.keys(POLICYLESS).filter((t) => covered.has(t))).toEqual([])
  })

  it('names a real table in every policy, so a misparsed table name cannot read as coverage', () => {
    const known = new Set(declared)
    const orphans = all.filter((p) => !known.has(p.table)).map((p) => `${p.file}: ${p.name}`)

    expect(orphans).toEqual([])
  })
})
