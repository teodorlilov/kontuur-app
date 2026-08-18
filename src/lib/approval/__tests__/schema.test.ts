import { describe, it, expect } from 'vitest'
import { approvalRequestSchema } from '../schema'

const clientId = '6f9619ff-8b86-4d01-b42d-00cf4fc964ff'
const postId = '7f9619ff-8b86-4d01-b42d-00cf4fc964aa'

describe('approvalRequestSchema — weekStart XOR postIds', () => {
  it('accepts a week batch', () => {
    expect(approvalRequestSchema.safeParse({ clientId, weekStart: '2026-08-03' }).success).toBe(
      true
    )
  })

  it('accepts an explicit post selection', () => {
    expect(approvalRequestSchema.safeParse({ clientId, postIds: [postId] }).success).toBe(true)
  })

  it('rejects neither, both, and an empty selection', () => {
    expect(approvalRequestSchema.safeParse({ clientId }).success).toBe(false)
    expect(
      approvalRequestSchema.safeParse({ clientId, weekStart: '2026-08-03', postIds: [postId] })
        .success
    ).toBe(false)
    expect(approvalRequestSchema.safeParse({ clientId, postIds: [] }).success).toBe(false)
  })

  it('rejects a non-uuid client', () => {
    expect(
      approvalRequestSchema.safeParse({ clientId: 'nope', weekStart: '2026-08-03' }).success
    ).toBe(false)
  })
})
