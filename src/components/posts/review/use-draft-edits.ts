'use client'

import { useState } from 'react'
import type { ReviewDraft } from './types'

export interface DraftEdits {
  caption: string
  slidesJson: unknown
}

/**
 * Per-draft working copies for the review surface. Defaults are derived
 * lazily from the draft itself — nothing is seeded on mount, so an explicit
 * setEdits (e.g. after a rewrite) always wins over the stored copy.
 */
export function useDraftEdits() {
  const [editsByDraft, setEditsByDraft] = useState<Record<string, DraftEdits>>({})

  function editsFor(item: ReviewDraft): DraftEdits {
    return (
      editsByDraft[item.post.id] ?? {
        caption: item.post.caption ?? '',
        slidesJson: item.post.slides_json,
      }
    )
  }

  function setEdits(postId: string, edits: DraftEdits) {
    setEditsByDraft((prev) => ({ ...prev, [postId]: edits }))
  }

  return { editsFor, setEdits }
}
