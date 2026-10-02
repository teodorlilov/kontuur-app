import { redirect } from 'next/navigation'
import NextTopLoader from 'nextjs-toploader'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { provisionUserRecord } from '@/lib/auth/provision-user-record'
import { getAuthDisplayName, requireAuthUserId } from '@/lib/auth/session'
import {
  getCachedAgency,
  getCachedAgencyClients,
  getCachedClientRoster,
  getCachedEntitlement,
  getCachedNewIdeasCount,
  getCachedPendingRows,
  getCachedUpcomingByClient,
} from '@/lib/queries/cache'
import { getCachedCommentQueue } from '@/features/comments/queries/comment-queue'
import { countNeedingReply } from '@/features/comments/lib/comment-status'
import {
  buildRetiredConnectionCards,
  type RetiredConnectionCard,
} from '@/features/clients/lib/retired-connections'
import { ReconnectPrompt } from '@/features/clients/components/reconnect-prompt'
import { requireBusinessSetup } from '@/features/onboarding/lib/require-business-setup'
import { fetchActiveRuns } from '@/lib/generation/runs'
import { isConnectionRetired } from '@/lib/meta/token-expiry'
import { SIGN_IN_PATH } from '@/utils/constants'
import { formatLongDate } from '@/utils/date-helpers'
import { extractInitials } from '@/utils/format'
import { AuthProvider } from '@/components/providers/auth-provider'
import { ShellProvider } from '@/components/layout/shell-context'
import { ContourField } from '@/components/layout/contour-field'
import { BillingBanner } from '@/components/layout/billing-banner'
import { BillingWall } from '@/components/layout/billing-wall'
import { noEntitlement, type Entitlement } from '@/lib/billing/entitlement'
import { addBrandRefusal, pausedNotice, shellNotice } from '@/lib/billing/copy'
import { Sidebar } from '@/components/layout/sidebar'
import type { ActiveRun } from '@/types/api'

/**
 * The dashboard shell. `ReconnectPrompt` mounts here to announce a dead connection wherever the
 * person lands; a layout re-renders on full load, `router.refresh()` and server actions, never on
 * soft navigation. The first-run gate (`requireBusinessSetup`) lives here because sign-up, the
 * confirmation callback, sign-in and setup-password all end on /dashboard. A missing `users` row
 * is created here (`provisionUserRecord`); with no row there is no role, so Add client is refused.
 * The comments badge counts the queue /comments reads (`getCachedCommentQueue`), so the two agree.
 * The two client reads throw rather than cache a failure (src/lib/queries/cache.ts); the shell
 * logs one and renders without it for this request — no first-run redirect on a roster it could
 * not read, no reconnect prompt — since a throw here would fail every page, Plan & billing
 * included. Only `<main>` scrolls, so `ContourField`'s absolute canvas stays fixed behind the
 * content.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const userId = await requireAuthUserId()

  const supabase = await createServerSupabaseClient()

  const provisioned = await provisionUserRecord(userId)
  if (!provisioned.isSignedIn) redirect(SIGN_IN_PATH)
  const userData = provisioned.record

  let agencyMode: 'agency' | 'solo' = 'agency'
  let pendingCount = 0
  let ideasCount = 0
  let commentsCount = 0
  let agencyName = ''
  let timezone = 'UTC'
  let clients: Array<{ id: string; name: string }> = []
  let activeRuns: ActiveRun[] = []
  let retiredCards: RetiredConnectionCard[] = []
  let entitlement: Entitlement = noEntitlement()

  if (userData) {
    const [
      agencyData,
      agencyClients,
      pendingRows,
      ideas,
      commentQueue,
      runs,
      roster,
      cachedEntitlement,
    ] = await Promise.all([
      getCachedAgency(userData.agency_id),
      getCachedAgencyClients(userData.agency_id).catch((err: unknown) => {
        console.error(`[layout] clients read failed for ${userData.agency_id}:`, err)
        return null
      }),
      getCachedPendingRows(userData.agency_id),
      getCachedNewIdeasCount(userData.agency_id),
      getCachedCommentQueue(userData.agency_id),
      fetchActiveRuns(supabase, userData.agency_id),
      getCachedClientRoster(userData.agency_id).catch((err: unknown) => {
        console.error(`[layout] roster read failed for ${userData.agency_id}:`, err)
        return []
      }),
      getCachedEntitlement(userData.agency_id),
    ])
    entitlement = cachedEntitlement

    if (agencyClients) {
      requireBusinessSetup(agencyData?.mode, agencyClients.length, entitlement.canSpend)
    }

    if (agencyData?.mode === 'solo') agencyMode = 'solo'
    agencyName = agencyData?.name ?? ''
    timezone = agencyData?.timezone ?? 'UTC'
    pendingCount = pendingRows.length
    ideasCount = ideas
    commentsCount = countNeedingReply(commentQueue.groups)
    clients = (agencyClients ?? []).map((client) => ({ id: client.id, name: client.name }))
    activeRuns = runs

    const hasRetired = roster.some((client) =>
      (client.social_connections ?? []).some(isConnectionRetired)
    )
    if (hasRetired) {
      retiredCards = buildRetiredConnectionCards(
        roster,
        await getCachedUpcomingByClient(userData.agency_id),
        timezone
      )
    }
  }

  const displayName = (await getAuthDisplayName()) || 'You'
  const notice = shellNotice(entitlement, new Date())

  return (
    <>
      <NextTopLoader color="var(--forest)" height={2} showSpinner={false} />
      <AuthProvider>
        <ShellProvider
          agencyName={agencyName}
          agencyMode={agencyMode}
          userInitials={extractInitials(displayName)}
          todayLabel={formatLongDate(new Date(), timezone)}
          timezone={timezone}
          clients={clients}
          addClientRefusal={addBrandRefusal(entitlement, clients.length, userData?.role ?? '')}
        >
          <div className="app-shell flex h-screen gap-3.5 overflow-hidden bg-paper p-3">
            <Sidebar
              agencyMode={agencyMode}
              agencyName={agencyName}
              pendingCount={pendingCount}
              ideasCount={ideasCount}
              commentsCount={commentsCount}
              activeRuns={activeRuns}
            />
            <div className="relative flex min-w-0 flex-1 flex-col">
              <ContourField />
              {notice && <BillingBanner tone={notice.tone} text={notice.text} />}
              <main className="app-content relative z-[1] flex-1 overflow-y-auto">
                <BillingWall paused={pausedNotice(entitlement)}>{children}</BillingWall>
              </main>
            </div>
          </div>
          <ReconnectPrompt cards={retiredCards} />
        </ShellProvider>
      </AuthProvider>
    </>
  )
}
