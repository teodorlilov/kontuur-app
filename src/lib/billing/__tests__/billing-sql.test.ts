import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * The billing SQL, run for real on PGlite: every other billing test mocks the admin client's `rpc`,
 * which is how a `settle_usage` that dropped landed units passed
 * (supabase/migrations/20260858_age_the_reservation_reset.sql, fix 2). The database is the
 * production baseline (a snapshot at 20260831) plus the billing migrations, unmodified, behind the
 * platform objects they reference: the API roles, `auth.users` with `auth.uid()`, and
 * `storage.buckets`. The review files replay in production's own order (HISTORY), and between
 * steps the test writes what the code running at the time wrote, because those rows are what each
 * backfill exists for.
 */

const MIGRATIONS = path.join(process.cwd(), 'supabase', 'migrations')

const PLATFORM = `
  set timezone to 'UTC';
  create role anon; create role authenticated; create role service_role;
  create schema auth;
  create table auth.users (
    id uuid primary key, email text, raw_user_meta_data jsonb,
    invited_at timestamptz, last_sign_in_at timestamptz, email_confirmed_at timestamptz
  );
  create function auth.uid() returns uuid language sql stable as 'select null::uuid';
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean);
`

const BEFORE_REVIEW = [
  '00000000_baseline.sql',
  '20260852_billing_foundation.sql',
  '20260853_billing_followups.sql',
  '20260855_billing_documents.sql',
  '20260857_count_what_landed.sql',
  '20260858_age_the_reservation_reset.sql',
]

const TRIAL_ENDING = '00000000-0000-4000-8000-000000000001'
const PAST_DUE = '00000000-0000-4000-8000-000000000002'
const IN_GRACE = '00000000-0000-4000-8000-000000000003'
const WAS_PRO = '00000000-0000-4000-8000-000000000004'
const PAUSED = '00000000-0000-4000-8000-000000000005'
const SIGNED_UP_WITHOUT_DEFAULT = '00000000-0000-4000-8000-000000000006'
const FORGED = '00000000-0000-4000-8000-0000000000f1'

/**
 * Rows that existed before the review's first migration: workspaces, bells with no key, a login
 * with forged invite metadata, a reservation with no `reserved_at`, and runs of the old code.
 */
const LEGACY = `
  insert into agencies (id, name, trial_ends_at, plan) values
    ('${TRIAL_ENDING}', 'Ending', now() + interval '2 days', 'trial'),
    ('${PAST_DUE}', 'Past due', now() - interval '40 days', 'pro'),
    ('${IN_GRACE}', 'In grace', now() - interval '1 day', 'trial'),
    ('${WAS_PRO}', 'Was pro', now() - interval '40 days', 'pro'),
    ('${PAUSED}', 'Paused', now() - interval '8 days', 'trial');
  update agencies set stripe_subscription_id = 'sub_1', subscription_status = 'past_due',
    past_due_since = now() - interval '2 days' where id = '${PAST_DUE}';
  update agencies set stripe_subscription_id = 'sub_2', subscription_status = 'active'
    where id = '${WAS_PRO}';

  insert into notifications (id, agency_id, type, message, created_at) values
    ('10000000-0000-4000-8000-000000000001', '${TRIAL_ENDING}', 'trial_ending', 'old trial', now() - interval '20 days'),
    ('10000000-0000-4000-8000-000000000002', '${TRIAL_ENDING}', 'trial_ending', 'first', now() - interval '12 hours'),
    ('10000000-0000-4000-8000-000000000003', '${TRIAL_ENDING}', 'trial_ending', 'raced', now() - interval '2 hours'),
    ('10000000-0000-4000-8000-000000000004', '${PAST_DUE}', 'payment_failed', 'last episode', now() - interval '30 days'),
    ('10000000-0000-4000-8000-000000000005', '${PAST_DUE}', 'payment_failed', 'this episode', now() - interval '1 day');

  insert into auth.users (id, email, raw_user_meta_data, invited_at) values
    ('${FORGED}', 'forged@example.test', '{"invited_agency_id": "${TRIAL_ENDING}", "role": "admin"}', now());

  insert into usage_counters (agency_id, period, kind, count, pending, reserved_at) values
    ('${TRIAL_ENDING}', 'stranded', 'draft', 1, 3, null);

  insert into generation_runs (id, status, created_at, kind) values
    ('20000000-0000-4000-8000-000000000001', 'running', now() - interval '2 days', 'cron'),
    ('20000000-0000-4000-8000-000000000002', 'running', now() - interval '1 hour', 'manual');
`

/** One step of production's history: a migration, then what the running code wrote before the next. */
interface Step {
  file: string
  then?: string
}

const HISTORY: Step[] = [
  {
    file: '20260861_billing_review_additive.sql',
    then: `insert into notifications (id, agency_id, type, message, created_at) values
      ('10000000-0000-4000-8000-000000000006', '${TRIAL_ENDING}', 'trial_ending', 'window', now()),
      ('10000000-0000-4000-8000-000000000007', '${IN_GRACE}', 'trial_ended', 'window', now());`,
  },
  {
    file: '20260862_billing_review_cleanup.sql',
    then: `insert into agencies (id, name, mode) values
      ('${SIGNED_UP_WITHOUT_DEFAULT}', 'Signed up', 'agency');`,
  },
  {
    file: '20260863_billing_review_restore.sql',
    then: `insert into notifications (id, agency_id, type, message, created_at) values
      ('10000000-0000-4000-8000-000000000008', '${PAUSED}', 'workspace_paused', 'before deploy', now());`,
  },
  { file: '20260861_billing_review_additive.sql' },
  { file: '20260862_billing_review_cleanup.sql' },
  { file: '20260864_clients_delete_admin_only.sql' },
]

let db: PGlite
let restored: PGlite

/** The baseline, the billing files before the review, the legacy rows, then `steps` in order. */
async function databaseAfter(steps: Step[]): Promise<PGlite> {
  const built = new PGlite()
  await built.exec(PLATFORM)
  for (const file of BEFORE_REVIEW) await built.exec(migration(file))
  await built.exec(LEGACY)
  for (const step of steps) {
    await built.exec(migration(step.file))
    if (step.then) await built.exec(step.then)
  }
  return built
}

function migration(file: string): string {
  return readFileSync(path.join(MIGRATIONS, file), 'utf8')
}

async function keyOf(id: string): Promise<string | null> {
  const { rows } = await db.query<{ dedup_key: string | null }>(
    'select dedup_key from notifications where id = $1',
    [id]
  )
  return rows[0]?.dedup_key ?? null
}

async function issue(payload: Record<string, unknown>) {
  const { rows } = await db.query<{
    id: string
    number: string
    issued_at: Date
    tax_event_at: Date
    vat_rate: string
  }>(
    'select id, number, issued_at, tax_event_at, vat_rate::text as vat_rate from issue_sale_document($1::jsonb)',
    [JSON.stringify(payload)]
  )
  return rows[0]!
}

/** A paid invoice's document input, as `issueSaleDocument` sends it after the review. */
function invoicePayload(stripeInvoiceId: string, overrides: Record<string, unknown> = {}) {
  return {
    kind: 'invoice',
    agency_id: TRIAL_ENDING,
    stripe_invoice_id: stripeInvoiceId,
    stripe_charge_id: 'ch_1',
    tax_event_at: '2026-09-20T10:00:00Z',
    customer: { name: 'Acme', email: 'billing@acme.test', address: null, taxIds: [] },
    lines: [{ description: 'Kontuur', quantity: 1, unitCents: 2900, netCents: 2900 }],
    net_cents: 2900,
    vat_cents: 740,
    gross_cents: 3640,
    vat_rate: 25.5,
    vat_basis: 'oss',
    ...overrides,
  }
}

beforeAll(async () => {
  restored = await databaseAfter(HISTORY.slice(0, 3))
  db = await databaseAfter(HISTORY)
}, 60_000)

afterAll(async () => {
  await Promise.all([db.close(), restored.close()])
})

/** What the code deployed before the review (e737ab4a) reads, back after 20260863. */
describe('20260863 restores what the deployed code reads', () => {
  it('brings back the snapshot column and an optional tax point', async () => {
    const { rows } = await restored.query<{ column_name: string; is_nullable: string }>(
      `select column_name, is_nullable from information_schema.columns
       where (table_name, column_name) in (('agencies','billing_updated_at'), ('sale_documents','tax_event_at'))
       order by column_name`
    )
    expect(rows).toEqual([
      { column_name: 'billing_updated_at', is_nullable: 'YES' },
      { column_name: 'tax_event_at', is_nullable: 'YES' },
    ])
  })

  it('turns workspaces carrying a subscription id back to pro, and leaves a trial without one a trial', async () => {
    const { rows } = await restored.query<{ id: string; plan: string }>(
      'select id, plan from agencies where id = any($1) order by id',
      [[TRIAL_ENDING, PAST_DUE, WAS_PRO]]
    )
    expect(rows.map((row) => row.plan)).toEqual(['trial', 'pro', 'pro'])
  })

  it('lets the settings route write name and timezone again, and nothing else', async () => {
    const { rows } = await restored.query<{ name: boolean; timezone: boolean; plan: boolean }>(
      `select has_column_privilege('authenticated', 'public.agencies', 'name', 'UPDATE') as name,
              has_column_privilege('authenticated', 'public.agencies', 'timezone', 'UPDATE') as timezone,
              has_column_privilege('authenticated', 'public.agencies', 'plan', 'UPDATE') as plan`
    )
    expect(rows[0]).toEqual({ name: true, timezone: true, plan: false })
  })

  it('gives a signup made while the default was gone its fortnight, and a new signup the default', async () => {
    const window = await restored.query<{ gap: string }>(
      `select (trial_ends_at - (created_at at time zone 'UTC'))::text as gap from agencies where id = $1`,
      [SIGNED_UP_WITHOUT_DEFAULT]
    )
    expect(window.rows[0]?.gap).toBe('14 days')
    const fresh = await restored.query<{ has_trial: boolean }>(
      `insert into agencies (name, mode) values ('Fresh', 'agency') returning trial_ends_at is not null as has_trial`
    )
    expect(fresh.rows[0]?.has_trial).toBe(true)
  })
})

describe('the review migrations apply on the production baseline', () => {
  it('keys the newest legacy bell inside its window, not an older one or one about an earlier date', async () => {
    const endsOn = (
      await db.query<{ day: string }>(
        `select to_char(trial_ends_at at time zone 'UTC', 'YYYY-MM-DD') as day from agencies where id = $1`,
        [TRIAL_ENDING]
      )
    ).rows[0]!.day
    expect(await keyOf('10000000-0000-4000-8000-000000000003')).toBe(`trial_ending:${endsOn}`)
    expect(await keyOf('10000000-0000-4000-8000-000000000002')).toBeNull()
    expect(await keyOf('10000000-0000-4000-8000-000000000001')).toBeNull()
    expect(await keyOf('10000000-0000-4000-8000-000000000005')).toMatch(
      /^payment_failed:\d{4}-\d{2}-\d{2}$/
    )
    expect(await keyOf('10000000-0000-4000-8000-000000000004')).toBeNull()
  })

  it('re-runs the key backfill across the deploy window: keys what the old code wrote since, never a key already held', async () => {
    expect(await keyOf('10000000-0000-4000-8000-000000000006')).toBeNull()
    expect(await keyOf('10000000-0000-4000-8000-000000000007')).toMatch(/^trial_ended:/)
    expect(await keyOf('10000000-0000-4000-8000-000000000008')).toMatch(/^workspace_paused:/)
    const { rows } = await db.query<{ n: number }>(
      `select count(*)::int as n from notifications where dedup_key is not null
       group by agency_id, dedup_key having count(*) > 1`
    )
    expect(rows).toEqual([])
    const fn = await db.query(`select 1 from pg_proc where proname = 'billing_backfill_dedup_keys'`)
    expect(fn.rows).toEqual([])
  })

  it('refuses a second row with the same key in the unique index, not through a racy read', async () => {
    const taken = (await keyOf('10000000-0000-4000-8000-000000000003'))!
    await expect(
      db.query(
        'insert into notifications (agency_id, type, message, dedup_key) values ($1, $2, $3, $4)',
        [TRIAL_ENDING, 'trial_ending', 'again', taken]
      )
    ).rejects.toThrow(/notifications_agency_dedup_key/)
  })

  it('makes no invite from user-written metadata', async () => {
    const { rows } = await db.query('select 1 from team_invites where auth_user_id = $1', [FORGED])
    expect(rows).toEqual([])
  })

  it('dates reservations stranded before reserved_at existed, so the daily release frees them', async () => {
    const { rows } = await db.query<{ old: boolean }>(
      `select reserved_at < now() - interval '10 minutes' as old from usage_counters where period = 'stranded'`
    )
    expect(rows[0]?.old).toBe(true)
  })

  it('narrows the plan to what the column alone says', async () => {
    const { rows } = await db.query<{ plan: string }>('select plan from agencies where id = $1', [
      WAS_PRO,
    ])
    expect(rows[0]?.plan).toBe('trial')
    await expect(
      db.query(`update agencies set plan = 'pro' where id = $1`, [WAS_PRO])
    ).rejects.toThrow(/agencies_plan_check/)
  })

  it('drops the write-only column and adds the claim, the period and the tax point', async () => {
    const { rows } = await db.query<{ table_name: string; column_name: string }>(
      `select table_name, column_name from information_schema.columns
       where (table_name, column_name) in (('agencies','billing_updated_at'), ('agencies','quantity_sync_at'),
         ('generation_runs','period_key'), ('sale_documents','tax_event_at'))`
    )
    expect(rows.map((row) => `${row.table_name}.${row.column_name}`).sort()).toEqual([
      'agencies.quantity_sync_at',
      'generation_runs.period_key',
      'sale_documents.tax_event_at',
    ])
  })

  it('closes a run left running from before the closer, and leaves one still inside its window', async () => {
    const { rows } = await db.query<{ id: string; status: string }>(
      'select id, status from generation_runs order by created_at'
    )
    expect(rows.map((row) => row.status)).toEqual(['failed', 'running'])
  })

  it('refuses a role the app does not check', async () => {
    await db.exec(
      `insert into auth.users (id, email) values ('30000000-0000-4000-8000-000000000001', 'x@example.test')`
    )
    await expect(
      db.query(
        `insert into users (id, agency_id, email, role) values ($1, $2, 'x@example.test', 'owner')`,
        ['30000000-0000-4000-8000-000000000001', TRIAL_ENDING]
      )
    ).rejects.toThrow(/users_role_check/)
  })
})

describe('the allowance ledger', () => {
  it('consume_usage caps landed plus in flight, refusing a second reservation past count + pending', async () => {
    const first = await db.query<{ allowed: boolean; used: number }>(
      `select * from consume_usage($1, 'p1', 'draft', 3, 5)`,
      [PAST_DUE]
    )
    expect(first.rows[0]).toEqual({ allowed: true, used: 3 })
    const second = await db.query<{ allowed: boolean; used: number }>(
      `select * from consume_usage($1, 'p1', 'draft', 3, 5)`,
      [PAST_DUE]
    )
    expect(second.rows[0]).toEqual({ allowed: false, used: 3 })
  })

  it('settle_usage counts what landed and releases the reservation, even in a period with no row', async () => {
    await db.query(`select settle_usage($1, 'p1', 'draft', 3, 2)`, [PAST_DUE])
    const p1 = await db.query<{ count: number; pending: number }>(
      `select count, pending from usage_counters where agency_id = $1 and period = 'p1' and kind = 'draft'`,
      [PAST_DUE]
    )
    expect(p1.rows[0]).toEqual({ count: 2, pending: 0 })
    await db.query(`select settle_usage($1, 'p2', 'image', 1, 1)`, [PAST_DUE])
    const p2 = await db.query<{ count: number }>(
      `select count from usage_counters where agency_id = $1 and period = 'p2'`,
      [PAST_DUE]
    )
    expect(p2.rows[0]?.count).toBe(1)
  })

  it('settle_usage with nothing released, as closeAbandonedRuns sends it for a run reserved before the last daily reset, counts and leaves pending to the reset', async () => {
    await db.query(`select * from consume_usage($1, 'p3', 'draft', 2, 10)`, [PAST_DUE])
    await db.query(`select settle_usage($1, 'p3', 'draft', 0, 1)`, [PAST_DUE])
    const { rows } = await db.query<{ count: number; pending: number }>(
      `select count, pending from usage_counters where agency_id = $1 and period = 'p3'`,
      [PAST_DUE]
    )
    expect(rows[0]).toEqual({ count: 1, pending: 2 })
  })

  it('add_ai_usage accumulates fractional cents, so small calls add up instead of rounding to nothing', async () => {
    for (let call = 0; call < 2; call++) {
      await db.query(
        `select add_ai_usage($1, current_date, 'tavily', 'search', 'sources', 1, 0, 0, 0, 0, 0.688)`,
        [PAST_DUE]
      )
    }
    const { rows } = await db.query<{ cost: string }>(
      `select cost_eur_cents::text as cost from ai_usage_daily where agency_id = $1 and provider = 'tavily'`,
      [PAST_DUE]
    )
    expect(rows[0]?.cost).toBe('1.3760')
  })
})

describe('the one writer of sale documents', () => {
  it('returns the existing row, burning no number, for a Stripe id it has seen', async () => {
    const first = await issue(invoicePayload('in_same'))
    const again = await issue(invoicePayload('in_same'))
    expect(again.id).toBe(first.id)
    expect(again.number).toBe(first.number)
  })

  it("dates in number order, keeps the exact rate and the payment's tax point", async () => {
    const earlier = await issue(invoicePayload('in_a'))
    const later = await issue(invoicePayload('in_b'))
    expect(BigInt(later.number)).toBe(BigInt(earlier.number) + BigInt(1))
    expect(later.issued_at.getTime()).toBeGreaterThanOrEqual(earlier.issued_at.getTime())
    expect(later.vat_rate).toBe('25.50')
    expect(later.tax_event_at.toISOString()).toBe('2026-09-20T10:00:00.000Z')
  })

  it("rolls a failed insert's number back, so the series stays gapless", async () => {
    const before = await issue(invoicePayload('in_c'))
    await expect(issue(invoicePayload('in_bad', { vat_basis: 'bogus' }))).rejects.toThrow()
    const after = await issue(invoicePayload('in_d'))
    expect(BigInt(after.number)).toBe(BigInt(before.number) + BigInt(1))
  })

  it('refuses a document with no tax point after 20260862, rather than dating it by guesswork', async () => {
    await expect(
      issue(invoicePayload('in_no_tax_point', { tax_event_at: undefined }))
    ).rejects.toThrow(/tax_event_at/)
  })
})

describe('invites', () => {
  it('pending_invite_for_email finds the address through auth.users, case-insensitively, until the invite is accepted', async () => {
    const invitee = '40000000-0000-4000-8000-000000000001'
    await db.exec(
      `insert into auth.users (id, email) values ('${invitee}', 'Invitee@Example.test')`
    )
    await db.query(
      `insert into team_invites (agency_id, role, auth_user_id) values ($1, 'member', $2)`,
      [TRIAL_ENDING, invitee]
    )
    const pending = await db.query('select * from pending_invite_for_email($1)', [
      'invitee@example.test',
    ])
    expect(pending.rows).toHaveLength(1)
    await db.query('update team_invites set accepted_at = now() where auth_user_id = $1', [invitee])
    const accepted = await db.query('select * from pending_invite_for_email($1)', [
      'invitee@example.test',
    ])
    expect(accepted.rows).toEqual([])
  })

  it('an invite goes with its login, so deleting the login is never blocked by one', async () => {
    const invitee = '40000000-0000-4000-8000-000000000002'
    await db.exec(`insert into auth.users (id, email) values ('${invitee}', 'gone@example.test')`)
    await db.query(
      `insert into team_invites (agency_id, role, auth_user_id) values ($1, 'admin', $2)`,
      [TRIAL_ENDING, invitee]
    )
    await db.query('delete from auth.users where id = $1', [invitee])
    const { rows } = await db.query('select 1 from team_invites where auth_user_id = $1', [invitee])
    expect(rows).toEqual([])
  })
})

describe('clients — only the service role deletes', () => {
  it('takes DELETE from the tenant roles and leaves them SELECT and UPDATE, over the grants the platform gives every public table', async () => {
    const granted = await databaseAfter(HISTORY.slice(0, -1))
    await granted.exec('grant all on public.clients to anon, authenticated, service_role')
    await granted.exec(migration('20260864_clients_delete_admin_only.sql'))
    const { rows } = await granted.query<Record<string, boolean>>(
      `select has_table_privilege('authenticated', 'public.clients', 'DELETE') as tenant_delete,
              has_table_privilege('anon', 'public.clients', 'DELETE') as anon_delete,
              has_table_privilege('authenticated', 'public.clients', 'UPDATE') as tenant_update,
              has_table_privilege('authenticated', 'public.clients', 'SELECT') as tenant_select,
              has_table_privilege('service_role', 'public.clients', 'DELETE') as service_delete`
    )
    expect(rows[0]).toEqual({
      tenant_delete: false,
      anon_delete: false,
      tenant_update: true,
      tenant_select: true,
      service_delete: true,
    })
  })
})
