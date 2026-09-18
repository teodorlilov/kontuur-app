import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { createAdminSupabaseClient } from '@/lib/supabase/admin'
import type { AgencyBillingColumns } from '@/lib/queries/select-columns'

const mocks = vi.hoisted(() => ({
  notify: vi.fn(),
  sendEmail: vi.fn(),
  fetchAgencyById: vi.fn(),
  fetchTeamMembersByAgency: vi.fn(),
}))
vi.mock('@/lib/notifications/notify', () => ({
  notify: (...args: unknown[]) => mocks.notify(...args),
}))
vi.mock('@/lib/email/resend', () => ({
  sendEmail: (...args: unknown[]) => mocks.sendEmail(...args),
}))
vi.mock('@/lib/queries/db', () => ({
  fetchAgencyById: (...args: unknown[]) => mocks.fetchAgencyById(...args),
  fetchTeamMembersByAgency: (...args: unknown[]) => mocks.fetchTeamMembersByAgency(...args),
}))

import {
  pickReminder,
  remindPaymentFailed,
  remindTrialWorkspaces,
  remindWorkspace,
} from '../reminders'
import { entitlementFor } from '../entitlement'
import { GRACE_DAYS } from '../plans'

const NOW = new Date('2026-09-14T08:00:00Z')
const day = (offset: number) => new Date(NOW.getTime() + offset * 86_400_000).toISOString()

function row(overrides: Partial<AgencyBillingColumns & { id: string }> = {}) {
  return {
    id: 'a1',
    plan: 'trial',
    mode: 'agency',
    timezone: 'Europe/Sofia',
    stripe_customer_id: null,
    stripe_subscription_id: null,
    subscription_status: null,
    subscription_quantity: null,
    trial_ends_at: day(7),
    current_period_start: null,
    current_period_end: null,
    cancel_at_period_end: false,
    past_due_since: null,
    ...overrides,
  }
}

describe('pickReminder — which moment a trial workspace is at', () => {
  it('says nothing for most of a trial, then that it ends, with the date', () => {
    expect(pickReminder(entitlementFor(row(), NOW), NOW)).toBeNull()
    expect(pickReminder(entitlementFor(row({ trial_ends_at: day(2) }), NOW), NOW)).toEqual({
      type: 'trial_ending',
      message: 'Your trial ends on 16 September — choose a plan to keep generating.',
    })
  })

  it('names the grace once the trial has ended', () => {
    const reminder = pickReminder(entitlementFor(row({ trial_ends_at: day(-1) }), NOW), NOW)
    expect(reminder?.type).toBe('trial_ended')
    expect(reminder?.message).toMatch(/ended on 13 September.*until 20 September/)
  })

  it('says a workspace was paused for a week after its grace ran out, then falls silent', () => {
    const justPaused = entitlementFor(row({ trial_ends_at: day(-(GRACE_DAYS + 2)) }), NOW)
    expect(pickReminder(justPaused, NOW)).toEqual({
      type: 'workspace_paused',
      message:
        'Your workspace was paused on 12 September. Choose a plan to generate, schedule and publish again.',
    })
    const longAgo = entitlementFor(row({ trial_ends_at: day(-(GRACE_DAYS + 30)) }), NOW)
    expect(pickReminder(longAgo, NOW)).toBeNull()
  })

  it('never reminds a house workspace or a paying one', () => {
    expect(pickReminder(entitlementFor(row({ plan: 'house' }), NOW), NOW)).toBeNull()
    const paid = entitlementFor(
      row({
        plan: 'pro',
        stripe_customer_id: 'cus_1',
        stripe_subscription_id: 'sub_1',
        subscription_status: 'active',
        current_period_start: '2026-09-01T00:00:00Z',
        trial_ends_at: day(-40),
      }),
      NOW
    )
    expect(pickReminder(paid, NOW)).toBeNull()
  })
})

type Filter = [method: string, column: string, value: unknown]

/**
 * A recorder in place of the admin client: agencies and admins come from the fixtures, and every
 * filter a query applied is kept so the roster rules can be asserted. Cast through `unknown`
 * because only `from/select/is/eq/in` exist — the five the runner calls; a new query method fails
 * at runtime, which is the intent. A read can be made to fail by table.
 */
function makeAdmin(
  agencies: ReturnType<typeof row>[],
  admins: Array<{ agency_id: string; email: string }>,
  failing: string | null = null
) {
  const reads: Array<{ table: string; filters: Filter[] }> = []
  const admin = {
    from(table: string) {
      const record = { table, filters: [] as Filter[] }
      reads.push(record)
      const query = {
        select: () => query,
        is: (column: string, value: unknown) => {
          record.filters.push(['is', column, value])
          return query
        },
        eq: (column: string, value: unknown) => {
          record.filters.push(['eq', column, value])
          return query
        },
        in: (column: string, values: unknown) => {
          record.filters.push(['in', column, values])
          return query
        },
        then(
          resolve: (value: { data: unknown[] | null; error: { message: string } | null }) => void
        ) {
          if (table === failing) {
            resolve({ data: null, error: { message: `${table} is down` } })
            return
          }
          resolve({ data: table === 'agencies' ? agencies : admins, error: null })
        },
      }
      return query
    },
  }
  return { admin: admin as unknown as ReturnType<typeof createAdminSupabaseClient>, reads }
}

describe('remindTrialWorkspaces', () => {
  beforeEach(() => {
    mocks.notify.mockReset().mockResolvedValue('written')
    mocks.sendEmail.mockReset().mockResolvedValue(undefined)
  })

  it('reads the unsubscribed agencies and their admins once, then writes one row and one email per due workspace', async () => {
    const { admin, reads } = makeAdmin(
      [row({ id: 'ending', trial_ends_at: day(2) }), row({ id: 'fine', trial_ends_at: day(10) })],
      [
        { agency_id: 'ending', email: 'owner@ending.test' },
        { agency_id: 'ending', email: 'second@ending.test' },
      ]
    )
    const outcome = await remindTrialWorkspaces(admin, NOW)

    expect(reads.map((r) => r.table)).toEqual(['agencies', 'users'])
    expect(reads[0]?.filters).toEqual([['is', 'stripe_subscription_id', null]])
    expect(reads[1]?.filters).toEqual([
      ['in', 'agency_id', ['ending']],
      ['eq', 'role', 'admin'],
    ])
    expect(outcome.checked).toBe(2)
    expect(outcome.notified).toEqual({
      trial_ending: 1,
      trial_ended: 0,
      workspace_paused: 0,
      payment_failed: 0,
    })
    expect(mocks.notify).toHaveBeenCalledTimes(1)
    expect(mocks.notify).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({ agencyId: 'ending', type: 'trial_ending', cooldownDays: 31 })
    )
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1)
    expect(mocks.sendEmail).toHaveBeenCalledWith({
      to: ['owner@ending.test', 'second@ending.test'],
      content: expect.objectContaining({ subject: 'Your Kontuur trial ends soon' }),
    })
    expect(outcome.emailed).toBe(1)
    expect(outcome.errors).toEqual([])
  })

  it('mails nothing when the bell row already exists — a redelivered tick is silent', async () => {
    mocks.notify.mockResolvedValue('suppressed')
    const { admin } = makeAdmin([row({ trial_ends_at: day(2) })], [])
    const outcome = await remindTrialWorkspaces(admin, NOW)

    expect(outcome.notified.trial_ending).toBe(0)
    expect(mocks.sendEmail).not.toHaveBeenCalled()
    expect(outcome.errors).toEqual([])
  })

  it('writes nothing when the admins cannot be read, so the next tick is a clean retry', async () => {
    const { admin } = makeAdmin([row({ trial_ends_at: day(2) })], [], 'users')

    await expect(remindTrialWorkspaces(admin, NOW)).rejects.toThrow(/admin roster query failed/)
    expect(mocks.notify).not.toHaveBeenCalled()
    expect(mocks.sendEmail).not.toHaveBeenCalled()
  })

  it('reports a row that could not be written, a workspace with no admin and a refused send, and carries on', async () => {
    mocks.notify
      .mockResolvedValueOnce('failed')
      .mockResolvedValueOnce('written')
      .mockResolvedValueOnce('written')
    mocks.sendEmail.mockRejectedValueOnce(new Error('validation_error: domain not verified'))
    const { admin } = makeAdmin(
      [
        row({ id: 'unwritten', trial_ends_at: day(3) }),
        row({ id: 'mailed', trial_ends_at: day(2) }),
        row({ id: 'orphan', trial_ends_at: day(1) }),
      ],
      [{ agency_id: 'mailed', email: 'owner@mailed.test' }]
    )
    const outcome = await remindTrialWorkspaces(admin, NOW)

    expect(outcome.notified.trial_ending).toBe(2)
    expect(outcome.emailed).toBe(0)
    expect(outcome.errors).toEqual([
      { agencyId: 'unwritten', error: 'bell row not written' },
      { agencyId: 'mailed', error: 'validation_error: domain not verified' },
      { agencyId: 'orphan', error: 'no admin to email' },
    ])
  })
})

describe('remindWorkspace — the one sender', () => {
  beforeEach(() => {
    mocks.notify.mockReset().mockResolvedValue('written')
    mocks.sendEmail.mockReset().mockResolvedValue(undefined)
  })

  it('writes the bell first and mails only behind a written row, with the cooldown that dedups a retry', async () => {
    const { admin } = makeAdmin([], [])
    const result = await remindWorkspace(admin, {
      agencyId: 'a1',
      type: 'payment_failed',
      message:
        'Your last payment failed. Update your card by 18 September to keep your workspace running.',
      to: ['owner@a1.test'],
    })
    expect(result).toEqual({ outcome: 'emailed' })
    expect(mocks.notify).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({ type: 'payment_failed', cooldownDays: 31 })
    )
    expect(mocks.sendEmail).toHaveBeenCalledWith({
      to: ['owner@a1.test'],
      content: expect.objectContaining({
        subject: 'Your Kontuur payment failed',
        cta: expect.objectContaining({ label: 'Update your card' }),
      }),
    })
  })

  it('names each way it can come to nothing, without throwing for a refused send', async () => {
    const { admin } = makeAdmin([], [])
    const input = { agencyId: 'a1', type: 'trial_ending' as const, message: 'x', to: ['o@a.test'] }
    mocks.notify.mockResolvedValueOnce('suppressed')
    expect(await remindWorkspace(admin, input)).toEqual({ outcome: 'suppressed' })
    mocks.notify.mockResolvedValueOnce('failed')
    expect(await remindWorkspace(admin, input)).toEqual({ outcome: 'unwritten' })
    expect(await remindWorkspace(admin, { ...input, to: [] })).toEqual({ outcome: 'no_admin' })
    mocks.sendEmail.mockRejectedValueOnce(new Error('domain not verified'))
    expect(await remindWorkspace(admin, input)).toEqual({
      outcome: 'send_failed',
      error: 'domain not verified',
    })
  })
})

describe('remindPaymentFailed — the webhook’s reminder', () => {
  const pastDue = row({
    id: 'a1',
    plan: 'pro',
    stripe_customer_id: 'cus_1',
    stripe_subscription_id: 'sub_1',
    subscription_status: 'past_due',
    subscription_quantity: 2,
    current_period_start: '2026-09-01T00:00:00Z',
    current_period_end: '2026-10-01T00:00:00Z',
    past_due_since: day(-1),
    trial_ends_at: day(-40),
  })

  beforeEach(() => {
    mocks.notify.mockReset().mockResolvedValue('written')
    mocks.sendEmail.mockReset().mockResolvedValue(undefined)
    mocks.fetchAgencyById.mockReset().mockResolvedValue(pastDue)
    mocks.fetchTeamMembersByAgency.mockReset().mockResolvedValue([
      { id: 'u1', email: 'owner@a1.test', role: 'admin', created_at: null },
      { id: 'u2', email: 'member@a1.test', role: 'member', created_at: null },
    ])
  })

  it('tells the admins by when the card is due, in the workspace’s own words', async () => {
    const { admin } = makeAdmin([], [])
    expect(await remindPaymentFailed(admin, 'a1', NOW)).toEqual({ outcome: 'emailed' })
    expect(mocks.notify).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({
        agencyId: 'a1',
        type: 'payment_failed',
        message:
          'Your last payment failed. Update your card by 20 September to keep your workspace running.',
      })
    )
    expect(mocks.sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: ['owner@a1.test'] }))
  })

  it('says nothing once the row no longer reads past_due — the customer paid, or the grace ran out', async () => {
    const { admin } = makeAdmin([], [])
    mocks.fetchAgencyById.mockResolvedValue({
      ...pastDue,
      subscription_status: 'active',
      past_due_since: null,
    })
    expect(await remindPaymentFailed(admin, 'a1', NOW)).toBeNull()
    mocks.fetchAgencyById.mockResolvedValue({ ...pastDue, past_due_since: day(-9) })
    expect(await remindPaymentFailed(admin, 'a1', NOW)).toBeNull()
    expect(mocks.notify).not.toHaveBeenCalled()
  })
})
