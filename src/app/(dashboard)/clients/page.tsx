import { requireSessionUser } from '@/lib/auth/session'
import { getCachedClientCards, getCachedClientPostStats, getCachedPendingRows } from '@/lib/queries/cache'
import { parsePillars } from '@/lib/clients/content-pillars'
import { getPillarColor } from '@/components/ui/colors/pillar-colors'
import { Topbar } from '@/components/layout/topbar'
import { ClientsGrid } from '@/features/clients/components/clients-grid'
import type { ClientCardData } from '@/features/clients/types'

function deriveStatus(pillars: { name: string; hex: string }[]): ClientCardData['status'] {
  return pillars.length > 0 ? 'active' : 'setup'
}

function mapPillars(raw: string | null): ClientCardData['pillars'] {
  return parsePillars(raw).map((p) => ({
    name: p.pillar,
    hex: getPillarColor(p.pillar).hex,
  }))
}

export default async function ClientsPage() {
  const { agencyId } = await requireSessionUser()

  const [clients, pendingRows, postStats] = await Promise.all([
    getCachedClientCards(agencyId),
    getCachedPendingRows(agencyId),
    getCachedClientPostStats(agencyId),
  ])

  const pendingMap: Record<string, number> = {}
  for (const row of pendingRows) {
    pendingMap[row.client_id] = (pendingMap[row.client_id] ?? 0) + 1
  }

  const cardData: ClientCardData[] = clients.map((client, index) => {
    const pillars = mapPillars(client.brand_profiles?.content_pillars ?? null)
    const stats = postStats[client.id]
    return {
      id: client.id,
      name: client.name,
      niche: client.niche,
      postsPerWeek: client.posts_per_week,
      status: deriveStatus(pillars),
      publishedCount: stats?.publishedCount ?? 0,
      totalPostCount: stats?.totalCount ?? 0,
      pendingCount: pendingMap[client.id] ?? 0,
      pillars,
      lastGeneratedAt: stats?.lastGeneratedAt ? new Date(stats.lastGeneratedAt) : null,
      colorIndex: index,
    }
  })

  return (
    <>
      <Topbar title="Clients" />
      <div className="px-4 md:px-8 pt-6 pb-10">
        <ClientsGrid clients={cardData} />
      </div>
    </>
  )
}
