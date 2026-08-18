import type { SupabaseClient } from '@supabase/supabase-js'
import { callAnthropic, LIGHT_MODEL } from '@/utils/ai-client'
import { extractToolInput } from '@/utils/ai'
import { sanitizePromptField, PROMPT_FIELD_LIMITS } from '@/ai/utils/sanitize'
import { asJson } from '@/lib/queries/as-json'
import { parseMemoBullets, type StyleMemoBullet } from '@/lib/learning/style-memo'
import type { PostRow } from '@/types'

export const STYLE_MEMO_MAX_BULLETS = 15
const BULLET_EXPIRY_DAYS = 60
const RULE_MAX_CHARS = 200
/** Fewer reviewed posts than this is noise, not a pattern — the cursor stays put. */
const MIN_EDITED_POSTS = 5
const EVIDENCE_POST_LIMIT = 50
const DIFF_SNIPPET_CHARS = 700

interface MemoProposal {
  rule: string
  matches_existing_index: number | null
}

const DISTILL_OUTPUT_SCHEMA = {
  type: 'object' as const,
  properties: {
    bullets: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          rule: { type: 'string' },
          // Index into the CURRENT MEMO list when this observation re-confirms
          // an existing rule; null for a genuinely new pattern.
          matches_existing_index: { type: ['integer', 'null'] },
        },
        required: ['rule', 'matches_existing_index'],
      },
    },
  },
  required: ['bullets'],
}

/**
 * Deterministic merge — the model only proposes. A proposal matching an
 * existing bullet strengthens it (count up, freshness stamped) but never
 * rewrites its text, so rules stay stable for the reviewer reading them in
 * settings. Unconfirmed bullets age out after BULLET_EXPIRY_DAYS; the list is
 * capped by evidence so a noisy week cannot flush established rules.
 */
export function mergeMemo(
  existing: StyleMemoBullet[],
  proposals: MemoProposal[],
  nowIso: string
): StyleMemoBullet[] {
  const merged = existing.map((b) => ({ ...b }))
  for (const proposal of proposals) {
    const idx = proposal.matches_existing_index
    if (idx !== null && idx >= 0 && idx < merged.length) {
      merged[idx]!.evidence_count += 1
      merged[idx]!.last_seen = nowIso
      continue
    }
    const rule = proposal.rule.trim().slice(0, RULE_MAX_CHARS)
    if (!rule) continue
    merged.push({ rule, evidence_count: 1, last_seen: nowIso })
  }

  const cutoff = new Date(nowIso).getTime() - BULLET_EXPIRY_DAYS * 86_400_000
  return merged
    .filter((b) => new Date(b.last_seen).getTime() >= cutoff)
    .sort((a, b) => b.evidence_count - a.evidence_count)
    .slice(0, STYLE_MEMO_MAX_BULLETS)
}

// Derived from the generated row type (row-mirrors rule): a column that changes
// shape fails the build here rather than drifting. The two jsonb columns are
// carried un-narrowed the way every read surface holds them.
type EditedPostRow = Pick<PostRow, 'caption' | 'generated_caption' | 'created_at' | 'edited_at'> & {
  slides_json: unknown
  generated_slides_json: unknown
}

function reviewedAt(row: EditedPostRow): number {
  const created = new Date(row.created_at).getTime()
  const edited = row.edited_at ? new Date(row.edited_at).getTime() : 0
  return Math.max(created, edited)
}

function wasHumanEdited(row: EditedPostRow): boolean {
  if ((row.generated_caption ?? '') !== (row.caption ?? '')) return true
  return (
    JSON.stringify(row.generated_slides_json ?? null) !== JSON.stringify(row.slides_json ?? null)
  )
}

function buildDiffBlock(rows: EditedPostRow[]): string {
  return rows
    .map((row, i) => {
      const before = (row.generated_caption ?? '').slice(0, DIFF_SNIPPET_CHARS)
      const after = (row.caption ?? '').slice(0, DIFF_SNIPPET_CHARS)
      return `EDIT ${i + 1}\nAI WROTE:\n${before}\nREVIEWER CHANGED IT TO:\n${after}`
    })
    .join('\n\n')
}

/**
 * Distill the client's review history since the cursor into the style memo.
 *
 * Evidence: human edit diffs (posts whose caption/slides diverged from the AI
 * baseline — selected in code because PostgREST cannot compare two columns),
 * discard reasons, and the client's own free-text approval notes. The cursor
 * advances ONLY after a successful memo write; too little new evidence returns
 * without touching anything, so unprocessed edits keep accumulating.
 */
export async function distillStyleMemo(
  admin: SupabaseClient,
  clientId: string,
  opts: {
    language: string
    languageNotes: string
    /** Cron passes its cadence here; the manual refresh action passes 0. */
    skipIfFresherThanDays?: number
  }
): Promise<{ updated: boolean; bulletCount: number }> {
  const { data: memoRow } = await admin
    .from('client_style_memos')
    .select('memo, reviewed_through, updated_at')
    .eq('client_id', clientId)
    .maybeSingle()

  const existingForSkip = parseMemoBullets(memoRow?.memo)
  if (
    opts.skipIfFresherThanDays &&
    memoRow?.updated_at &&
    Date.now() - new Date(memoRow.updated_at).getTime() < opts.skipIfFresherThanDays * 86_400_000
  ) {
    return { updated: false, bulletCount: existingForSkip.length }
  }

  const cursor = memoRow?.reviewed_through ?? new Date(0).toISOString()
  const cursorMs = new Date(cursor).getTime()
  const existing = existingForSkip

  const { data: postRows, error: postsError } = await admin
    .from('posts')
    .select('caption, generated_caption, slides_json, generated_slides_json, created_at, edited_at')
    .eq('client_id', clientId)
    .not('generated_caption', 'is', null)
    .order('created_at', { ascending: false })
    .limit(EVIDENCE_POST_LIMIT)
  if (postsError) throw new Error(`style memo: posts read failed: ${postsError.message}`)

  const editedRows = ((postRows ?? []) as EditedPostRow[]).filter(
    (row) => reviewedAt(row) > cursorMs && wasHumanEdited(row)
  )
  if (editedRows.length < MIN_EDITED_POSTS) {
    return { updated: false, bulletCount: existing.length }
  }

  const [{ data: discardRows }, { data: noteRows }] = await Promise.all([
    admin
      .from('discarded_drafts')
      .select('reason')
      .eq('client_id', clientId)
      .not('reason', 'is', null)
      .gt('created_at', cursor)
      .limit(EVIDENCE_POST_LIMIT),
    admin
      .from('post_approval_tokens')
      .select('client_note, responded_at, posts!inner(client_id)')
      .eq('posts.client_id', clientId)
      .not('client_note', 'is', null)
      .gt('responded_at', cursor)
      .limit(20),
  ])

  const discardCounts = new Map<string, number>()
  for (const row of (discardRows ?? []) as Array<{ reason: string | null }>) {
    if (row.reason) discardCounts.set(row.reason, (discardCounts.get(row.reason) ?? 0) + 1)
  }
  const discardBlock = [...discardCounts.entries()]
    .map(([reason, n]) => `- ${reason}: ${n} draft${n === 1 ? '' : 's'} discarded`)
    .join('\n')
  const notesBlock = ((noteRows ?? []) as Array<{ client_note: string | null }>)
    .map((r) => `- ${sanitizePromptField(r.client_note, PROMPT_FIELD_LIMITS.standard)}`)
    .join('\n')

  const currentMemoBlock =
    existing.length > 0 ? existing.map((b, i) => `${i}: ${b.rule}`).join('\n') : '(empty)'

  const message = await callAnthropic({
    systemPrompt: `You distill a reviewer's edits into a short list of reusable writing rules for an AI copywriter. Each rule must describe a recurring, actionable pattern ("Use X instead of Y", "Never open with Z") — one sentence, in English, specific enough that following it would have prevented the edit.

Do NOT restate anything already covered by the client's standing language notes below — the writer already has them:
<language_notes>
${sanitizePromptField(opts.languageNotes, PROMPT_FIELD_LIMITS.long) || '(none)'}
</language_notes>

When an observation re-confirms a CURRENT MEMO rule, return that rule's index in matches_existing_index instead of rewording it. Only propose rules supported by at least two observations. Return an empty list rather than padding.`,
    userMessage: `Client language: ${sanitizePromptField(opts.language, PROMPT_FIELD_LIMITS.short)}

CURRENT MEMO (index: rule):
${currentMemoBlock}

REVIEWER EDITS SINCE LAST DISTILLATION:
${buildDiffBlock(editedRows)}
${discardBlock ? `\nDISCARDED DRAFTS BY REASON:\n${discardBlock}` : ''}${notesBlock ? `\nCLIENT FEEDBACK NOTES:\n${notesBlock}` : ''}`,
    model: LIGHT_MODEL,
    temperature: 0,
    outputSchema: DISTILL_OUTPUT_SCHEMA,
  })

  const { bullets } = extractToolInput<{ bullets: MemoProposal[] }>(message, DISTILL_OUTPUT_SCHEMA)
  const nowIso = new Date().toISOString()
  const merged = mergeMemo(existing, Array.isArray(bullets) ? bullets : [], nowIso)

  const { error: writeError } = await admin.from('client_style_memos').upsert(
    {
      client_id: clientId,
      memo: asJson(merged),
      report: asJson({
        edited_posts: editedRows.length,
        discards: Object.fromEntries(discardCounts),
        client_notes: (noteRows ?? []).length,
        distilled_at: nowIso,
      }),
      reviewed_through: nowIso,
      updated_at: nowIso,
    },
    { onConflict: 'client_id' }
  )
  if (writeError) throw new Error(`style memo: write failed: ${writeError.message}`)

  return { updated: true, bulletCount: merged.length }
}
