'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { TeamTab } from './team-tab'
import { AccountTab } from './account-tab'
import { ProfileTab } from './profile-tab'
import { IntegrationsTab } from './integrations-tab'
import { toast } from '@/components/ui/toast'
import { HeaderMeta, PageHeader } from '@/components/layout/page-header/page-header'
import { TabRail, type TabItem } from '@/components/layout/page-header/tab-rail'
import { PAGE_SHELL } from '@/components/layout/page-header/shared'
import { cn } from '@/utils/cn'
import type { AgencyInfo, TeamMember, SettingsTab } from '@/types/api'

interface SettingsViewProps {
  agency: AgencyInfo
  members: TeamMember[]
  currentUserRole: string
  currentUserId: string
  agencyMode: 'agency' | 'solo'
}

const TAB_LABELS: ReadonlyArray<{ id: SettingsTab; label: string }> = [
  { id: 'team', label: 'Team' },
  { id: 'account', label: 'Account' },
  { id: 'integrations', label: 'Integrations' },
  { id: 'profile', label: 'Profile' },
]

/** Settings page orchestrator. Owns the header: the tab rail is its state. */
export function SettingsView({
  agency,
  members,
  currentUserRole,
  currentUserId,
  agencyMode,
}: SettingsViewProps) {
  const searchParams = useSearchParams()
  const [activeTab, setActiveTab] = useState<SettingsTab>(
    agencyMode === 'agency' ? 'team' : 'account',
  )

  // Handle Canva OAuth redirect toasts
  useEffect(() => {
    const canvaConnected = searchParams.get('canva_connected')
    const canvaError = searchParams.get('canva_error')
    if (canvaConnected) {
      setActiveTab('integrations')
      toast.success('Canva account connected successfully')
    } else if (canvaError) {
      setActiveTab('integrations')
      toast.error('Failed to connect Canva. Please try again.')
    }
  }, [searchParams])

  // Solo workspaces have no team to manage.
  const tabs: Array<TabItem<SettingsTab>> = TAB_LABELS.filter(
    (tab) => !(tab.id === 'team' && agencyMode === 'solo')
  )

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <PageHeader
        crumb={[{ label: 'Settings' }]}
        title="Settings"
        meta={
          <HeaderMeta
            parts={[
              agency.name,
              agencyMode === 'solo' ? 'Solo workspace' : `${members.length} member${members.length === 1 ? '' : 's'}`,
            ]}
          />
        }
        tabs={<TabRail items={tabs} active={activeTab} onSelect={setActiveTab} label="Settings sections" />}
      />

      <div className={cn(PAGE_SHELL, 'min-h-0 flex-1 overflow-y-auto pb-12 pt-7')}>
        {activeTab === 'team' && (
          <TeamTab
            workspaceName={agency.name}
            members={members}
            currentUserId={currentUserId}
            currentUserRole={currentUserRole}
            agencyMode={agencyMode}
          />
        )}

        {activeTab === 'account' && (
          <AccountTab agency={agency} currentUserRole={currentUserRole} />
        )}

        {activeTab === 'integrations' && (
          <IntegrationsTab currentUserId={currentUserId} />
        )}

        {activeTab === 'profile' && <ProfileTab />}
      </div>
    </div>
  )
}
