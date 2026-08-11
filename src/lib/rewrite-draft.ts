import type { PostData, ValidationData } from '@/types/post'

interface RewriteDraftInput {
  post: PostData
  /** The working caption/slides — edits ride into the rewrite. */
  caption: string
  slidesJson: unknown
  aiTells: string[]
  qualityIssues: string[]
}

export interface RewriteOutcome {
  updatedPost: PostData
  validation: ValidationData
}

/**
 * One rewrite pass over a draft: POST /api/ai/rewrite with the working copy,
 * mapped back into the post + validation shape the flow stores. Returns null
 * on failure — the caller owns toasts and state.
 */
export async function rewriteDraft({
  post,
  caption,
  slidesJson,
  aiTells,
  qualityIssues,
}: RewriteDraftInput): Promise<RewriteOutcome | null> {
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
    if (!res.ok) return null

    const data = (await res.json()) as {
      caption: string
      slides_json: unknown
      quality_score_avg: number | null
      language: ValidationData['language']
      slop: ValidationData['slop']
      sourceGrounding: ValidationData['sourceGrounding'] | null
      criteria: ValidationData['criteria']
      scores: ValidationData['scores']
    }

    return {
      updatedPost: {
        ...post,
        caption: data.caption,
        slides_json: data.slides_json,
        quality_score_avg: data.quality_score_avg,
        was_rewritten: true,
        rewrite_count: (post.rewrite_count ?? 0) + 1,
      },
      validation: {
        language: data.language,
        slop: data.slop,
        sourceGrounding: data.sourceGrounding ?? undefined,
        criteria: data.criteria,
        scores: data.scores,
      },
    }
  } catch {
    return null
  }
}
