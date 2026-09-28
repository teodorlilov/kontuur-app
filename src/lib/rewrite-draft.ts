import { persistRewrite } from '@/lib/actions/post-actions'
import type { performRewrite } from '@/ai/rewrite/rewrite-post'
import type { PostData } from '@/types/post'
import type { ValidationData } from '@/types/api'
import { readErrorMessage } from '@/utils/read-error-message'

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

/**
 * What POST /api/ai/rewrite answers with: `performRewrite`'s result, which the route returns whole
 * (src/app/api/ai/rewrite/route.ts:96).
 */
type Rewritten = Awaited<ReturnType<typeof performRewrite>>

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
 *
 * WHY as: the body is this app's own route answering with `performRewrite`'s result, so its type
 * is derived from that function rather than restated, and a change there fails the build here.
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
    if (!res.ok) return { ok: false, error: (await readErrorMessage(res)) ?? REWRITE_FAILED }
    rewritten = (await res.json()) as Rewritten
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
