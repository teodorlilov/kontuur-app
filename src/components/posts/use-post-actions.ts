'use client'

import { useState } from 'react'
import { toast } from '@/components/ui/toast'
import type { PostData, ValidationData } from '@/types/post'

interface UsePostActionsOptions {
  post: PostData
  onApprove: (postId: string) => void
  onRegenerate?: (postId: string, updatedPost: PostData, updatedValidation: ValidationData) => void
}

export function usePostActions({ post, onApprove, onRegenerate }: UsePostActionsOptions) {
  const [caption, setCaption] = useState(post.caption ?? '')
  const [slidesJson, setSlidesJson] = useState(post.slides_json)
  const [approving, setApproving] = useState(false)
  const [regenerating, setRegenerating] = useState(false)

  function copyCaption() {
    void navigator.clipboard.writeText(caption)
    toast.success('Copied to clipboard')
  }

  async function approve(scheduledAt?: string) {
    setApproving(true)
    try {
      const res = await fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: post.client_id,
          caption,
          platform: post.platform,
          post_type: post.post_type,
          slides_json: slidesJson,
          validation_json: post.validation_json,
          status: scheduledAt ? 'scheduled' : 'approved',
          scheduled_at: scheduledAt ?? null,
          priority: post.priority,
          quality_score_avg: post.quality_score_avg,
          topic_summary: post.topic_summary,
          was_rewritten: post.was_rewritten,
          rewrite_count: post.rewrite_count,
          source_url: post.source_url ?? null,
          source_title: post.source_title ?? null,
          source_type: post.source_type ?? null,
          source_excerpt: post.source_excerpt ?? null,
          pillar: post.pillar ?? null,
        }),
      })
      if (res.ok) {
        toast.success('Post approved')
        onApprove(post.id)
      } else {
        toast.error('Failed to approve post')
      }
    } catch {
      toast.error('Failed to approve post')
    } finally {
      setApproving(false)
    }
  }

  async function regenerate(
    aiTells: string[],
    qualityIssues: string[],
    setLanguageData: (data: ValidationData['language']) => void,
    setSourceGroundingData: (data: ValidationData['sourceGrounding']) => void
  ) {
    setRegenerating(true)
    try {
      const res = await fetch('/api/ai/rewrite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: post.client_id,
          caption,
          postType: post.post_type,
          slidesJson: Array.isArray(slidesJson) ? slidesJson : undefined,
          aiTells,
          qualityIssues,
          sourceExcerpt: post.source_excerpt ?? null,
          sourceUrl: post.source_url ?? null,
        }),
      })
      if (!res.ok) {
        toast.error('Failed to rewrite post')
        return
      }
      const data = (await res.json()) as {
        caption: string
        slides_json: unknown
        quality_score_avg: number
        language: ValidationData['language']
        slop: ValidationData['slop']
        sourceGrounding: ValidationData['sourceGrounding'] | null
        criteria: ValidationData['criteria']
        scores: ValidationData['scores']
      }
      setCaption(data.caption)
      setSlidesJson(data.slides_json)
      setLanguageData(data.language)
      setSourceGroundingData(data.sourceGrounding ?? undefined)
      toast.success('Post rewritten')
      const updatedPost: PostData = {
        ...post,
        caption: data.caption,
        slides_json: data.slides_json,
        quality_score_avg: data.quality_score_avg,
        was_rewritten: true,
        rewrite_count: (post.rewrite_count ?? 0) + 1,
      }
      onRegenerate?.(post.id, updatedPost, {
        language: data.language,
        slop: data.slop,
        sourceGrounding: data.sourceGrounding ?? undefined,
        criteria: data.criteria,
        scores: data.scores,
      })
    } catch {
      toast.error('Failed to rewrite post')
    } finally {
      setRegenerating(false)
    }
  }

  return {
    caption,
    setCaption,
    slidesJson,
    setSlidesJson,
    approving,
    regenerating,
    copyCaption,
    approve,
    regenerate,
  }
}
