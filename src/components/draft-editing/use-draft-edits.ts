'use client'

import { useState } from 'react'
import type { ReviewDraft } from './types'

/** A reviewer's working copy of a draft — what autosave persists and approve sends. */
export interface DraftEdits {
  caption: string
  slidesJson: unknown
}

/**
 * Per-draft working copies for the review surface. Defaults are derived
 * lazily from the draft itself — nothing is seeded on mount, so an explicit
 * setEdits (e.g. after a rewrite) always wins over the stored copy, and
 * `changesFor` answers null for a draft nobody touched, so an approve does not
 * write the row's own copy back onto it.
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

  function changesFor(postId: string): DraftEdits | null {
    return editsByDraft[postId] ?? null
  }

  function setEdits(postId: string, edits: DraftEdits) {
    setEditsByDraft((prev) => ({ ...prev, [postId]: edits }))
  }

  return { editsFor, changesFor, setEdits }
}
