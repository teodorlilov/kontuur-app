'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { PriorityPostForm } from '@/features/generate/components/priority-post-form'
import { CardHeading, PrimaryButton } from './step-client'
import type { PriorityPost } from '@/types/api'

interface StepPriorityProps {
  posts: PriorityPost[]
  onChange: (posts: PriorityPost[]) => void
  onBack: () => void
  onSkip: () => void
  onNext: () => void
}

/** Step 2: optional priority posts. */
export function StepPriority({ posts, onChange, onBack, onSkip, onNext }: StepPriorityProps) {
  return (
    <>
      <CardHeading
        title="Priority posts"
        subtitle="Optional — specific campaigns or announcements that generate first"
      />

      <PriorityPostForm posts={posts} onChange={onChange} />

      {posts.length === 0 && (
        <p style={{ fontSize: '12px', color: 'var(--color-muted)', marginTop: '8px' }}>
          No priority posts — this step is optional.
        </p>
      )}

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: '24px',
        }}
      >
        <BackButton onClick={onBack} />
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            type="button"
            onClick={onSkip}
            style={{
              fontSize: '12px',
              color: 'var(--color-muted)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Skip for now
          </button>
          <PrimaryButton onClick={onNext}>
            Next <ChevronRight size={14} />
          </PrimaryButton>
        </div>
      </div>
    </>
  )
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        fontSize: '12px',
        color: 'var(--color-muted)',
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        fontFamily: 'inherit',
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
      }}
    >
      <ChevronLeft size={14} /> Back
    </button>
  )
}

export { BackButton }
