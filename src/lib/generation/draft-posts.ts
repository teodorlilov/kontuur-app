import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { DraftPost } from '@/ai/generation/types'
import { draftColumns, type DraftColumnSource } from '@/lib/generation/draft-columns'
import type { UndecidedPostStatus } from '@/lib/validation'
import { resolveScheme } from '@/lib/visual/post-color'
import type { VisualIdentity } from '@/types/visual'

/**
 * A generated draft as its writers hold it: the facts `draftColumns` reads, plus what only the
 * caller can decide — the row id when the caller already minted one (the wizard stream, so the
 * draft the browser holds IS the row), whether it was asked for, and the colour pair it was born
 * with (the stream picks one per run so a batch spreads across schemes; the cron leaves it to the
 * first visual's claim, `lib/visual/post-color.ts`), and the two things a draft would otherwise
 * forget the moment the browser closed — the run that made it and the idea that asked for it.
 */
interface DraftInsert extends DraftColumnSource {
  id?: string
  priority?: boolean
  visual_ground?: string | null
  visual_accent?: string | null
  generation_run_id?: string | null
  client_idea_id?: string | null
}

/**
 * The one INSERT of generated drafts into `posts` — the cron's batch, the wizard stream's rows as
 * they land, and a published post used again (`duplicatePostAsDraft`).
 *
 * Three files spelled this insert out beside `draftColumns` and had already drifted on `priority`
 * and `scheduled_at`; the columns a draft carries are built in one place, so the row that carries
 * them is written in one place too. Throws on a failed insert — a generated draft is expensive and
 * its caller must know it was lost.
 *
 * Writing a draft records nothing in `post_history`: a topic joins the client's "do not suggest
 * this again" list when a human KEEPS the post (`schedulePosts`, lib/actions/post-actions.ts), not
 * when the model writes one. Until then the run's own themes stop it repeating itself
 * (`fetchThemeDescriptions`, lib/generation/runs.ts) — the same prompt reads both.
 */
export async function insertDraftPosts(
  supabase: SupabaseClient,
  drafts: DraftInsert[],
  status: UndecidedPostStatus
): Promise<Array<{ id: string }>> {
  const rows = drafts.map((draft) => ({
    ...(draft.id ? { id: draft.id } : {}),
    ...draftColumns(draft),
    status,
    priority: draft.priority ?? false,
    visual_ground: draft.visual_ground ?? null,
    visual_accent: draft.visual_accent ?? null,
    generation_run_id: draft.generation_run_id ?? null,
    client_idea_id: draft.client_idea_id ?? null,
  }))
  const { data, error } = await supabase.from('posts').insert(rows).select('id')
  if (error) throw new Error(`Failed to save generated posts: ${error.message}`)
  return data ?? []
}

/**
 * Persist one draft as the wizard stream lands it: pick the colour pair it is born with, then
 * insert it as `'draft'` under the id the orchestrator minted, with what the draft must still
 * know once the browser is gone — its run, and the idea that asked for it.
 *
 * The run is also what places the colour pick: drafts of one run land seconds apart and would
 * otherwise hash onto the same scheme, so the pair is drawn against the run with this draft's
 * ordinal as the step, falling back to the client when no run could be opened (which spreads
 * nothing, but keeps the pick working). Picking without a `postId` is the pre-insert form of
 * `resolveScheme` — the insert is the claim. A run whose kit could not be read (`identity` null)
 * inserts without a pair; the first visual then claims one.
 */
export async function persistStreamedDraft(
  supabase: SupabaseClient,
  input: {
    post: DraftPost
    identity: VisualIdentity | null
    /** The run this draft belongs to, and where in it this one landed. */
    run: { id: string | null; index: number; clientId: string }
    /** The client idea whose brief started the run, when one did. */
    clientIdeaId: string | null
  }
): Promise<void> {
  const scheme = input.identity
    ? await resolveScheme({
        clientId: input.post.client_id,
        identity: input.identity,
        base: input.run.id ?? input.run.clientId,
        offset: input.run.index,
      })
    : null
  await insertDraftPosts(
    supabase,
    [
      {
        ...input.post,
        visual_ground: scheme?.ground ?? null,
        visual_accent: scheme?.accent ?? null,
        generation_run_id: input.run.id,
        client_idea_id: input.clientIdeaId,
      },
    ],
    'draft'
  )
}
