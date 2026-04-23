'use client'

import { useState } from 'react'
import { SettingsTabBar } from './settings-tab-bar'
import { TeamTab } from './team-tab'
import { AccountTab } from './account-tab'
import { ProfileTab } from './profile-tab'
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
  const [activeTab, setActiveTab] = useState<SettingsTab>(
    agencyMode === 'agency' ? 'team' : 'account',
  )

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

        {activeTab === 'profile' && <ProfileTab />}
      </div>
    </div>
  )
}
