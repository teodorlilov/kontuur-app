'use client'

import { ChevronRight } from 'lucide-react'
import { PostTypeSelector } from '@/features/generate/components/post-type-selector'
import { CardHeading, PrimaryButton } from './step-client'
import { BackButton } from './step-priority'
import type { PostType } from '@/types/api'

interface StepTypeProps {
  postType: PostType
  slideCount: number
  platform: string
  onTypeChange: (type: PostType) => void
  onSlideCountChange: (count: number) => void
  onBack: () => void
  onGenerate: () => void
}

/** Step 3: post type selector with generate button. */
export function StepType({
  postType,
  slideCount,
  platform,
  onTypeChange,
  onSlideCountChange,
  onBack,
  onGenerate,
}: StepTypeProps) {
  return (
    <>
      <CardHeading title="Post type" subtitle="Choose the format for this generation run" />

      <PostTypeSelector
        value={postType}
        slideCount={slideCount}
        platform={platform}
        onChange={onTypeChange}
        onSlideCountChange={onSlideCountChange}
      />

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: '24px',
        }}
      >
        <BackButton onClick={onBack} />
        <PrimaryButton onClick={onGenerate} variant="terra">
          Generate <ChevronRight size={14} />
        </PrimaryButton>
      </div>
    </>
  )
}
