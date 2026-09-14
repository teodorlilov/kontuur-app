import { describe, expect, it } from 'vitest'
import { scheduleInputSchema, updateClientSchema } from '../schemas'
import { MAX_POSTS_PER_RUN } from '@/utils/constants'

describe('the schedule and the cadence hold the same line as the wizard', () => {
  it('a schedule cannot ask for more posts per run than one run may produce', () => {
    expect(scheduleInputSchema.safeParse({ frequency_value: MAX_POSTS_PER_RUN + 1 }).success).toBe(
      false
    )
    expect(scheduleInputSchema.safeParse({ frequency_value: MAX_POSTS_PER_RUN }).success).toBe(true)
  })

  it('posts per week is bounded the same way', () => {
    expect(updateClientSchema.safeParse({ posts_per_week: MAX_POSTS_PER_RUN + 1 }).success).toBe(
      false
    )
    expect(updateClientSchema.safeParse({ posts_per_week: 1 }).success).toBe(true)
  })
})
