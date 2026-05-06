'use client'

import { Badge } from '@/components/ui/badge'
import type { SettingsTab } from '@/types/api'

interface SettingsTabBarProps {
  activeTab: SettingsTab
  onSelectTab: (tab: SettingsTab) => void
  agencyMode: 'agency' | 'solo'
}

const TAB_ITEMS: Array<{ key: SettingsTab; label: string; soloOnly?: boolean }> = [
  { key: 'team', label: 'Team' },
  { key: 'account', label: 'Account' },
  { key: 'integrations', label: 'Integrations' },
  { key: 'profile', label: 'Profile' },
]

/** Horizontal tab bar matching the analytics/calendar tab pattern. */
export function SettingsTabBar({ activeTab, onSelectTab, agencyMode }: SettingsTabBarProps) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 4,
        padding: '0 22px',
        background: '#fff',
        borderBottom: '0.5px solid var(--color-border-1)',
      }}
    >
      {TAB_ITEMS.map((tab) => {
        if (tab.key === 'team' && agencyMode === 'solo') return null
        const isActive = activeTab === tab.key

        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onSelectTab(tab.key)}
            style={{
              padding: '12px 16px',
              marginBottom: -0.5,
              background: 'none',
              border: 'none',
              borderBottomStyle: 'solid',
              borderBottomWidth: 2,
              borderBottomColor: isActive ? 'var(--color-terracotta)' : 'transparent',
              color: isActive ? 'var(--color-text-1)' : 'var(--color-muted)',
              fontSize: 12,
              fontWeight: 500,
              fontFamily: 'inherit',
              cursor: 'pointer',
              transition: 'color 0.15s, border-color 0.15s',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            {tab.label}
            {tab.key === 'profile' && <Badge variant="default">Soon</Badge>}
          </button>
        )
      })}
    </div>
  )
}
