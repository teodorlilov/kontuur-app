import { requireSessionUser } from '@/lib/auth/session'
import { getCachedAgencyClients } from '@/lib/queries/cache'
import { fetchIdeasForAgency } from '@/features/ideas/lib/ideas'
import { IdeasView } from '@/features/ideas/components/ideas-view'

export default async function IdeasPage() {
  const { agencyId } = await requireSessionUser()

  const [ideas, cachedClients] = await Promise.all([
    fetchIdeasForAgency(agencyId),
    getCachedAgencyClients(agencyId),
  ])

  const clients = cachedClients.map((c) => ({ id: c.id, name: c.name }))

  // The view renders the page header itself: the tab rail and the list read the
  // same filter state.
  return <IdeasView initialIdeas={ideas} clients={clients} />
}
