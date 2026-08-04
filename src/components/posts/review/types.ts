import type { PostData, ValidationData } from '@/types/post'

/** A post under review with its validation evidence — the unit every review leaf renders. */
export type ReviewDraft = { post: PostData } & ValidationData
