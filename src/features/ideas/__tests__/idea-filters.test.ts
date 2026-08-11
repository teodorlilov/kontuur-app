import { describe, it, expect } from 'vitest'
import {
  AWAITING_DECISION,
  IDEA_TABS,
  applyPendingStatuses,
  countForTab,
  statusesForTab,
} from '../lib/idea-filters'
import type { ClientIdea, IdeaStatus } from '@/types/api'

/**
 * These pin the defect the tab rewrite existed to fix: `'new'` was spelled six
 * times across four files and `'used'` five times with three different meanings,
 * so a tab's label, its count and the list underneath it could each describe a
 * different population.
 */
describe('statusesForTab', () => {
  it('shows exactly the three-value lifecycle — generating is retired', () => {
    // 20260817 migrated stranded 'generating' rows to 'new' and constrained the
    // column, so the inbox is 'new' alone and no fourth value can reappear.
    expect(statusesForTab('inbox')).toEqual(['new'])
  })

  it('never files a dismissed idea under generated', () => {
    // The old "Used" tab counted generated + dismissed together, so setting an idea
    // aside and fulfilling it landed in the same bucket.
    expect(statusesForTab('generated')).toEqual(['generated'])
    expect(statusesForTab('dismissed')).toEqual(['dismissed'])
  })

  it('applies no status filter at all on All', () => {
    // null, not "every status listed above" — a value outside the union still has
    // to appear somewhere rather than vanishing from every tab at once.
    expect(statusesForTab('all')).toBeNull()
  })
})

describe('countForTab', () => {
  const tally = { new: 4, generated: 6, dismissed: 2 }

  it('counts each tab over exactly the statuses it shows', () => {
    expect(countForTab('inbox', tally)).toBe(4)
    expect(countForTab('generated', tally)).toBe(6)
    expect(countForTab('dismissed', tally)).toBe(2)
    expect(countForTab('all', tally)).toBe(12)
  })

  it('counts a status no tab lists under All', () => {
    expect(countForTab('all', { ...tally, archived: 3 })).toBe(15)
    expect(countForTab('inbox', { ...tally, archived: 3 })).toBe(4)
  })

  it('treats an absent status as zero rather than NaN', () => {
    expect(countForTab('inbox', {})).toBe(0)
    expect(countForTab('all', {})).toBe(0)
    expect(countForTab('inbox', { new: 2 })).toBe(2)
  })

  it('never double-counts: the tabs partition the tally', () => {
    const perTab = IDEA_TABS.filter((tab) => tab !== 'all').reduce(
      (sum, tab) => sum + countForTab(tab, tally),
      0
    )
    expect(perTab).toBe(countForTab('all', tally))
  })
})

describe('AWAITING_DECISION', () => {
  it('is the population the inbox tab shows, so the sidebar badge cannot disagree', () => {
    // The badge counted status = 'new' alone; the tab showed something else. Both
    // now read this list.
    expect(AWAITING_DECISION).toEqual(statusesForTab('inbox'))
  })
})

describe('applyPendingStatuses', () => {
  // Only the fields the function touches matter; the cast documents the gap.
  const idea = (id: string, status: IdeaStatus) => ({ id, status }) as ClientIdea
  const list = [idea('a', 'new'), idea('b', 'new'), idea('c', 'generated')]

  it('is the identity with nothing pending', () => {
    expect(applyPendingStatuses(list, new Map(), 'inbox')).toBe(list)
  })

  it('removes a pending-dismissed row from a tab that does not show dismissed', () => {
    // A fresh server payload arrives mid-undo-window still carrying the row; the
    // pending status must win or the dismissal visibly reverts on navigation.
    const pending = new Map<string, IdeaStatus>([['b', 'dismissed']])
    expect(applyPendingStatuses(list, pending, 'inbox').map((i) => i.id)).toEqual(['a', 'c'])
  })

  it('flips a pending-dismissed row in place on All, which shows every status', () => {
    const pending = new Map<string, IdeaStatus>([['b', 'dismissed']])
    const result = applyPendingStatuses(list, pending, 'all')
    expect(result.map((i) => i.id)).toEqual(['a', 'b', 'c'])
    expect(result[1]?.status).toBe('dismissed')
  })
})
