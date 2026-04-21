import Link from 'next/link'
import { requireSessionUser } from '@/lib/auth/session'
import { getCachedAgencyClients, getCachedPendingRows } from '@/lib/queries/cache'
import { Topbar } from '@/components/layout/topbar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

export default async function ClientsPage() {
  const { agencyId } = await requireSessionUser()

  // Both are React cache hits — layout already populated them for this request
  const [clients, pendingRows] = await Promise.all([
    getCachedAgencyClients(agencyId),
    getCachedPendingRows(agencyId),
  ])

  // Pending counts per client
  const clientPendingMap: Record<string, number> = {}
  for (const row of pendingRows) {
    clientPendingMap[row.client_id] = (clientPendingMap[row.client_id] ?? 0) + 1
  }

  return (
    <>
      <Topbar />
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <p className="text-sm text-gray-500">
            {clients.length} {clients.length === 1 ? 'client' : 'clients'}
          </p>
          <Link href="/clients/new" prefetch={false}>
            <Button size="sm">+ Add client</Button>
          </Link>
        </div>

        {clients.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <p className="text-gray-500 font-medium">No clients yet</p>
            <p className="text-sm text-gray-400 mt-1 mb-6">
              Add your first client to start generating content
            </p>
            <Link href="/clients/new" prefetch={false}>
              <Button>Add your first client</Button>
            </Link>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-5 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">
                    Name
                  </th>
                  <th className="text-left px-5 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide hidden md:table-cell">
                    Niche
                  </th>
                  <th className="text-left px-5 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide hidden lg:table-cell">
                    Posts/week
                  </th>
                  <th className="text-left px-5 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide hidden lg:table-cell">
                    Language
                  </th>
                  <th className="text-left px-5 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">
                    Pending
                  </th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {clients.map((client) => {
                  const pending = clientPendingMap[client.id] ?? 0
                  return (
                    <tr key={client.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-4 font-medium text-gray-900">{client.name}</td>
                      <td className="px-5 py-4 text-gray-500 hidden md:table-cell">
                        {client.niche ?? <span className="text-gray-300 italic">—</span>}
                      </td>
                      <td className="px-5 py-4 text-gray-500 hidden lg:table-cell">
                        {client.posts_per_week}
                      </td>
                      <td className="px-5 py-4 text-gray-500 hidden lg:table-cell">
                        {client.language}
                      </td>
                      <td className="px-5 py-4">
                        {pending > 0 ? (
                          <Badge variant="warning">{pending}</Badge>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <Link
                          href={`/clients/${client.id}/edit`}
                          prefetch={false}
                          className="text-xs text-brand-purple font-medium hover:underline"
                        >
                          Edit
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}
