'use client'

import { PriorityPostForm } from '@/features/generate/components/priority-post-form'
import type { PriorityPost } from '@/types/api'

interface StepPriorityProps {
  posts: PriorityPost[]
  onChange: (posts: PriorityPost[]) => void
}

/** Step 2: optional priority posts (content only, no heading or footer). */
export function StepPriority({ posts, onChange }: StepPriorityProps) {
  return (
    <>
      <PriorityPostForm posts={posts} onChange={onChange} />

      {posts.length === 0 && (
        <p style={{ fontSize: '12px', color: 'var(--color-muted)', marginTop: '8px' }}>
          No priority posts — this step is optional.
        </p>
      )}
    </>
  )
}
