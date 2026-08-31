'use server'

import { resolveActionAuth } from '@/lib/auth/helpers'
import { checkRateLimit, AI_RATE_LIMIT } from '@/lib/auth/rate-limit'
import { writeWeeklyBriefing } from '@/features/dashboard/lib/write-briefing'
import type { ActionResult } from '@/lib/actions/types'

/** Generate (or refresh) this week's intelligence briefing. */
export async function generateBriefing(): Promise<ActionResult> {
  const auth = await resolveActionAuth()
  if (!auth.ok) return { ok: false, error: auth.error }
  const { supabase, agencyId, userId } = auth

  const rl = checkRateLimit(`ai:intelligence:${userId}`, AI_RATE_LIMIT)
  if (!rl.allowed) {
    return { ok: false, error: 'Too many requests. Please wait a moment.' }
  }

  // The button regenerates on demand, so `refresh` — the cron only fills a gap. The lookup, the
  // fields, the write and the cache bust all live in one place now.
  const written = await writeWeeklyBriefing(supabase, agencyId, { refresh: true })
  if (!written) return { ok: false, error: 'Could not save the briefing. Please try again.' }

  return { ok: true, data: undefined }
}
