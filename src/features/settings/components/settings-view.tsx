'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { SettingsTabBar } from './settings-tab-bar'
import { TeamTab } from './team-tab'
import { AccountTab } from './account-tab'
import { ProfileTab } from './profile-tab'
import { IntegrationsTab } from './integrations-tab'
import { toast } from '@/components/ui/toast'
import type { AgencyInfo, TeamMember, SettingsTab } from '@/types/api'

interface SettingsViewProps {
  agency: AgencyInfo
  members: TeamMember[]
  currentUserRole: string
  currentUserId: string
  agencyMode: 'agency' | 'solo'
}

/** Settings page orchestrator: tab bar + conditional tab content. */
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

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <SettingsTabBar activeTab={activeTab} onSelectTab={setActiveTab} agencyMode={agencyMode} />

      <div className="px-4 md:px-8 pt-7 pb-12" style={{ flex: 1, overflowY: 'auto', background: '#F4EFE6' }}>
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
