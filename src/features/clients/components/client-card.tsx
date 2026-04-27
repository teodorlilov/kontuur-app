'use client'

import Link from 'next/link'
import { AlertTriangle, Info, ChevronRight } from 'lucide-react'
import { extractInitials, formatRelativeTime } from '@/utils/format'
import { AVATAR_GRADIENTS, TOP_BAR_GRADIENTS, SETUP_TOP_BAR_GRADIENT } from '@/utils/constants'
import type { ClientCardData } from '@/features/clients/types'

const STATUS_STYLES = {
  active: { bg: 'rgba(122,154,106,0.12)', color: '#5A8A4A', label: 'Active' },
  setup: { bg: 'rgba(192,123,85,0.12)', color: '#A05A35', label: 'Setup' },
} as const

function StatusPill({ status }: { status: ClientCardData['status'] }) {
  const s = STATUS_STYLES[status]
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        fontSize: 10,
        fontWeight: 500,
        padding: '3px 8px',
        borderRadius: 5,
        background: s.bg,
        color: s.color,
      }}
    >
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
      {s.label}
    </span>
  )
}

function StatTile({ value, label }: { value: string | number; label: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '8px 6px', background: 'var(--color-page)', borderRadius: 7 }}>
      <div
        style={{
          fontFamily: 'var(--font-display, Georgia, serif)',
          fontSize: 16,
          fontWeight: 500,
          color: 'var(--color-text-1)',
          lineHeight: 1,
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: 9,
          color: 'var(--color-muted)',
          letterSpacing: '0.5px',
          textTransform: 'uppercase',
          marginTop: 3,
        }}
      >
        {label}
      </div>
    </div>
  )
}

/** Renders an individual client as a card in the clients grid. */
export function ClientCard(props: ClientCardData) {
  const { id, name, niche, postsPerWeek, status, publishedCount, totalPostCount, pendingCount, pillars, lastGeneratedAt, colorIndex } = props

  const topBarGradient = status === 'setup'
    ? SETUP_TOP_BAR_GRADIENT
    : TOP_BAR_GRADIENTS[colorIndex % TOP_BAR_GRADIENTS.length] ?? TOP_BAR_GRADIENTS[0]

  const avatarGradient = AVATAR_GRADIENTS[colorIndex % AVATAR_GRADIENTS.length] ?? AVATAR_GRADIENTS[0]

  return (
    <div
      style={{
        background: 'var(--color-surface)',
        border: status === 'setup'
          ? '0.5px solid rgba(192,123,85,0.30)'
          : '0.5px solid var(--color-border-1)',
        borderRadius: 14,
        overflow: 'hidden',
        position: 'relative',
        transition: 'border-color 0.15s, box-shadow 0.15s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'var(--color-border-2)'
        e.currentTarget.style.boxShadow = '0 2px 12px rgba(44,62,80,0.07)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = status === 'setup'
          ? 'rgba(192,123,85,0.30)'
          : 'var(--color-border-1)'
        e.currentTarget.style.boxShadow = 'none'
      }}
    >
      <div style={{ height: 3, background: topBarGradient }} />

      <CardHeader
        id={id}
        name={name}
        niche={niche}
        status={status}
        pendingCount={pendingCount}
        avatarGradient={avatarGradient}
      />

      <CardBody
        status={status}
        id={id}
        postsPerWeek={postsPerWeek}
        publishedCount={publishedCount}
        totalPostCount={totalPostCount}
        pillars={pillars}
      />

      <CardFooter id={id} status={status} lastGeneratedAt={lastGeneratedAt} />
    </div>
  )
}

function CardHeader({ id, name, niche, status, pendingCount, avatarGradient }: {
  id: string
  name: string
  niche: string | null
  status: ClientCardData['status']
  pendingCount: number
  avatarGradient: string
}) {
  return (
    <Link href={`/clients/${id}/edit`} prefetch={false} style={{ textDecoration: 'none' }}>
      <div style={{ padding: '18px 18px 14px', borderBottom: '0.5px solid var(--color-border-1)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              background: avatarGradient,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 14,
              fontWeight: 500,
              color: '#fff',
              flexShrink: 0,
            }}
          >
            {extractInitials(name)}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--color-text-1)', marginBottom: 3, lineHeight: 1.2 }}>
              {name}
            </div>
            <div style={{ fontSize: 12, color: 'var(--color-muted)' }}>
              {niche ?? '—'}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
            {pendingCount > 0 && (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 500,
                  background: 'rgba(192,123,85,0.15)',
                  color: 'var(--color-terracotta)',
                  padding: '3px 8px',
                  borderRadius: 5,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  whiteSpace: 'nowrap',
                }}
              >
                <AlertTriangle size={9} />
                {pendingCount} pending
              </span>
            )}
            <StatusPill status={status} />
          </div>
        </div>
      </div>
    </Link>
  )
}

function CardBody({ status, id, postsPerWeek, publishedCount, totalPostCount, pillars }: {
  status: ClientCardData['status']
  id: string
  postsPerWeek: number
  publishedCount: number
  totalPostCount: number
  pillars: ClientCardData['pillars']
}) {
  return (
    <div style={{ padding: '14px 18px' }}>
      {status === 'setup' ? (
        <Link href={`/clients/${id}/sources`} prefetch={false} style={{ textDecoration: 'none' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 12px',
              background: 'rgba(192,123,85,0.07)',
              borderRadius: 8,
              marginBottom: 14,
              cursor: 'pointer',
            }}
          >
            <Info size={14} style={{ color: 'var(--color-terracotta)', flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: '#A05A35', fontWeight: 500 }}>Setup incomplete</div>
              <div style={{ fontSize: 10, color: 'var(--color-terracotta)', marginTop: 1 }}>
                Configure sources to start generating
              </div>
            </div>
            <ChevronRight size={12} style={{ color: 'var(--color-terracotta)' }} />
          </div>
        </Link>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 14 }}>
          <StatTile value={postsPerWeek} label="Posts/wk" />
          <StatTile value={publishedCount} label="Published" />
          <StatTile value={totalPostCount} label="Total" />
        </div>
      )}

      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
        {pillars.slice(0, 4).map((p) => (
          <span
            key={p.name}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 10,
              padding: '2px 8px',
              borderRadius: 4,
              background: 'rgba(44,62,80,0.06)',
              color: 'var(--color-text-2)',
            }}
          >
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: p.hex, flexShrink: 0 }} />
            {p.name}
          </span>
        ))}
      </div>
    </div>
  )
}

function CardFooter({ id, status, lastGeneratedAt }: {
  id: string
  status: ClientCardData['status']
  lastGeneratedAt: Date | null
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 18px 14px' }}>
      <span style={{ fontSize: 11, color: status === 'setup' ? 'var(--color-terracotta)' : 'var(--color-muted)' }}>
        {status === 'setup'
          ? 'No posts generated yet'
          : lastGeneratedAt
            ? `Generated ${formatRelativeTime(lastGeneratedAt)}`
            : 'Never generated'}
      </span>

      <div style={{ display: 'flex', gap: 6 }}>
        {status === 'setup' ? (
          <Link
            href={`/clients/${id}/sources`}
            prefetch={false}
            style={{
              fontSize: 11,
              fontWeight: 500,
              padding: '5px 12px',
              borderRadius: 6,
              border: 'none',
              background: 'var(--color-terracotta)',
              color: '#ECE8E1',
              textDecoration: 'none',
            }}
          >
            Complete setup
          </Link>
        ) : (
          <>
            <Link
              href={`/clients/${id}/sources`}
              prefetch={false}
              style={{
                fontSize: 11,
                fontWeight: 500,
                padding: '5px 12px',
                borderRadius: 6,
                border: 'none',
                background: 'rgba(44,62,80,0.07)',
                color: 'var(--color-text-2)',
                textDecoration: 'none',
              }}
            >
              Sources
            </Link>
            <Link
              href={`/generate?client=${id}`}
              prefetch={false}
              style={{
                fontSize: 11,
                fontWeight: 500,
                padding: '5px 12px',
                borderRadius: 6,
                border: 'none',
                background: 'var(--sidebar-bg)',
                color: '#ECE8E1',
                textDecoration: 'none',
              }}
            >
              Generate
            </Link>
          </>
        )}
      </div>
    </div>
  )
}
