import type { PostData } from '@/types/post'
import type { ValidationData } from '@/types/api'

/** A post under review with its validation evidence — the unit every review leaf renders. */
export type ReviewDraft = { post: PostData } & ValidationData

/** A loaded row and its adapted evidence, as the review queue and the generate flow both hold one. */
export function toReviewDraft(item: { post: PostData; validation: ValidationData }): ReviewDraft {
  return { post: item.post, ...item.validation }
}
