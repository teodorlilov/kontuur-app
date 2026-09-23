import { persistRewrite } from '@/lib/actions/post-actions'
import type { PostData } from '@/types/post'
import type { ValidationData } from '@/types/api'

interface RewriteDraftInput {
  post: PostData
  /** The working caption/slides — edits ride into the rewrite. */
  caption: string
  slidesJson: unknown
  aiTells: string[]
  qualityIssues: string[]
}

interface RewriteOutcome {
  updatedPost: PostData
  validation: ValidationData
}

type RewriteResult = ({ ok: true } & RewriteOutcome) | { ok: false; error: string }

/** What POST /api/ai/rewrite answers with. */
interface Rewritten {
  caption: string
  slides_json: unknown
  quality_score_avg: number | null
  language: ValidationData['language']
  slop: ValidationData['slop']
  sourceGrounding: ValidationData['sourceGrounding'] | null
  criteria: ValidationData['criteria']
  scores: ValidationData['scores']
}

const REWRITE_FAILED = 'Failed to rewrite post'
const PERSIST_FAILED = 'Failed to save the rewrite'

/**
 * One rewrite pass over a draft row: POST /api/ai/rewrite with the working copy, then the
 * result kept on the row through `persistRewrite` — every draft under review is a `posts` row,
 * so a rewrite that lived only in the browser would be lost with the tab. The post comes back
 * with the server's own rewrite count. A refusal — the rewrite allowance used up, a paused
 * workspace — comes back with the route's own sentence so the caller can show it; a transport
 * failure gets the generic one; a rewrite that landed but could not be kept says that, not that
 * the rewrite failed — its allowance was spent. The caller owns toasts and state.
 */
export async function rewriteDraft({
  post,
  caption,
  slidesJson,
  aiTells,
  qualityIssues,
}: RewriteDraftInput): Promise<RewriteResult> {
  let rewritten: Rewritten
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
      const body = (await res.json().catch(() => null)) as { error?: string } | null
      return { ok: false, error: body?.error ?? REWRITE_FAILED }
    }

    const data = (await res.json()) as Rewritten
    rewritten = data
  } catch {
    return { ok: false, error: REWRITE_FAILED }
  }

  const validation: ValidationData = {
    language: rewritten.language,
    slop: rewritten.slop,
    sourceGrounding: rewritten.sourceGrounding ?? undefined,
    criteria: rewritten.criteria,
    scores: rewritten.scores,
  }
  const persisted = await persistRewrite(post.id, {
    caption: rewritten.caption,
    slides_json: rewritten.slides_json,
    quality_score_avg: rewritten.quality_score_avg,
    validation,
  }).catch((): { ok: false; error: string } => ({ ok: false, error: PERSIST_FAILED }))
  if (!persisted.ok) return { ok: false, error: PERSIST_FAILED }

  return {
    ok: true,
    updatedPost: {
      ...post,
      caption: rewritten.caption,
      slides_json: rewritten.slides_json,
      quality_score_avg: rewritten.quality_score_avg,
      was_rewritten: true,
      rewrite_count: persisted.data.rewriteCount,
    },
    validation,
  }
}
