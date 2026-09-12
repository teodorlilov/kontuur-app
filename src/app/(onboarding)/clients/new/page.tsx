import { requireSessionUser } from '@/lib/auth/session'
import { getCachedAgency, getCachedAgencyClients } from '@/lib/queries/cache'
import { ClientSetupFlow } from '@/features/onboarding/components/client-setup-flow'

/**
 * /clients/new — the one place a client is created, in both modes.
 *
 * A solo workspace arrives here on its first run, by the redirect in `requireBusinessSetup`
 * (features/onboarding/lib), and gets second-person copy, its business name pre-filled and no
 * way to leave; agency arrives by link. "First run" is solo AND no client yet: a solo workspace
 * that already has its client (a reload after saving, the palette's "Add client") gets the
 * ordinary page with Cancel and Discard instead — this page never redirects, so it can never
 * form a loop with the gate.
 */
export default async function NewClientPage() {
  const { agencyId } = await requireSessionUser()
  const [agency, clients] = await Promise.all([
    getCachedAgency(agencyId),
    getCachedAgencyClients(agencyId),
  ])
  const isSolo = agency?.mode === 'solo' && clients.length === 0

  return <ClientSetupFlow isSolo={isSolo} businessName={isSolo ? (agency?.name ?? '') : ''} />
}
