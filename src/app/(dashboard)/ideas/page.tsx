import { requireSessionUser } from '@/lib/auth/session'
import { getCachedAgencyClients } from '@/lib/queries/cache'
import { fetchIdeasForAgency } from '@/lib/ideas'
import { IdeasView } from '@/components/ideas/ideas-view'

export default async function IdeasPage() {
  const { agencyId } = await requireSessionUser()

  const [ideas, cachedClients] = await Promise.all([
    fetchIdeasForAgency(agencyId),
    getCachedAgencyClients(agencyId),
  ])

  const clients = cachedClients.map((c) => ({ id: c.id, name: c.name }))

  return <IdeasView initialIdeas={ideas} clients={clients} />
}
