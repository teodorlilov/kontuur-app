'use client'

import { useState } from 'react'
import { User, Pencil, Calendar, Link2, BarChart2 } from 'lucide-react'
import { formatRelativeTime } from '@/utils/format'
import type { LucideIcon } from 'lucide-react'

export type SettingsTab = 'basic' | 'brand' | 'schedule' | 'accounts' | 'insights'

interface NavItem {
  id: SettingsTab
  label: string
  icon: LucideIcon
}

const NAV_ITEMS: NavItem[] = [
  { id: 'basic', label: 'Basic info', icon: User },
  { id: 'brand', label: 'Brand profile', icon: Pencil },
  { id: 'schedule', label: 'Schedule', icon: Calendar },
  { id: 'accounts', label: 'Connected accounts', icon: Link2 },
  { id: 'insights', label: 'Content insights', icon: BarChart2 },
]

// ── Status Card ──────────────────────────────────────────────

interface StatusCardProps {
  lastGeneratedAt: string | null
  pendingCount: number
  activeSourceCount: number
  publishedCount: number
  sourcesHref: string
}

/** Persistent client status card shown above tab navigation. */
export function StatusCard({
  lastGeneratedAt,
  pendingCount,
  activeSourceCount,
  publishedCount,
  sourcesHref,
}: StatusCardProps) {
  const queueLabel = lastGeneratedAt
    ? `Refreshed ${formatRelativeTime(new Date(lastGeneratedAt))}`
    : 'Not yet refreshed'
  const queueColor = lastGeneratedAt
    ? 'var(--color-published-fg)'
    : 'var(--color-terracotta)'

  return (
    <div
      style={{
        background: 'var(--color-surface)',
        border: '0.5px solid var(--color-border-1)',
        borderRadius: 11,
        padding: 13,
        marginBottom: 14,
      }}
    >
      <div
        style={{
          fontSize: 9,
          fontWeight: 500,
          color: 'var(--color-muted)',
          letterSpacing: 2,
          textTransform: 'uppercase',
          marginBottom: 10,
        }}
      >
        Client status
      </div>

      <StatusRow label="Queue">
        <span style={{ color: queueColor }}>{queueLabel}</span>
      </StatusRow>
      <StatusRow label="Pending">
        <span
          style={{
            color: pendingCount > 0 ? 'var(--color-terracotta)' : 'var(--color-published-fg)',
          }}
        >
          {pendingCount > 0 ? `${pendingCount} posts` : 'All clear'}
        </span>
      </StatusRow>
      <StatusRow label="Sources">
        <a
          href={sourcesHref}
          style={{
            fontSize: 11,
            color: 'var(--color-terracotta)',
            textDecoration: 'none',
          }}
        >
          {activeSourceCount} active →
        </a>
      </StatusRow>
      <StatusRow label="Published" isLast>
        <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-1)' }}>
          {publishedCount} posts
        </span>
      </StatusRow>
    </div>
  )
}

function StatusRow({
  label,
  children,
  isLast = false,
}: {
  label: string
  children: React.ReactNode
  isLast?: boolean
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: isLast ? 0 : 6,
      }}
    >
      <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>{label}</span>
      <span style={{ fontSize: 11 }}>{children}</span>
    </div>
  )
}

// ── Settings Nav ─────────────────────────────────────────────

interface SettingsNavProps {
  activeTab: SettingsTab
  onTabChange: (tab: SettingsTab) => void
}

/** Left sidebar tab navigation for client settings. */
export function SettingsNav({ activeTab, onTabChange }: SettingsNavProps) {
  return (
    <div>
      <div
        style={{
          fontSize: 9,
          fontWeight: 500,
          color: 'var(--color-muted)',
          letterSpacing: 2,
          textTransform: 'uppercase',
          marginBottom: 5,
          padding: '0 8px',
        }}
      >
        Settings
      </div>
      {NAV_ITEMS.map((item) => (
        <NavTab
          key={item.id}
          item={item}
          isActive={activeTab === item.id}
          onClick={() => onTabChange(item.id)}
        />
      ))}
    </div>
  )
}

function NavTab({
  item,
  isActive,
  onClick,
}: {
  item: NavItem
  isActive: boolean
  onClick: () => void
}) {
  const [isHovered, setIsHovered] = useState(false)
  const Icon = item.icon

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        padding: '9px 10px',
        borderRadius: 8,
        cursor: 'pointer',
        position: 'relative',
        background: isActive
          ? 'var(--color-surface)'
          : isHovered
            ? 'var(--color-overlay)'
            : 'transparent',
        border: isActive
          ? '0.5px solid var(--color-border-1)'
          : '0.5px solid transparent',
        marginBottom: 2,
        transition: 'background 0.15s',
      }}
    >
      {isActive && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: '25%',
            bottom: '25%',
            width: 2.5,
            background: 'var(--color-terracotta)',
            borderRadius: '0 2px 2px 0',
          }}
        />
      )}
      <Icon
        size={15}
        style={{
          color: isActive ? 'var(--color-text-1)' : 'var(--color-muted)',
          flexShrink: 0,
        }}
      />
      <span
        style={{
          fontSize: 13,
          fontWeight: isActive ? 500 : 400,
          color: isActive ? 'var(--color-text-1)' : 'var(--color-muted)',
          flex: 1,
        }}
      >
        {item.label}
      </span>
    </div>
  )
}
