'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { parsePillars, serializePillars, type WeightedPillar } from '@/lib/clients/content-pillars'
import { updateClient } from '@/features/clients/actions/client-actions'
import { SETTINGS_TABS, type SettingsTab } from '@/features/clients/lib/settings-tabs'
import { buildDefaultIdentity } from '@/lib/visual/identity'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import {
  HeaderMeta,
  HeaderPill,
  MetaFlag,
  PageHeader,
} from '@/components/layout/page-header/page-header'
import { TabRail, type TabItem } from '@/components/layout/page-header/tab-rail'
import { PAGE_SHELL, TOOL_ROW } from '@/components/layout/page-header/shared'
import { extractInitials, formatRelativeTime } from '@/utils/format'
import { cn } from '@/utils/cn'
import type { ClientRow, BrandProfileRow, PostingScheduleRow } from '@/types'
import type { VisualIdentity } from '@/types/visual'
import { BasicInfoTab } from './basic-info-tab'
import { BrandProfileTab } from './brand-profile-tab'
import { VisualIdentityTab } from './visual-identity-tab'
import { ScheduleTab } from './schedule-tab'
import { ConnectedAccountsTab, bustConnectionsCache } from './connected-accounts-tab'
import { ContentInsightsTab, type ContentInsights } from './content-insights-tab'
import { IdeaFormTab } from '@/features/ideas/components/idea-form-tab'

interface ClientSettingsFormProps {
  clientId: string
  sourceCount: number
  client: Omit<ClientRow, 'agency_id'>
  profile: Omit<BrandProfileRow, 'client_id'> | null
  schedule: Omit<PostingScheduleRow, 'client_id' | 'created_at'> | null
  insights: ContentInsights | null
  publishedCount: number
  pendingCount: number
  lastGeneratedAt: string | null
  visualIdentity: VisualIdentity | null
  /** Drives the connection pill. Resolved server-side so the title never flickers. */
  connectionCount: number
}

/** Top-level client settings form. Owns the header, because it owns the tab state. */
export function ClientSettingsForm({
  clientId,
  sourceCount,
  client,
  profile,
  schedule,
  insights,
  publishedCount,
  pendingCount,
  lastGeneratedAt,
  visualIdentity: initialVisualIdentity,
  connectionCount,
}: ClientSettingsFormProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [activeTab, setActiveTab] = useState<SettingsTab>('basic')
  const [saving, setSaving] = useState(false)

  // ── Client fields ──
  const [name, setName] = useState(client.name)
  const [niche, setNiche] = useState(client.niche ?? '')
  const [language, setLanguage] = useState(client.language)
  const [websiteUrl, setWebsiteUrl] = useState(client.website_url ?? '')
  const [contactEmail, setContactEmail] = useState(client.contact_email ?? '')
  const [postsPerWeek, setPostsPerWeek] = useState(String(client.posts_per_week))

  // ── Brand profile fields ──
  const [tone, setTone] = useState(profile?.tone ?? '')
  const [targetAudience, setTargetAudience] = useState(profile?.target_audience ?? '')
  const [contentPillars, setContentPillars] = useState<WeightedPillar[]>(() =>
    parsePillars(profile?.content_pillars ?? null)
  )
  const [avoidTopics, setAvoidTopics] = useState(profile?.avoid_topics ?? '')
  const [testimonialVoice, setTestimonialVoice] = useState(
    profile?.client_testimonial_voice ?? ''
  )
  const [languageFormality, setLanguageFormality] = useState(
    profile?.language_formality ?? 'neutral'
  )
  const [secondaryLanguage, setSecondaryLanguage] = useState(profile?.secondary_language ?? '')
  const [isHealthNiche, setIsHealthNiche] = useState(profile?.is_health_niche ?? false)
  const [languageNotes, setLanguageNotes] = useState(profile?.language_notes ?? '')
  const [defaultPostType, setDefaultPostType] = useState(profile?.default_post_type ?? 'single')
  const [defaultCarouselSlides, setDefaultCarouselSlides] = useState(
    String(profile?.default_carousel_slides ?? 6)
  )

  // ── Platform ──
  const mixJson = profile?.weekly_mix_json as Record<string, unknown> | null
  const firstPlatform = mixJson
    ? (Object.keys(mixJson).find((k) => !['carousel', 'single'].includes(k)) ?? 'Instagram')
    : 'Instagram'
  const [activePlatform, setActivePlatform] = useState<string>(firstPlatform)

  // ── Schedule ──
  const [freqValue, setFreqValue] = useState(String(schedule?.frequency_value ?? 3))
  const [autoDay, setAutoDay] = useState(schedule?.auto_generate_day ?? 'monday')
  const [isActive, setIsActive] = useState(schedule?.is_active ?? true)

  // ── Visual identity ──
  const [visualIdentity, setVisualIdentity] = useState<VisualIdentity>(
    initialVisualIdentity ?? buildDefaultIdentity()
  )
  const [reanalyzing, setReanalyzing] = useState(false)

  async function handleReanalyze() {
    setReanalyzing(true)
    try {
      const res = await fetch(`/api/clients/${clientId}/visual-identity/reanalyze`, { method: 'POST' })
      if (!res.ok) throw new Error('reanalyze failed')
      const data = (await res.json()) as { identity: VisualIdentity }
      setVisualIdentity(data.identity)
      toast.success('Visual identity refreshed from website')
    } catch {
      toast.error('Could not re-analyze the website. Please try again.')
    } finally {
      setReanalyzing(false)
    }
  }

  // ── OAuth redirect toast ──
  useEffect(() => {
    const connected = searchParams.get('meta_connected')
    const error = searchParams.get('meta_error')
    if (connected) {
      bustConnectionsCache(clientId)
      toast.success(
        `${connected === 'instagram' ? 'Instagram' : 'Facebook'} account connected successfully`
      )
    } else if (error) {
      // Callback puts the real failure reason in meta_error_detail — show it,
      // a generic message makes OAuth failures undebuggable
      const detail = searchParams.get('meta_error_detail')
      toast.error(
        detail ? `Failed to connect account: ${detail.slice(0, 300)}` : 'Failed to connect account. Please try again.'
      )
    }
  }, [searchParams, clientId])

  // ── Save ──
  async function handleSave() {
    if (!name.trim()) {
      toast.error('Client name is required')
      return
    }
    setSaving(true)
    const result = await updateClient(clientId, {
      name,
      niche: niche || null,
      language,
      website_url: websiteUrl || null,
      contact_email: contactEmail || null,
      posts_per_week: parseInt(postsPerWeek, 10),
      brand_profile: {
        tone: tone || null,
        target_audience: targetAudience || null,
        content_pillars:
          contentPillars.length > 0 ? serializePillars(contentPillars) : null,
        avoid_topics: avoidTopics || null,
        client_testimonial_voice: testimonialVoice || null,
        language_formality: languageFormality,
        secondary_language: secondaryLanguage || null,
        is_health_niche: isHealthNiche,
        language_notes: languageNotes || null,
        default_post_type: defaultPostType,
        default_carousel_slides: parseInt(defaultCarouselSlides, 10),
        weekly_mix_json: { [activePlatform]: 1 },
      },
      posting_schedule: {
        is_active: isActive,
        frequency_value: parseInt(freqValue, 10),
        auto_generate_day: autoDay,
      },
      visual_identity: visualIdentity,
    })
    if (result.ok) {
      toast.success('Client updated')
      router.push('/clients')
    } else {
      toast.error('Failed to save changes. Please try again.')
      setSaving(false)
    }
  }

  const isInsightsTab = activeTab === 'insights' || activeTab === 'ideas'
  const isConnected = connectionCount > 0

  const tabs: Array<TabItem<SettingsTab>> = SETTINGS_TABS.map((tab) =>
    tab.id === 'accounts'
      ? { ...tab, count: connectionCount, warn: !isConnected }
      : { ...tab }
  )

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        crumb={[{ label: 'Clients', href: '/clients' }, { label: name || 'Client' }]}
        back="/clients"
        badge={extractInitials(name || 'Client')}
        title={
          <>
            <span className="truncate">{name || 'Untitled client'}</span>
            {isConnected ? (
              <HeaderPill tone="ok">
                {connectionCount} connected
              </HeaderPill>
            ) : (
              <HeaderPill tone="bad">Not connected</HeaderPill>
            )}
          </>
        }
        railTools={
          <>
            <span className="hidden text-xs text-text3 sm:block">
              {lastGeneratedAt
                ? `Queue refreshed ${formatRelativeTime(new Date(lastGeneratedAt))}`
                : 'Queue not yet refreshed'}
            </span>
            {/* Kept from the deleted status card: the only route to the sources screen. */}
            <a href={`/clients/${clientId}/sources`} className={cn(TOOL_ROW, 'text-[12px]')}>
              {sourceCount} source{sourceCount === 1 ? '' : 's'} &rarr;
            </a>
          </>
        }
        meta={
          <HeaderMeta
            parts={[
              niche || null,
              languageFormality ? `${language} · ${languageFormality}` : language,
              pendingCount > 0 && <MetaFlag>{pendingCount} pending review</MetaFlag>,
              publishedCount > 0 && `${publishedCount} published`,
            ]}
          />
        }
        actions={
          <>
            <Button variant="ghost" size="sm" onClick={() => router.push('/clients')} disabled={saving}>
              Cancel
            </Button>
            {!isInsightsTab && (
              <Button size="sm" onClick={handleSave} loading={saving}>
                Save changes
              </Button>
            )}
          </>
        }
        tabs={<TabRail items={tabs} active={activeTab} onSelect={setActiveTab} label="Client settings" />}
      />

      {/* Full width: the 240px left nav is gone, so nothing competes with the form. */}
      <div className={cn(PAGE_SHELL, 'min-h-0 flex-1 pb-8 pt-5')}>
        <div className="flex h-full min-w-0 flex-col overflow-hidden rounded-card border border-line bg-surface">
          {activeTab === 'basic' && (
            <BasicInfoTab
              name={name}
              niche={niche}
              websiteUrl={websiteUrl}
              contactEmail={contactEmail}
              language={language}
              languageFormality={languageFormality}
              postsPerWeek={postsPerWeek}
              secondaryLanguage={secondaryLanguage}
              isHealthNiche={isHealthNiche}
              onNameChange={setName}
              onNicheChange={setNiche}
              onWebsiteUrlChange={setWebsiteUrl}
              onContactEmailChange={setContactEmail}
              onLanguageChange={setLanguage}
              onLanguageFormalityChange={setLanguageFormality}
              onPostsPerWeekChange={setPostsPerWeek}
              onSecondaryLanguageChange={setSecondaryLanguage}
              onIsHealthNicheChange={setIsHealthNiche}
            />
          )}
          {activeTab === 'brand' && (
            <BrandProfileTab
              tone={tone}
              targetAudience={targetAudience}
              contentPillars={contentPillars}
              avoidTopics={avoidTopics}
              testimonialVoice={testimonialVoice}
              languageNotes={languageNotes}
              onToneChange={setTone}
              onTargetAudienceChange={setTargetAudience}
              onContentPillarsChange={setContentPillars}
              onAvoidTopicsChange={setAvoidTopics}
              onTestimonialVoiceChange={setTestimonialVoice}
              onLanguageNotesChange={setLanguageNotes}
            />
          )}
          {activeTab === 'visual' && (
            <VisualIdentityTab
              identity={visualIdentity}
              onChange={setVisualIdentity}
              onReanalyze={handleReanalyze}
              reanalyzing={reanalyzing}
            />
          )}
          {activeTab === 'schedule' && (
            <ScheduleTab
              activePlatform={activePlatform}
              defaultPostType={defaultPostType}
              defaultCarouselSlides={defaultCarouselSlides}
              freqValue={freqValue}
              autoDay={autoDay}
              isActive={isActive}
              onActivePlatformChange={setActivePlatform}
              onDefaultPostTypeChange={setDefaultPostType}
              onDefaultCarouselSlidesChange={setDefaultCarouselSlides}
              onFreqValueChange={setFreqValue}
              onAutoDayChange={setAutoDay}
              onIsActiveChange={setIsActive}
            />
          )}
          {activeTab === 'accounts' && <ConnectedAccountsTab clientId={clientId} />}
          {activeTab === 'insights' && (
            <ContentInsightsTab
              insights={insights}
              sourceCount={sourceCount}
              clientId={clientId}
            />
          )}
          {activeTab === 'ideas' && (
            <IdeaFormTab clientId={clientId} clientName={client.name} />
          )}
        </div>
      </div>
    </div>
  )
}
