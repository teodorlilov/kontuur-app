import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { BriefingActions } from './briefing-actions'

interface Briefing {
  briefing_text: string | null
  action_nudge: string | null
  weekly_tip: string | null
  platform_updates: string[] | null
  week_start: string | null
  coaching_points: string[] | null
}

export interface DashboardViewProps {
  isSolo: boolean
  clientCount: number
  pendingCount: number
  scheduledCount: number
  publishedCount: number
  clients: Array<{ id: string; name: string; niche: string | null }>
  clientPendingMap: Record<string, number>
  briefing: Briefing | null
}

export function DashboardView({
  isSolo,
  clientCount,
  pendingCount,
  scheduledCount,
  publishedCount,
  clients,
  clientPendingMap,
  briefing,
}: DashboardViewProps) {
  if (isSolo) {
    return (
      <SoloDashboard
        scheduledCount={scheduledCount}
        publishedCount={publishedCount}
        pendingCount={pendingCount}
        briefing={briefing}
      />
    )
  }

  return (
    <AgencyDashboard
      clientCount={clientCount}
      pendingCount={pendingCount}
      scheduledCount={scheduledCount}
      publishedCount={publishedCount}
      clients={clients}
      clientPendingMap={clientPendingMap}
      briefing={briefing}
    />
  )
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-3xl font-semibold text-gray-900 mt-1">{value}</p>
    </div>
  )
}

function BriefingCard({ briefing }: { briefing: Briefing | null }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <p className="text-sm font-medium text-gray-700 mb-3">Weekly Intelligence Briefing</p>
      {briefing ? (
        <div className="space-y-3">
          {briefing.platform_updates && briefing.platform_updates.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">What changed this week</p>
              <ul className="space-y-1">
                {briefing.platform_updates.map((update, i) => (
                  <li key={i} className="text-sm text-gray-700">
                    • {update}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {briefing.weekly_tip && (
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">This week&apos;s tip</p>
              <p className="text-sm text-gray-700">{briefing.weekly_tip}</p>
            </div>
          )}
          {briefing.action_nudge && (
            <div className="bg-brand-purple-light rounded-lg px-4 py-3">
              <p className="text-xs font-medium text-brand-purple uppercase tracking-wide mb-1">Your action for today</p>
              <p className="text-sm text-brand-purple font-medium">{briefing.action_nudge}</p>
            </div>
          )}
        </div>
      ) : (
        <div className="text-sm text-gray-400 italic">
          Your weekly briefing will appear here once generated. It includes platform algorithm updates, trending
          topics, and a personalized action nudge — generated every Monday.
        </div>
      )}
      <BriefingActions />
    </div>
  )
}

function AgencyDashboard({
  clientCount,
  pendingCount,
  scheduledCount,
  publishedCount,
  clients,
  clientPendingMap,
  briefing,
}: {
  clientCount: number
  pendingCount: number
  scheduledCount: number
  publishedCount: number
  clients: Array<{ id: string; name: string; niche: string | null }>
  clientPendingMap: Record<string, number>
  briefing: Briefing | null
}) {
  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Active clients" value={clientCount} />
        <StatCard label="Posts pending review" value={pendingCount} />
        <StatCard label="Scheduled this week" value={scheduledCount} />
        <StatCard label="Total published" value={publishedCount} />
      </div>

      <BriefingCard briefing={briefing} />

      <div className="bg-white rounded-xl border border-gray-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <p className="text-sm font-medium text-gray-700">Clients</p>
          <Link
            href="/clients"
            className="text-xs text-brand-purple font-medium hover:underline"
          >
            View all
          </Link>
        </div>
        {clients.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <p className="text-sm text-gray-400">No clients yet.</p>
            <Link
              href="/clients/new"
              className="mt-2 inline-block text-sm text-brand-purple font-medium hover:underline"
            >
              Add your first client
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {clients.map((client) => {
              const pending = clientPendingMap[client.id] ?? 0
              return (
                <li key={client.id} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{client.name}</p>
                    {client.niche && <p className="text-xs text-gray-400 mt-0.5">{client.niche}</p>}
                  </div>
                  {pending > 0 && (
                    <Badge variant="warning">{pending} pending</Badge>
                  )}
                </li>
              )
            })}
          </ul>
        )}
        {pendingCount > 0 && (
          <div className="px-5 py-4 border-t border-gray-100">
            <Link
              href="/review"
              className="block w-full text-center bg-brand-purple text-white text-sm font-medium rounded-lg py-2.5 hover:bg-[#4640a0] transition-colors"
            >
              Review {pendingCount} pending {pendingCount === 1 ? 'post' : 'posts'}
            </Link>
          </div>
        )}
      </div>
    </>
  )
}

function SoloDashboard({
  scheduledCount,
  publishedCount,
  pendingCount,
  briefing,
}: {
  scheduledCount: number
  publishedCount: number
  pendingCount: number
  briefing: Briefing | null
}) {
  const coachingPoints = briefing?.coaching_points as string[] | null | undefined

  return (
    <>
      {coachingPoints && coachingPoints.length > 0 && (
        <div className="bg-brand-purple-light rounded-xl p-5 space-y-2">
          <p className="text-xs font-medium text-brand-purple uppercase tracking-wide">
            Your coaching for this week
          </p>
          <ul className="space-y-1.5">
            {coachingPoints.map((point, i) => (
              <li key={i} className="text-sm text-brand-purple">
                • {point}
              </li>
            ))}
          </ul>
        </div>
      )}
      <BriefingCard briefing={briefing} />

      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Content ready" value={pendingCount} />
        <StatCard label="Scheduled this week" value={scheduledCount} />
        <StatCard label="Total published" value={publishedCount} />
      </div>

      {pendingCount > 0 && (
        <Link
          href="/review"
          className="block w-full text-center bg-brand-purple text-white text-sm font-medium rounded-lg py-2.5 hover:bg-[#4640a0] transition-colors"
        >
          Review {pendingCount} ready {pendingCount === 1 ? 'post' : 'posts'}
        </Link>
      )}
    </>
  )
}
