'use client'

import { useState, useRef } from 'react'
import { toast } from '@/components/ui/toast'
import { updatePost as updatePostAction, deletePost as deletePostAction } from '@/lib/actions/post-actions'
import type { SlopDetection } from '@/types/api'

interface UseReviewActionsOptions {
  postId: string
  clientId: string
  initialCaption: string
  initialSlidesJson: unknown
  postType: string
  rewriteCount: number
  /** Pre-computed slop data from generation quality scores — skips the detect-slop API call */
  initialSlop?: SlopDetection | null
}

export function useReviewActions({
  postId,
  clientId,
  initialCaption,
  initialSlidesJson,
  postType,
  rewriteCount,
  initialSlop,
}: UseReviewActionsOptions) {
  const [caption, setCaption] = useState(initialCaption)
  const [slidesJson, setSlidesJson] = useState(initialSlidesJson)
  const [slopResult, setSlopDetection] = useState<SlopDetection | null>(initialSlop ?? null)
  const [slopLoading, setSlopLoading] = useState(false)
  const [approving, setApproving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [rewriting, setRewriting] = useState(false)
  const slopRanRef = useRef(false)

  function runSlopDetection(text: string) {
    if (slopRanRef.current) return
    slopRanRef.current = true
    // Skip API call if we already have slop data from generation
    if (slopResult) return
    setSlopLoading(true)

    void fetch('/api/ai/detect-slop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })
      .then(async (res) => {
        if (res.ok) {
          const data = (await res.json()) as SlopDetection
          setSlopDetection(data)
        }
      })
      .catch(() => {
        // slop detection is non-critical
      })
      .finally(() => setSlopLoading(false))
  }

  async function approve(onSuccess: () => void, scheduledAt?: string) {
    setApproving(true)
    try {
      const payload = scheduledAt
        ? { status: 'scheduled', scheduled_at: scheduledAt }
        : { status: 'approved' as const }
      const result = await updatePostAction(postId, payload)
      if (result.ok) {
        toast.success('Post approved')
        onSuccess()
      } else {
        toast.error('Failed to approve post')
      }
    } catch {
      toast.error('Failed to approve post')
    } finally {
      setApproving(false)
    }
  }

  async function handleDelete(onSuccess: () => void) {
    setDeleting(true)
    try {
      const result = await deletePostAction(postId)
      if (result.ok) {
        toast.success('Post deleted')
        onSuccess()
      } else {
        toast.error('Failed to delete post')
      }
    } catch {
      toast.error('Failed to delete post')
    } finally {
      setDeleting(false)
    }
  }

  async function saveCaption(newCaption: string): Promise<boolean> {
    setSaving(true)
    try {
      const result = await updatePostAction(postId, { caption: newCaption })
      if (result.ok) {
        setCaption(newCaption)
        toast.success('Caption updated')
        return true
      }
      toast.error('Failed to save caption')
      return false
    } catch {
      toast.error('Failed to save caption')
      return false
    } finally {
      setSaving(false)
    }
  }

  async function saveSlidesJson(newSlides: unknown): Promise<boolean> {
    setSaving(true)
    try {
      const result = await updatePostAction(postId, { slides_json: newSlides })
      if (result.ok) {
        setSlidesJson(newSlides)
        toast.success('Slides updated')
        return true
      }
      toast.error('Failed to save slides')
      return false
    } catch {
      toast.error('Failed to save slides')
      return false
    } finally {
      setSaving(false)
    }
  }

  async function rewrite() {
    setRewriting(true)
    try {
      const res = await fetch('/api/ai/rewrite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          caption,
          postType,
          slidesJson: Array.isArray(slidesJson) ? slidesJson : undefined,
          aiTells: slopResult?.ai_tells_found ?? [],
          rewriteReason: 'quality' as const,
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
        slop: SlopDetection
        criteria: unknown
        scores: unknown
      }
      setCaption(data.caption)
      setSlidesJson(data.slides_json)
      if (data.slop) setSlopDetection(data.slop)

      // Persist rewrite to DB
      await updatePostAction(postId, {
        caption: data.caption,
        slides_json: data.slides_json,
        quality_score_avg: data.quality_score_avg,
        was_rewritten: true,
        rewrite_count: rewriteCount + 1,
        validation_json: { criteria: data.criteria, scores: data.scores },
      })

      toast.success('Post rewritten')
    } catch {
      toast.error('Failed to rewrite post')
    } finally {
      setRewriting(false)
    }
  }

  return {
    caption,
    slidesJson,
    slopResult,
    slopLoading,
    approving,
    deleting,
    saving,
    rewriting,
    runSlopDetection,
    approve,
    deletePost: handleDelete,
    saveCaption,
    saveSlidesJson,
    rewrite,
  }
}
