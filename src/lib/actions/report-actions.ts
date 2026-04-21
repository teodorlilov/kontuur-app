'use server'

import { revalidateTag } from 'next/cache'
import { resolveActionAuth } from '@/lib/auth/helpers'
import type { ActionResult } from './types'

/** Delete an analytics report by ID. */
export async function deleteReport(reportId: string): Promise<ActionResult> {
  const auth = await resolveActionAuth()
  if (!auth.ok) return { ok: false, error: auth.error }
  const { supabase, agencyId } = auth

  const { data: reportWithClient } = (await supabase
    .from('analytics_reports')
    .select('id, clients!inner(agency_id)')
    .eq('id', reportId)
    .single()) as { data: (Record<string, unknown> & { clients: { agency_id: string } }) | null }

  if (!reportWithClient || reportWithClient.clients.agency_id !== agencyId) {
    return { ok: false, error: 'Not found' }
  }

  const { error } = await supabase.from('analytics_reports').delete().eq('id', reportId)
  if (error) return { ok: false, error: error.message }

  revalidateTag('agency-clients', 'max')
  return { ok: true, data: undefined }
}
