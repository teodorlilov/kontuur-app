'use client'

import { useEffect } from 'react'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'

/**
 * Ends the session of a person who just deleted their workspace — rendered by the goodbye page
 * and nothing else. The sign-out happens here rather than in the delete action because an
 * action that writes a cookie makes the router re-render the page it was called from, racing
 * the dialog's own navigation (features/settings/actions/workspace-actions.ts). The auth user
 * is already deleted by now; the browser client still clears its session — `signOut` treats a
 * 404 from the auth server as "user might not exist anymore" and removes the local session all
 * the same. No `AuthProvider` sits on this tree, so the SIGNED_OUT event navigates nowhere.
 *
 * If this script never runs, the cookies outlive the account until the JWT expires — the same
 * window a removed team member already has — and `/` bounces between the dashboard and the
 * sign-in dialog meanwhile.
 */
export function GoodbyeSignOut() {
  useEffect(() => {
    void createBrowserSupabaseClient().auth.signOut()
  }, [])
  return null
}
