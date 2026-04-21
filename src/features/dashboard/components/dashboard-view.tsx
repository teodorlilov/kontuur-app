'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Sparkles, Users, CheckCircle, BarChart2 } from 'lucide-react'
import { MetricCard } from '@/components/dashboard/metric-card'
import { ClientRow } from '@/components/dashboard/client-row'
import { PostPreviewRow } from '@/components/dashboard/post-preview-row'
import { BriefingItem } from '@/components/dashboard/briefing-item'
import { QuickActionBtn } from '@/components/dashboard/quick-action-btn'
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

interface PendingPost {
  id: string
  caption: string
  platform: string
  pillar: string
  createdAt: string
  clientName: string
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
  pendingPosts: PendingPost[]
}

function SectionCard({
  title,
  action,
  actionHref,
  onActionClick,
  children,
}: {
  title: string
  action?: string
  actionHref?: string
  onActionClick?: () => void
  children: React.ReactNode
}) {
  return (
    <div
      style={{
        background: '#fff',
        border: '0.5px solid rgba(44,62,80,0.10)',
        borderRadius: 12,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 20px',
          borderBottom: '0.5px solid rgba(44,62,80,0.07)',
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 500, color: '#1A2630' }}>{title}</span>
        {action && (
          <Link
            href={actionHref ?? '#'}
            onClick={onActionClick}
            style={{
              fontSize: 11,
              color: 'var(--color-terracotta)',
              fontWeight: 500,
              textDecoration: 'none',
              cursor: 'pointer',
            }}
          >
            {action} →
          </Link>
        )}
      </div>
      <div style={{ padding: '16px 20px' }}>{children}</div>
    </div>
  )
}

function EmptyState({
  message,
  actionLabel,
  actionHref,
}: {
  message: string
  actionLabel?: string
  actionHref?: string
}) {
  return (
    <div style={{ textAlign: 'center', padding: '12px 0' }}>
      <p style={{ fontSize: 13, color: 'var(--color-muted)', margin: '0 0 6px' }}>{message}</p>
      {actionLabel && actionHref && (
        <Link
          href={actionHref}
          style={{
            fontSize: 13,
            color: 'var(--color-terracotta)',
            textDecoration: 'none',
            fontWeight: 500,
          }}
        >
          {actionLabel}
        </Link>
      )}
    </div>
  )
}

type BriefingTag = 'algorithm' | 'trend' | 'action'

/** Parses briefing data into tagged items for the BriefingItem component. */
function buildBriefingItems(briefing: Briefing | null): Array<{ tag: BriefingTag; text: string }> {
  if (!briefing) return []
  const items: Array<{ tag: BriefingTag; text: string }> = []

  if (briefing.platform_updates) {
    for (const update of briefing.platform_updates) {
      items.push({ tag: 'algorithm', text: stripCiteTags(update) })
    }
  }
  if (briefing.weekly_tip) {
    items.push({ tag: 'trend', text: stripCiteTags(briefing.weekly_tip) })
  }
  if (briefing.action_nudge) {
    items.push({ tag: 'action', text: stripCiteTags(briefing.action_nudge) })
  }

  return items
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
  pendingPosts,
}: DashboardViewProps) {
  const router = useRouter()
  const briefingItems = buildBriefingItems(briefing)

  if (isSolo) {
    return (
      <SoloDashboard
        pendingCount={pendingCount}
        scheduledCount={scheduledCount}
        publishedCount={publishedCount}
        briefing={briefing}
        briefingItems={briefingItems}
      />
    )
  }

  return (
    <div style={{ padding: '20px 32px 32px' }}>
      {/* Metric cards — 4 column grid */}
      <div
        className="grid grid-cols-2 lg:grid-cols-4"
        style={{ gap: 12, marginBottom: 24 }}
      >
        <MetricCard
          label="Active clients"
          value={clientCount}
          delta="+1 this month"
          deltaType="positive"
          accentColor="var(--accent-m1)"
        />
        <MetricCard
          label="Pending review"
          value={pendingCount}
          delta={pendingCount > 0 ? 'Needs attention' : 'All clear'}
          deltaType={pendingCount > 0 ? 'negative' : 'positive'}
          accentColor="var(--accent-m2)"
        />
        <MetricCard
          label="Scheduled this week"
          value={scheduledCount}
          delta="On track"
          deltaType="neutral"
          accentColor="var(--accent-m3)"
        />
        <MetricCard
          label="Published this month"
          value={publishedCount}
          delta={`+${publishedCount} vs last month`}
          deltaType="positive"
          accentColor="var(--accent-m4)"
        />
      </div>

      {/* Row 2 — Clients + Pending review */}
      <div
        className="grid grid-cols-1 lg:grid-cols-2"
        style={{ gap: 16, marginBottom: 16 }}
      >
        <SectionCard title="Clients" action="View all" actionHref="/clients">
          {clients.length === 0 ? (
            <EmptyState message="No clients yet" actionLabel="Add your first client" actionHref="/clients/new" />
          ) : (
            clients.slice(0, 4).map((c) => (
              <ClientRow
                key={c.id}
                name={c.name}
                niche={c.niche}
                status="active"
                pendingCount={clientPendingMap[c.id] ?? 0}
                href={`/clients/${c.id}/edit`}
              />
            ))
          )}
        </SectionCard>

        <SectionCard title="Pending review" action="Open queue" actionHref="/review">
          {pendingPosts.length === 0 ? (
            <EmptyState message="No posts pending review" />
          ) : (
            pendingPosts.slice(0, 3).map((p) => (
              <PostPreviewRow
                key={p.id}
                platform={p.platform as 'instagram' | 'facebook' | 'linkedin' | 'tiktok'}
                caption={p.caption}
                clientName={p.clientName}
                pillar={p.pillar}
                createdAt={new Date(p.createdAt)}
                onApprove={() => router.push('/review')}
              />
            ))
          )}
        </SectionCard>
      </div>

      {/* Row 3 — Briefing + Quick actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2" style={{ gap: 16 }}>
        <SectionCard title="Weekly intelligence briefing">
          {briefingItems.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--color-muted)', fontStyle: 'italic' }}>
              Your briefing will appear here — generated every Monday.
            </p>
          ) : (
            briefingItems.map((item, i) => <BriefingItem key={i} tag={item.tag} text={item.text} />)
          )}
          <BriefingActions />
        </SectionCard>

        <SectionCard title="Quick actions">
          <div className="grid grid-cols-2" style={{ gap: 8 }}>
            <QuickActionBtn
              label="Generate posts"
              sublabel="Pick client + platform"
              iconBg="rgba(192,123,85,0.10)"
              iconColor="var(--color-terracotta)"
              icon={<Sparkles size={14} color="var(--color-terracotta)" />}
              onClick={() => router.push('/generate')}
            />
            <QuickActionBtn
              label="Add client"
              sublabel="Start onboarding"
              iconBg="rgba(44,94,138,0.10)"
              iconColor="#2C5F8A"
              icon={<Users size={14} color="#2C5F8A" />}
              onClick={() => router.push('/clients/new')}
            />
            <QuickActionBtn
              label="Review queue"
              sublabel={`${pendingCount} posts waiting`}
              iconBg="rgba(122,154,106,0.10)"
              iconColor="#4A7A3A"
              icon={<CheckCircle size={14} color="#4A7A3A" />}
              onClick={() => router.push('/review')}
            />
            <QuickActionBtn
              label="Analytics"
              sublabel="View performance"
              iconBg="rgba(138,90,42,0.10)"
              iconColor="#8A5A2A"
              icon={<BarChart2 size={14} color="#8A5A2A" />}
              onClick={() => router.push('/analytics')}
            />
          </div>
        </SectionCard>
      </div>
    </div>
  )
}

function SoloDashboard({
  pendingCount,
  scheduledCount,
  publishedCount,
  briefing,
  briefingItems,
}: {
  pendingCount: number
  scheduledCount: number
  publishedCount: number
  briefing: Briefing | null
  briefingItems: Array<{ tag: BriefingTag; text: string }>
}) {
  const coachingPoints = briefing?.coaching_points

  return (
    <div style={{ padding: '20px 32px 32px' }}>
      {coachingPoints && coachingPoints.length > 0 && (
        <div
          style={{
            background: 'var(--color-scheduled-bg)',
            borderRadius: 12,
            padding: '20px 24px',
            marginBottom: 16,
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
              <li key={i} style={{ fontSize: 13.5, color: 'var(--color-scheduled-fg)' }}>• {point}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-3" style={{ gap: 12, marginBottom: 24 }}>
        <MetricCard
          label="Content ready"
          value={pendingCount}
          accentColor="var(--accent-m1)"
        />
        <MetricCard
          label="Scheduled this week"
          value={scheduledCount}
          accentColor="var(--accent-m3)"
        />
        <MetricCard
          label="Total published"
          value={publishedCount}
          accentColor="var(--accent-m4)"
        />
      </div>

      <SectionCard title="Weekly intelligence briefing">
        {briefingItems.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--color-muted)', fontStyle: 'italic' }}>
            Your briefing will appear here — generated every Monday.
          </p>
        ) : (
          briefingItems.map((item, i) => <BriefingItem key={i} tag={item.tag} text={item.text} />)
        )}
        <BriefingActions />
      </SectionCard>

      {pendingCount > 0 && (
        <div style={{ marginTop: 16 }}>
          <Link
            href="/review"
            style={{
              display: 'block',
              textAlign: 'center',
              background: 'var(--color-brand)',
              color: 'var(--color-text-inv)',
              fontSize: 13.5,
              fontWeight: 500,
              borderRadius: 8,
              padding: '9px 0',
              textDecoration: 'none',
            }}
          >
            Review {pendingCount} ready {pendingCount === 1 ? 'post' : 'posts'}
          </Link>
        </div>
      )}
    </div>
  )
}
