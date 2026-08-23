import type { PostData } from '@/types/post'
import type { ValidationData } from '@/types/api'

/** A post under review with its validation evidence — the unit every review leaf renders. */
export type ReviewDraft = { post: PostData } & ValidationData
