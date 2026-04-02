'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/utils/cn'

interface SettingsTabsProps {
  agencyMode: 'agency' | 'solo'
}

export function SettingsTabs({ agencyMode }: SettingsTabsProps) {
  const pathname = usePathname()

  const tabs = [
    ...(agencyMode === 'agency'
      ? [{ label: 'Team', href: '/settings/team' }]
      : []),
    { label: 'Account', href: '/settings/account' },
  ]

  return (
    <div className="flex gap-1 border-b border-gray-200">
      {tabs.map((tab) => {
        const active = pathname === tab.href
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              'px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px',
              active
                ? 'border-brand-purple text-brand-purple'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            )}
          >
            {tab.label}
          </Link>
        )
      })}
    </div>
  )
}
