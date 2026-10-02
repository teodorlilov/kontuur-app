import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { createAdminSupabaseClient } from '@/lib/supabase/admin'
import type { AgencyBillingColumns } from '@/lib/queries/select-columns'

const mocks = vi.hoisted(() => ({
  notify: vi.fn(),
  sendEmail: vi.fn(),
  fetchAgencyById: vi.fn(),
}))
vi.mock('@/lib/notifications/notify', () => ({
  notify: (...args: unknown[]) => mocks.notify(...args),
}))
vi.mock('@/lib/email/resend', () => ({
  sendEmail: (...args: unknown[]) => mocks.sendEmail(...args),
}))
vi.mock('@/lib/queries/db', () => ({
  fetchAgencyById: (...args: unknown[]) => mocks.fetchAgencyById(...args),
}))

import {
  pickReminder,
  remindPaymentFailed,
  remindTrialWorkspaces,
  remindWorkspace,
} from '../reminders'
import { entitlementFor } from '../entitlement'
import { GRACE_DAYS, TRIAL_NOTICE_DAYS } from '../plans'
import { paidRow, trialRow } from './fixtures'

const NOW = new Date('2026-09-14T08:00:00Z')
const day = (offset: number) => new Date(NOW.getTime() + offset * 86_400_000).toISOString()

function row(overrides: Partial<AgencyBillingColumns & { id: string }> = {}) {
  return { id: 'a1', ...trialRow(NOW), ...overrides }
}

describe('pickReminder — which moment a trial workspace is at', () => {
  it('says nothing for most of a trial, then that it ends, with the date', () => {
    expect(pickReminder(entitlementFor(row(), NOW), NOW)).toBeNull()
    expect(pickReminder(entitlementFor(row({ trial_ends_at: day(2) }), NOW), NOW)).toEqual({
      type: 'trial_ending',
      message: 'Your trial ends on 16 September 2026 — choose a plan to keep generating.',
      dedupKey: 'trial_ending:2026-09-16',
    })
  })

  it('names the grace once the trial has ended', () => {
    const reminder = pickReminder(entitlementFor(row({ trial_ends_at: day(-1) }), NOW), NOW)
    expect(reminder?.type).toBe('trial_ended')
    expect(reminder?.message).toMatch(/ended on 13 September 2026.*until 20 September/)
    expect(reminder?.dedupKey).toBe('trial_ended:2026-09-13')
  })

  it('says a workspace was paused for a week after its grace ran out, then falls silent', () => {
    const justPaused = entitlementFor(row({ trial_ends_at: day(-(GRACE_DAYS + 2)) }), NOW)
    expect(pickReminder(justPaused, NOW)).toEqual({
      type: 'workspace_paused',
      message:
        'Your workspace was paused on 12 September 2026. Choose a plan to generate, schedule and publish again.',
      dedupKey: 'workspace_paused:2026-09-05',
    })
    const longAgo = entitlementFor(row({ trial_ends_at: day(-(GRACE_DAYS + 30)) }), NOW)
    expect(pickReminder(longAgo, NOW)).toBeNull()
  })

  it('never reminds a house workspace or a paying one', () => {
    expect(pickReminder(entitlementFor(row({ plan: 'house' }), NOW), NOW)).toBeNull()
    const paid = entitlementFor(paidRow(NOW), NOW)
    expect(pickReminder(paid, NOW)).toBeNull()
  })
})

type Filter = [method: string, column: string, value: unknown]

/**
 * A recorder in place of the admin client: agencies and admins come from the fixtures, and every
 * filter a query applied is kept so the roster rules can be asserted. Cast through `unknown`
 * because only the query methods the runner calls exist; a new one fails at runtime, which is the
 * intent. A read can be made to fail by table.
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
        gte: (column: string, value: unknown) => {
          record.filters.push(['gte', column, value])
          return query
        },
        lte: (column: string, value: unknown) => {
          record.filters.push(['lte', column, value])
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

  it('reads the unsubscribed agencies in their window and their admins once, then writes one row and one email per due workspace', async () => {
    const { admin, reads } = makeAdmin(
      [row({ id: 'ending', trial_ends_at: day(2) }), row({ id: 'fine', trial_ends_at: day(10) })],
      [
        { agency_id: 'ending', email: 'owner@ending.test' },
        { agency_id: 'ending', email: 'second@ending.test' },
      ]
    )
    const outcome = await remindTrialWorkspaces(admin, NOW)

    expect(reads.map((r) => r.table)).toEqual(['agencies', 'users'])
    expect(reads[0]?.filters).toEqual([
      ['is', 'stripe_subscription_id', null],
      ['gte', 'trial_ends_at', day(-(GRACE_DAYS + 7))],
      ['lte', 'trial_ends_at', day(TRIAL_NOTICE_DAYS)],
    ])
    expect(reads[1]?.filters).toEqual([
      ['in', 'agency_id', ['ending']],
      ['eq', 'role', 'admin'],
    ])
    expect(outcome.checked).toBe(2)
    expect(outcome.notified).toEqual({
      trial_ending: 1,
      trial_ended: 0,
      workspace_paused: 0,
    })
    expect(mocks.notify).toHaveBeenCalledTimes(1)
    expect(mocks.notify).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({
        agencyId: 'ending',
        type: 'trial_ending',
        dedupKey: `trial_ending:${day(2).slice(0, 10)}`,
      })
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

  it('writes the bell first and mails only behind a written row, keyed so a retry is silent', async () => {
    const { admin } = makeAdmin([], [])
    const result = await remindWorkspace(admin, {
      agencyId: 'a1',
      type: 'payment_failed',
      message:
        'Your last payment failed. Update your card by 18 September 2026 to keep your workspace running.',
      dedupKey: 'payment_failed:2026-09-11',
      to: ['owner@a1.test'],
    })
    expect(result).toEqual({ outcome: 'emailed' })
    expect(mocks.notify).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({ type: 'payment_failed', dedupKey: 'payment_failed:2026-09-11' })
    )
    expect(mocks.notify.mock.calls[0]?.[1]).not.toHaveProperty('cooldownDays')
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
    const input = {
      agencyId: 'a1',
      type: 'trial_ending' as const,
      message: 'x',
      dedupKey: 'trial_ending:2026-09-16',
      to: ['o@a.test'],
    }
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
  const pastDue = {
    id: 'a1',
    ...paidRow(NOW, {
      subscription_status: 'past_due',
      subscription_quantity: 2,
      client_slots: 2,
      past_due_since: day(-1),
    }),
  }

  beforeEach(() => {
    mocks.notify.mockReset().mockResolvedValue('written')
    mocks.sendEmail.mockReset().mockResolvedValue(undefined)
    mocks.fetchAgencyById.mockReset().mockResolvedValue(pastDue)
  })

  it('tells the admins by when the card is due, in the workspace’s own words, keyed by the first failure so an episode rings once', async () => {
    const { admin, reads } = makeAdmin([], [{ agency_id: 'a1', email: 'owner@a1.test' }])
    expect(await remindPaymentFailed(admin, 'a1', NOW)).toEqual({ outcome: 'emailed' })
    expect(mocks.notify).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({
        agencyId: 'a1',
        type: 'payment_failed',
        message:
          'Your last payment failed. Update your card by 20 September 2026 to keep your workspace running.',
        dedupKey: 'payment_failed:2026-09-13',
      })
    )
    expect(reads.map((r) => r.table)).toEqual(['users'])
    expect(reads[0]?.filters).toEqual([
      ['in', 'agency_id', ['a1']],
      ['eq', 'role', 'admin'],
    ])
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
