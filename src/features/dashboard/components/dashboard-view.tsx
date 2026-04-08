'use client'

import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { StatCard } from '@/components/ui/stat-card'
import { BriefingActions } from './briefing-actions'

function stripCiteTags(text: string): string {
  return text.replace(/<cite[^>]*>([\s\S]*?)<\/cite>/g, '$1')
}

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


function BriefingCard({ briefing }: { briefing: Briefing | null }) {
  return (
    <div
      style={{
        background: 'var(--color-surface)',
        border: '0.5px solid var(--color-border-1)',
        borderRadius: 'var(--radius-lg)',
        padding: '20px 24px',
      }}
    >
      <p
        style={{
          fontSize: 15,
          fontWeight: 500,
          color: 'var(--color-text-1)',
          marginBottom: 12,
        }}
      >
        Weekly Intelligence Briefing
      </p>
      {briefing ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {briefing.platform_updates && briefing.platform_updates.length > 0 && (
            <div>
              <p
                style={{
                  fontSize: 10,
                  fontWeight: 500,
                  textTransform: 'uppercase',
                  letterSpacing: '0.07em',
                  color: 'var(--color-text-3)',
                  marginBottom: 6,
                }}
              >
                What changed this week
              </p>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {briefing.platform_updates.map((update, i) => (
                  <li key={i} style={{ fontSize: 13.5, color: 'var(--color-text-1)' }}>
                    • {stripCiteTags(update)}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {briefing.weekly_tip && (
            <div>
              <p
                style={{
                  fontSize: 10,
                  fontWeight: 500,
                  textTransform: 'uppercase',
                  letterSpacing: '0.07em',
                  color: 'var(--color-text-3)',
                  marginBottom: 6,
                }}
              >
                This week&apos;s tip
              </p>
              <p style={{ fontSize: 13.5, color: 'var(--color-text-1)', margin: 0 }}>{stripCiteTags(briefing.weekly_tip)}</p>
            </div>
          )}
          {briefing.action_nudge && (
            <div
              style={{
                background: 'var(--color-scheduled-bg)',
                borderRadius: 'var(--radius-md)',
                padding: '12px 16px',
              }}
            >
              <p
                style={{
                  fontSize: 10,
                  fontWeight: 500,
                  textTransform: 'uppercase',
                  letterSpacing: '0.07em',
                  color: 'var(--color-scheduled-fg)',
                  marginBottom: 4,
                }}
              >
                Your action for today
              </p>
              <p style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--color-scheduled-fg)', margin: 0 }}>
                {stripCiteTags(briefing.action_nudge)}
              </p>
            </div>
          )}
        </div>
      ) : (
        <p style={{ fontSize: 13.5, color: 'var(--color-text-3)', fontStyle: 'italic' }}>
          Your weekly briefing will appear here once generated. It includes platform algorithm updates, trending
          topics, and a personalized action nudge — generated every Monday.
        </p>
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

      <div
        style={{
          background: 'var(--color-surface)',
          border: '0.5px solid var(--color-border-1)',
          borderRadius: 'var(--radius-lg)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 24px',
            borderBottom: '0.5px solid var(--color-border-1)',
          }}
        >
          <p style={{ fontSize: 15, fontWeight: 500, color: 'var(--color-text-1)', margin: 0 }}>Clients</p>
          <Link
            href="/clients"
            style={{ fontSize: 12, color: 'var(--color-brand-accent)', textDecoration: 'none', fontWeight: 500 }}
          >
            View all
          </Link>
        </div>
        {clients.length === 0 ? (
          <div style={{ padding: '32px 24px', textAlign: 'center' }}>
            <p style={{ fontSize: 13.5, color: 'var(--color-text-3)', margin: '0 0 8px' }}>No clients yet.</p>
            <Link
              href="/clients/new"
              style={{ fontSize: 13.5, color: 'var(--color-brand-accent)', textDecoration: 'none', fontWeight: 500 }}
            >
              Add your first client
            </Link>
          </div>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {clients.map((client) => {
              const pending = clientPendingMap[client.id] ?? 0
              return (
                <li
                  key={client.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 24px',
                    borderBottom: '0.5px solid var(--color-border-1)',
                  }}
                >
                  <div>
                    <p style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--color-text-1)', margin: 0 }}>
                      {client.name}
                    </p>
                    {client.niche && (
                      <p style={{ fontSize: 12, color: 'var(--color-text-3)', margin: '2px 0 0' }}>
                        {client.niche}
                      </p>
                    )}
                  </div>
                  {pending > 0 && <Badge variant="pending" dot>{pending} pending</Badge>}
                </li>
              )
            })}
          </ul>
        )}
        {pendingCount > 0 && (
          <div style={{ padding: '12px 24px', borderTop: '0.5px solid var(--color-border-1)' }}>
            <Link
              href="/review"
              style={{
                display: 'block',
                textAlign: 'center',
                background: 'var(--color-brand)',
                color: 'var(--color-text-inv)',
                fontSize: 13.5,
                fontWeight: 500,
                borderRadius: 'var(--radius-md)',
                padding: '9px 0',
                textDecoration: 'none',
              }}
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
        <div
          style={{
            background: 'var(--color-scheduled-bg)',
            borderRadius: 'var(--radius-lg)',
            padding: '20px 24px',
          }}
        >
          <p
            style={{
              fontSize: 10,
              fontWeight: 500,
              textTransform: 'uppercase',
              letterSpacing: '0.07em',
              color: 'var(--color-scheduled-fg)',
              marginBottom: 8,
            }}
          >
            Your coaching for this week
          </p>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {coachingPoints.map((point, i) => (
              <li key={i} style={{ fontSize: 13.5, color: 'var(--color-scheduled-fg)' }}>
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
          style={{
            display: 'block',
            textAlign: 'center',
            background: 'var(--color-brand)',
            color: 'var(--color-text-inv)',
            fontSize: 13.5,
            fontWeight: 500,
            borderRadius: 'var(--radius-md)',
            padding: '9px 0',
            textDecoration: 'none',
          }}
        >
          Review {pendingCount} ready {pendingCount === 1 ? 'post' : 'posts'}
        </Link>
      )}
    </>
  )
}
