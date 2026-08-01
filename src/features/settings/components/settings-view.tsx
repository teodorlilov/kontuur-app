'use client'

import { useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { FormPanel } from '@/components/ui/form'
import { toast } from '@/components/ui/toast'
import { HeaderMeta, PageHeader } from '@/components/layout/page-header/page-header'
import { TabRail, type TabItem } from '@/components/layout/page-header/tab-rail'
import { PAGE_SHELL } from '@/components/layout/page-header/shared'
import { useTabParam } from '@/components/layout/page-header/use-tab-param'
import { cn } from '@/utils/cn'
import { capitalize } from '@/utils/format'
import { clearQueryParams } from '@/utils/url'
import type { ReactNode } from 'react'
import type { AgencyInfo, SettingsTab } from '@/types/api'

const TAB_LABELS: ReadonlyArray<{ id: SettingsTab; label: string }> = [
  { id: 'team', label: 'Team' },
  { id: 'account', label: 'Account' },
  { id: 'integrations', label: 'Integrations' },
  { id: 'profile', label: 'Profile' },
]

/** Title and subtitle for each panel, so the copy lives in one place. */
const PANEL_COPY: Record<SettingsTab, { title: string; description: string }> = {
  team: { title: 'Who has access', description: 'People in this workspace.' },
  account: {
    title: 'Agency workspace',
    description: 'Name, branding and the defaults every client inherits.',
  },
  integrations: {
    title: 'Third-party connections',
    description: 'Each manager links their own account.',
  },
  profile: {
    title: 'Your account',
    description: 'Personal details, separate from the agency workspace.',
  },
}

interface SettingsViewProps {
  agency: AgencyInfo
  /** For the header meta line only — the member list itself lives inside the Team panel. */
  memberCount: number
  agencyMode: 'agency' | 'solo'
  /**
   * Rendered by the server page, one per tab.
   *
   * Elements rather than components: this file is a client component because it owns the tab
   * state, and importing the panels would pull every one of them into the client bundle even
   * though Profile and Plan are static markup.
   */
  panels: Record<SettingsTab, ReactNode>
  rails: Record<SettingsTab, ReactNode>
}

/** Settings page orchestrator. Owns the header: the tab rail is its state. */
export function SettingsView({
  agency,
  memberCount,
  agencyMode,
  panels,
  rails,
}: SettingsViewProps) {
  const searchParams = useSearchParams()

  // Solo workspaces have no team to manage — the same rule hides the tab and rejects it from the URL.
  const isTabAvailable = (tab: SettingsTab) => !(tab === 'team' && agencyMode === 'solo')

  const tabs: Array<TabItem<SettingsTab>> = TAB_LABELS.filter((tab) => isTabAvailable(tab.id))

  const [activeTab, selectTab] = useTabParam<SettingsTab>(
    TAB_LABELS,
    agencyMode === 'agency' ? 'team' : 'account',
    isTabAvailable
  )

  // Canva OAuth redirect lands here.
  useEffect(() => {
    const connected = searchParams.get('canva_connected')
    const error = searchParams.get('canva_error')
    if (!connected && !error) return

    selectTab('integrations')
    if (connected) toast.success('Canva account connected successfully')
    else toast.error('Failed to connect Canva. Please try again.')
    clearQueryParams(['canva_connected', 'canva_error'])
  }, [searchParams, selectTab])

  const panel = PANEL_COPY[activeTab]

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <PageHeader
        crumb={[{ label: 'Settings' }]}
        title="Settings"
        meta={
          <HeaderMeta
            parts={[
              agency.name,
              agencyMode === 'solo'
                ? 'Solo workspace'
                : `${memberCount} member${memberCount === 1 ? '' : 's'}`,
              `${capitalize(agency.plan)} plan`,
            ]}
          />
        }
        tabs={
          <TabRail items={tabs} active={activeTab} onSelect={selectTab} label="Settings sections" />
        }
      />

      <div className={cn(PAGE_SHELL, 'min-h-0 flex-1 overflow-y-auto pb-12 pt-5')}>
        <FormPanel title={panel.title} description={panel.description} rail={rails[activeTab]}>
          {panels[activeTab]}
        </FormPanel>
      </div>
    </div>
  )
}
