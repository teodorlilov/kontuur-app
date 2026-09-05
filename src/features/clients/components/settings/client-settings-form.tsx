'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { updateClient } from '@/features/clients/actions/client-actions'
import {
  buildDrafts,
  buildUpdatePayload,
  describeLanguage,
  type BrandDraft,
  type ClientDraft,
  type ClientDrafts,
  type DirtyGroups,
  type ScheduleDraft,
} from '@/features/clients/lib/client-draft'
import {
  buildBrandSuggestions,
  type BrandSuggestion,
} from '@/features/clients/lib/brand-suggestion'
import { SETTINGS_TABS, type SettingsTab } from '@/features/clients/lib/settings-tabs'
import { FormPanel, SaveBar } from '@/components/ui/form'
import { toast } from '@/components/ui/toast'
import { HeaderMeta, MetaFlag, PageHeader } from '@/components/layout/page-header/page-header'
import { TabRail, type TabItem } from '@/components/layout/page-header/tab-rail'
import { PAGE_SHELL, TOOL_ROW } from '@/components/layout/page-header/shared'
import { useTabParam } from '@/components/layout/page-header/use-tab-param'
import { extractInitials, formatRelativeTime, parseTimestamp } from '@/utils/format'
import { isEqual } from '@/utils/is-equal'
import { clearQueryParams } from '@/utils/url'
import { StatusPill } from '@/components/ui/status-pill'
import { cn } from '@/utils/cn'
import type { ContentInsights } from '@/features/clients/lib/insights'
import type { ClientIdea, MetaConnection, UrlAnalysisResponse } from '@/types/api'
import type { FacebookPage } from '@/lib/meta/facebook-auth'
import type { ClientRow, BrandProfileRow, PostingScheduleRow } from '@/types'
import type { VisualIdentity } from '@/types/visual'
import { BasicInfoTab } from './basic-info-tab'
import { BrandProfileTab } from './brand-profile-tab'
import { VisualIdentityTab } from './visual-identity-tab'
import { ScheduleTab } from './schedule-tab'
import { ConnectedAccountsTab } from './connected-accounts-tab'
import { ContentInsightsTab } from './content-insights-tab'
import { IdeaFormTab } from '@/features/ideas/components/idea-form-tab'
import { DeleteClientDialog } from './delete-client-dialog'
import { ReanalyzeBrandDialog } from './reanalyze-brand-dialog'
import {
  AccountsRail,
  BrandProfileRail,
  ClientDangerRail,
  ClientStatusRail,
  IdeasRail,
  InsightsRail,
  ScheduleRail,
  VisualIdentityRail,
} from './rails/client-rails'

/** Title and subtitle for each panel, so the copy lives in one place. */
const PANEL_COPY: Record<SettingsTab, { title: string; description: string }> = {
  basic: {
    title: 'Who this client is',
    description: 'Identity and language used on every generated post.',
  },
  brand: {
    title: 'How this client sounds',
    description: 'Tone, audience and content mix the model follows.',
  },
  visual: {
    title: 'How this client looks',
    description: 'The design system AI visuals follow. Colours come from the palette.',
  },
  schedule: {
    title: 'When posts get made',
    description: 'Format and autonomous generation.',
  },
  accounts: {
    title: 'Where posts publish',
    description: 'Link accounts for publishing and analytics.',
  },
  insights: { title: "What's working", description: 'Patterns from approved and published posts.' },
  ideas: {
    title: 'Let the client send ideas',
    description: 'A public link they can use without an account.',
  },
}

/**
 * What the save bar calls each editable group.
 *
 * Keyed by draft group, not by tab, because the two do not line up: formality, secondary
 * language and the health flag are brand-profile columns edited from the Basic info panel.
 */
const GROUP_LABEL: Record<keyof DirtyGroups, string> = {
  client: 'Basic info',
  brand: 'Brand profile',
  schedule: 'Schedule',
  identity: 'Visual identity',
}

interface ClientSettingsFormProps {
  clientId: string
  sourceCount: number
  /** Active content sources with no topic limit — they feed every pillar, including new ones. */
  unrestrictedSourceCount: number
  /** Effective pillar ids of each content source that IS scoped, one entry per source. */
  restrictedSourcePillarIds: string[][]
  /** What the engine has learned from this client's review edits; null until it has. */
  styleMemo: { bullets: Array<{ rule: string; evidence_count: number }>; updatedAt: string } | null
  client: Omit<ClientRow, 'agency_id'>
  profile: Omit<BrandProfileRow, 'client_id'> | null
  schedule: Omit<PostingScheduleRow, 'client_id' | 'created_at'> | null
  insights: ContentInsights | null
  publishedCount: number
  pendingCount: number
  scheduledCount: number
  approvedUnpublishedCount: number
  lastGeneratedAt: string | null
  visualIdentity: VisualIdentity | null
  /** Drives the connection pill and the accounts tab. Resolved server-side so the title never flickers. */
  connections: MetaConnection[]
  /** Non-null only when the Facebook callback sent the user back to pick a Page. */
  facebookPages: FacebookPage[] | null
  ideaToken: string | null
  ideaNewCount: number
  ideaUsedCount: number
  ideaTotalCount: number
  recentIdeas: ClientIdea[]
}

/** Top-level client settings form. Owns the header, because it owns the tab state. */
export function ClientSettingsForm(props: ClientSettingsFormProps) {
  const {
    clientId,
    sourceCount,
    client,
    profile,
    schedule,
    insights,
    publishedCount,
    pendingCount,
    scheduledCount,
    approvedUnpublishedCount,
    lastGeneratedAt,
    connections,
    facebookPages,
    ideaToken,
    ideaNewCount,
    ideaUsedCount,
    ideaTotalCount,
    recentIdeas,
  } = props

  const router = useRouter()
  const searchParams = useSearchParams()
  const [activeTab, selectTab] = useTabParam<SettingsTab>(SETTINGS_TABS, 'basic')
  const [saving, setSaving] = useState(false)
  const [reanalyzing, setReanalyzing] = useState(false)
  const [rereadingBrand, setRereadingBrand] = useState(false)
  const [brandAnalysis, setBrandAnalysis] = useState<UrlAnalysisResponse | null>(null)
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false)

  // The values the form loaded with. Everything dirty is measured against this, and Discard
  // restores it. A ref, not state: changing the baseline must never itself trigger a render.
  const initial = useMemo(
    () => buildDrafts(client, profile, schedule, props.visualIdentity),
    [client, profile, schedule, props.visualIdentity]
  )
  const baseline = useRef<ClientDrafts>(initial)
  const [drafts, setDrafts] = useState<ClientDrafts>(initial)

  // Recomputed only when a group's object identity changes — i.e. on an actual edit, not on
  // every render.
  const dirty: DirtyGroups = useMemo(
    () => ({
      client: !isEqual(drafts.client, baseline.current.client),
      brand: !isEqual(drafts.brand, baseline.current.brand),
      schedule: !isEqual(drafts.schedule, baseline.current.schedule),
      identity: !isEqual(drafts.identity, baseline.current.identity),
    }),
    [drafts]
  )
  const isDirty = dirty.client || dirty.brand || dirty.schedule || dirty.identity

  // Derived from the read, not frozen at the moment it landed: the website read takes the best part
  // of a minute and the form stays editable throughout, so a suggestion list built at fetch time
  // would compare against — and overwrite — values the user has since changed.
  const brandSuggestions = useMemo(
    () =>
      brandAnalysis
        ? buildBrandSuggestions(brandAnalysis, drafts, props.restrictedSourcePillarIds)
        : [],
    [brandAnalysis, drafts, props.restrictedSourcePillarIds]
  )

  const patchClient = useCallback(
    (patch: Partial<ClientDraft>) =>
      setDrafts((d) => ({ ...d, client: { ...d.client, ...patch } })),
    []
  )
  const patchBrand = useCallback(
    (patch: Partial<BrandDraft>) => setDrafts((d) => ({ ...d, brand: { ...d.brand, ...patch } })),
    []
  )
  const patchSchedule = useCallback(
    (patch: Partial<ScheduleDraft>) =>
      setDrafts((d) => ({ ...d, schedule: { ...d.schedule, ...patch } })),
    []
  )
  const setIdentity = useCallback(
    (identity: VisualIdentity) => setDrafts((d) => ({ ...d, identity })),
    []
  )

  // ── OAuth redirect ──
  useEffect(() => {
    const connected = searchParams.get('meta_connected')
    const error = searchParams.get('meta_error')
    if (!connected && !error) return

    if (connected) {
      // The callback only ever redirects with meta_connected=instagram.
      toast.success('Instagram account connected successfully')
    } else {
      // The callback puts the real reason in meta_error_detail — a generic message makes OAuth
      // failures undebuggable.
      const detail = searchParams.get('meta_error_detail')
      toast.error(
        detail
          ? `Failed to connect account: ${detail.slice(0, 300)}`
          : 'Failed to connect account. Please try again.'
      )
    }
    clearQueryParams(['meta_connected', 'meta_error', 'meta_error_detail'])
  }, [searchParams])

  async function handleReanalyze() {
    setReanalyzing(true)
    try {
      const res = await fetch(`/api/clients/${clientId}/visual-identity/reanalyze`, {
        method: 'POST',
      })
      if (!res.ok) throw new Error('reanalyze failed')
      const data = (await res.json()) as { identity: VisualIdentity }
      setIdentity(data.identity)
      toast.success('Visual identity refreshed from website')
    } catch {
      toast.error('Could not re-analyze the website. Please try again.')
    } finally {
      setReanalyzing(false)
    }
  }

  /**
   * Re-reads the website and offers what it found. Nothing is written here or by the route: the
   * accepted rows land in the open drafts, so the save bar reports them and Discard undoes them.
   */
  async function handleRereadBrand() {
    setRereadingBrand(true)
    try {
      const res = await fetch(`/api/clients/${clientId}/brand-profile/reanalyze`, {
        method: 'POST',
      })
      if (!res.ok) throw new Error('brand re-read failed')
      const analysis = (await res.json()) as UrlAnalysisResponse
      if (buildBrandSuggestions(analysis, drafts, props.restrictedSourcePillarIds).length === 0) {
        toast.success('The site still matches this profile — nothing to change.')
        return
      }
      setBrandAnalysis(analysis)
    } catch {
      toast.error('Could not read the website. Please try again.')
    } finally {
      setRereadingBrand(false)
    }
  }

  function applyBrandSuggestions(accepted: BrandSuggestion[]) {
    setDrafts((d) => ({
      ...d,
      client: accepted.reduce((client, s) => ({ ...client, ...s.patch.client }), d.client),
      brand: accepted.reduce((brand, s) => ({ ...brand, ...s.patch.brand }), d.brand),
    }))
    setBrandAnalysis(null)
    toast.success('Loaded into the form — review, then save.')
  }

  function handleDiscard() {
    setDrafts(baseline.current)
  }

  async function handleSave() {
    if (!drafts.client.name.trim()) {
      toast.error('Client name is required')
      return
    }
    setSaving(true)
    const result = await updateClient(
      clientId,
      buildUpdatePayload(drafts, dirty, profile?.weekly_mix_json)
    )
    if (result.ok) {
      // Re-baseline so the bar retracts, and stay on the tab: saving a setting is not a reason
      // to lose your place in the form.
      baseline.current = drafts
      setDrafts({ ...drafts })
      toast.success('Client updated')
      router.refresh()
    } else {
      toast.error(result.error || 'Failed to save changes. Please try again.')
    }
    setSaving(false)
  }

  const connectionCount = connections.length
  const isConnected = connectionCount > 0
  const goToAccounts = useCallback(() => selectTab('accounts'), [selectTab])

  const tabs: Array<TabItem<SettingsTab>> = SETTINGS_TABS.map((tab) =>
    tab.id === 'accounts' ? { ...tab, count: connectionCount, warn: !isConnected } : { ...tab }
  )

  const panel = PANEL_COPY[activeTab]
  const dirtyLabel = describeDirty(dirty)

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        crumb={[{ label: 'Clients', href: '/clients' }, { label: drafts.client.name || 'Client' }]}
        back="/clients"
        badge={extractInitials(drafts.client.name || 'Client')}
        title={
          <>
            <span className="truncate">{drafts.client.name || 'Untitled client'}</span>
            {isConnected ? (
              <StatusPill tone="ok">{connectionCount} connected</StatusPill>
            ) : (
              <StatusPill tone="bad">Not connected</StatusPill>
            )}
          </>
        }
        railTools={
          <>
            <span className="hidden text-caption text-text3 sm:block">
              {lastGeneratedAt
                ? `Queue refreshed ${formatRelativeTime(parseTimestamp(lastGeneratedAt))}`
                : 'Queue not yet refreshed'}
            </span>
            {/* Kept from the deleted status card: the only route to the sources screen. */}
            <a href={`/clients/${clientId}/sources`} className={cn(TOOL_ROW, 'text-caption')}>
              {sourceCount} source{sourceCount === 1 ? '' : 's'} &rarr;
            </a>
          </>
        }
        meta={
          <HeaderMeta
            parts={[
              drafts.client.niche || null,
              describeLanguage(drafts.client.language, drafts.brand.languageFormality),
              pendingCount > 0 && <MetaFlag>{pendingCount} pending review</MetaFlag>,
              publishedCount > 0 && `${publishedCount} published`,
            ]}
          />
        }
        tabs={
          <TabRail items={tabs} active={activeTab} onSelect={selectTab} label="Client settings" />
        }
      />

      <div className={cn(PAGE_SHELL, 'min-h-0 flex-1 overflow-y-auto pb-8 pt-5')}>
        <FormPanel
          title={panel.title}
          description={panel.description}
          rail={renderRail()}
          saveBar={
            // Rendered on every tab, including the read-only ones: edits live in one shared
            // draft, so unsaved brand changes must stay saveable while you are looking at
            // Insights — and the unload guard inside must not unmount with the panel.
            <SaveBar
              dirty={isDirty}
              label={dirtyLabel}
              saving={saving}
              onSave={handleSave}
              onDiscard={handleDiscard}
            />
          }
        >
          {renderPanel()}
        </FormPanel>
      </div>

      <ReanalyzeBrandDialog
        open={brandSuggestions.length > 0}
        onClose={() => setBrandAnalysis(null)}
        suggestions={brandSuggestions}
        onApply={applyBrandSuggestions}
      />

      <DeleteClientDialog
        open={isConfirmingDelete}
        onClose={() => setIsConfirmingDelete(false)}
        clientId={clientId}
        // The stored name, not drafts.client.name: an unsaved rename would leave the reader
        // typing a name the confirm gate cannot match.
        clientName={client.name}
        counts={{
          publishedCount,
          pendingCount,
          scheduledCount,
          sourceCount,
          connectionCount,
          ideaCount: ideaTotalCount,
        }}
      />
    </div>
  )

  function renderPanel() {
    switch (activeTab) {
      case 'basic':
        return (
          <BasicInfoTab
            client={drafts.client}
            brand={drafts.brand}
            onClientChange={patchClient}
            onBrandChange={patchBrand}
          />
        )
      case 'brand':
        return (
          <BrandProfileTab
            brand={drafts.brand}
            onChange={patchBrand}
            savedPillarNames={initial.brand.contentPillars.map((p) => p.pillar)}
            unrestrictedSourceCount={props.unrestrictedSourceCount}
            clientId={props.clientId}
            styleMemo={props.styleMemo}
          />
        )
      case 'visual':
        return (
          <VisualIdentityTab
            identity={drafts.identity}
            onChange={setIdentity}
            language={drafts.client.language}
          />
        )
      case 'schedule':
        return (
          <ScheduleTab
            brand={drafts.brand}
            schedule={drafts.schedule}
            onBrandChange={patchBrand}
            onScheduleChange={patchSchedule}
          />
        )
      case 'accounts':
        return (
          <ConnectedAccountsTab
            clientId={clientId}
            connections={connections}
            facebookPages={facebookPages}
          />
        )
      case 'insights':
        return <ContentInsightsTab insights={insights} />
      case 'ideas':
        return (
          <IdeaFormTab
            clientId={clientId}
            // Live draft, not the server value: a rename should show here before save.
            clientName={drafts.client.name || client.name}
            token={ideaToken}
            totalCount={ideaTotalCount}
            ideas={recentIdeas}
          />
        )
    }
  }

  function renderRail() {
    switch (activeTab) {
      case 'basic':
        return (
          <>
            <ClientStatusRail
              lastGeneratedAt={lastGeneratedAt}
              pendingCount={pendingCount}
              sourceCount={sourceCount}
              publishedCount={publishedCount}
              connectionCount={connectionCount}
              onConnectClick={goToAccounts}
            />
            <ClientDangerRail onDelete={() => setIsConfirmingDelete(true)} />
          </>
        )
      case 'brand':
        return (
          <BrandProfileRail
            pillarCount={drafts.brand.contentPillars.length}
            // The stored URL, not the draft: the route reads what is saved, so enabling this on a
            // freshly typed address would read the old site and label the result with the new one.
            savedWebsite={client.website_url}
            websiteEdited={(client.website_url ?? '') !== drafts.client.websiteUrl}
            onReread={handleRereadBrand}
            rereading={rereadingBrand}
          />
        )
      case 'visual':
        return (
          <VisualIdentityRail
            palette={drafts.identity.palette}
            onReanalyze={handleReanalyze}
            reanalyzing={reanalyzing}
          />
        )
      case 'schedule':
        return (
          <ScheduleRail
            isActive={drafts.schedule.isActive}
            connectionCount={connectionCount}
            onConnectClick={goToAccounts}
          />
        )
      case 'accounts':
        return (
          <AccountsRail
            scheduledCount={scheduledCount}
            approvedUnpublishedCount={approvedUnpublishedCount}
            connectionCount={connectionCount}
          />
        )
      case 'insights':
        return <InsightsRail sourceCount={sourceCount} clientId={clientId} />
      case 'ideas':
        return <IdeasRail newCount={ideaNewCount} usedCount={ideaUsedCount} />
    }
  }
}

/** Names what is unsaved: the single changed section, or how many there are. */
function describeDirty(dirty: DirtyGroups): string {
  const changed = (Object.keys(GROUP_LABEL) as Array<keyof DirtyGroups>).filter((key) => dirty[key])
  if (changed.length === 1) return GROUP_LABEL[changed[0]!]
  return `${changed.length} sections`
}
