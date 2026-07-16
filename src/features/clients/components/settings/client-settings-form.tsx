'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { parsePillars, serializePillars, type WeightedPillar } from '@/lib/clients/content-pillars'
import { updateClient } from '@/features/clients/actions/client-actions'
import { saveBrandKit } from '@/features/clients/actions/brand-kit-actions'
import { requestDesignSystem, type DesignPlate, type DesignVector } from '@/features/clients/lib/design-system-client'
import type { BrandBrief } from '@/lib/brand-kit/extract/report'
import type { ArtDirection } from '@/lib/brand-kit/art-direction'
import type { BrandTokens } from '@/lib/scene-graph'
import { Button } from '@/components/ui/button'
import { Avatar } from '@/components/ui/avatar'
import { toast } from '@/components/ui/toast'
import type { ClientRow, BrandProfileRow, PostingScheduleRow } from '@/types'
import { StatusCard, SettingsNav, type SettingsTab } from './settings-nav'
import { BasicInfoTab } from './basic-info-tab'
import { BrandProfileTab } from './brand-profile-tab'
import { ScheduleTab } from './schedule-tab'
import { ConnectedAccountsTab, bustConnectionsCache } from './connected-accounts-tab'
import { ContentInsightsTab, type ContentInsights } from './content-insights-tab'
import { VisualSystemTab, type PropagationCounts } from './visual-system-tab'
import type { FeedSystemOption } from '../visual-system/feed-system-picker'
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
  brandTokens: BrandTokens
  feedSystems: FeedSystemOption[]
  selectedFeedSystemSlug: string | null
  propagation: PropagationCounts
  /** The client's art-direction brief — drives on-brand design-system prompts. */
  brief: BrandBrief | null
  /** The client's already-generated design system (from the bank), shown on open. */
  initialDesignPlates?: Record<string, DesignPlate>
  initialDesignVectors?: DesignVector[]
  /** The client's persisted AI art direction (drives every post's design). */
  artDirection: ArtDirection | null
}

/** Top-level client settings form with tabbed layout. */
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
  brandTokens,
  feedSystems,
  selectedFeedSystemSlug,
  propagation,
  brief,
  initialDesignPlates,
  initialDesignVectors,
  artDirection: initialArtDirection,
}: ClientSettingsFormProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [activeTab, setActiveTab] = useState<SettingsTab>('basic')
  const [saving, setSaving] = useState(false)
  const [mobileView, setMobileView] = useState<'nav' | 'form'>('nav')

  const handleTabChange = useCallback((tab: SettingsTab) => {
    setActiveTab(tab)
    setMobileView('form')
  }, [])

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

  // ── Visual system ──
  const [tokens, setTokens] = useState<BrandTokens>(brandTokens)
  const [feedSystemSlug, setFeedSystemSlug] = useState<string | null>(selectedFeedSystemSlug)
  // Design system: seeded from the client's bank on open; `designDirty` marks a fresh generation so a
  // plain settings save doesn't needlessly re-seed the bank with the already-persisted set.
  const [designPlates, setDesignPlates] = useState<Record<string, DesignPlate> | null>(initialDesignPlates ?? null)
  const [designVectors, setDesignVectors] = useState<DesignVector[] | null>(initialDesignVectors ?? null)
  const [generatingDesign, setGeneratingDesign] = useState(false)
  const [designDirty, setDesignDirty] = useState(false)
  // Art direction: shown from the persisted kit; recompose regenerates it, persisted on Save (dirty flag).
  const [artDirection, setArtDirection] = useState<ArtDirection | null>(initialArtDirection)
  const [recomposingDirection, setRecomposingDirection] = useState(false)
  const [directionDirty, setDirectionDirty] = useState(false)

  /** Recompose the art direction from the client's persisted business + visual identity; persisted on Save. */
  async function handleRecomposeDirection() {
    setRecomposingDirection(true)
    try {
      const res = await fetch(`/api/clients/${clientId}/art-direction`, { method: 'POST' })
      const data = (await res.json().catch(() => ({}))) as { artDirection?: ArtDirection }
      if (data.artDirection) {
        setArtDirection(data.artDirection)
        setDirectionDirty(true)
      } else {
        toast.error('Could not recompose the art direction.')
      }
    } finally {
      setRecomposingDirection(false)
    }
  }

  /** Generate the real design-system imagery + marks from the current tokens/brief. Shown live under the
   *  token type; persisted to the client's bank on Save (`designDirty`). */
  async function handleGenerateDesignSystem() {
    setGeneratingDesign(true)
    try {
      const { plates, vectors } = await requestDesignSystem({ tokens, feedSystemSlug, brief })
      if (Object.keys(plates).length > 0) {
        setDesignPlates(plates)
        setDesignDirty(true)
      } else {
        toast.error('No design images were generated. Please try again.')
      }
      if (vectors.length > 0) {
        setDesignVectors(vectors)
        setDesignDirty(true)
      }
    } finally {
      setGeneratingDesign(false)
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
      toast.error('Failed to connect account. Please try again.')
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
    })
    if (!result.ok) {
      toast.error('Failed to save changes. Please try again.')
      setSaving(false)
      return
    }

    // Persist the visual system only when it actually changed — a save otherwise bumps the kit version
    // (and dirties render hashes) for nothing.
    const visualChanged =
      JSON.stringify(tokens) !== JSON.stringify(brandTokens) || feedSystemSlug !== selectedFeedSystemSlug
    if (visualChanged || designDirty || directionDirty) {
      // Seed the bank only with a freshly generated design system; leave `brief` untouched (undefined).
      // Persist a freshly recomposed art direction only when it changed (directionDirty).
      const kitResult = await saveBrandKit(
        clientId,
        tokens,
        feedSystemSlug,
        undefined,
        designDirty && designPlates ? designPlates : undefined,
        designDirty && designVectors ? designVectors : undefined,
        directionDirty ? artDirection : undefined
      )
      if (!kitResult.ok) {
        toast.error(kitResult.error ?? 'Failed to save the visual system.')
        setSaving(false)
        return
      }
    }

    toast.success('Client updated')
    router.push('/clients')
  }

  const isInsightsTab = activeTab === 'insights' || activeTab === 'ideas'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {/* Topbar */}
      <SettingsTopbar
        clientName={client.name}
        isInsightsTab={isInsightsTab}
        saving={saving}
        onSave={handleSave}
        onCancel={() => router.push('/clients')}
      />

      {/* Body: sidebar + content panel */}
      <div className="px-4 md:px-7" style={{ display: 'flex', gap: 16, paddingBottom: 32, flex: 1, minHeight: 0 }}>
        {/* Left sidebar — full width on mobile, fixed on desktop */}
        <div
          className={`${mobileView === 'nav' ? 'flex' : 'hidden'} md:flex w-full md:w-[240px]`}
          style={{
            flexShrink: 0,
            flexDirection: 'column',
          }}
        >
          <StatusCard
            lastGeneratedAt={lastGeneratedAt}
            pendingCount={pendingCount}
            activeSourceCount={sourceCount}
            publishedCount={publishedCount}
            sourcesHref={`/clients/${clientId}/sources`}
          />
          <SettingsNav activeTab={activeTab} onTabChange={handleTabChange} />
        </div>

        {/* Right content panel — hidden on mobile when viewing nav */}
        <div
          className={`${mobileView === 'form' ? 'flex' : 'hidden'} md:flex`}
          style={{
            flex: 1,
            background: 'var(--color-surface)',
            border: '0.5px solid var(--color-border-1)',
            borderRadius: 12,
            overflow: 'hidden',
            flexDirection: 'column',
            minWidth: 0,
          }}
        >
          {/* Mobile back to settings nav */}
          <button
            type="button"
            className="md:hidden"
            onClick={() => setMobileView('nav')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '8px 12px',
              fontSize: 12,
              fontWeight: 500,
              color: 'var(--color-muted)',
              background: 'var(--color-surface)',
              border: 'none',
              borderBottom: '0.5px solid var(--color-border-1)',
              cursor: 'pointer',
              fontFamily: 'inherit',
              flexShrink: 0,
            }}
          >
            <ChevronLeft size={14} />
            Back to settings
          </button>
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
          {activeTab === 'visual' && (
            <VisualSystemTab
              tokens={tokens}
              feedSystems={feedSystems}
              selectedFeedSystemSlug={feedSystemSlug}
              primaryLanguage={language}
              secondaryLanguage={secondaryLanguage}
              propagation={propagation}
              onTokensChange={setTokens}
              onFeedSystemChange={setFeedSystemSlug}
              designPlates={designPlates ? Object.fromEntries(Object.entries(designPlates).map(([role, p]) => [role, p.publicUrl])) : undefined}
              designVectors={designVectors?.map((v) => v.svg)}
              generatingDesign={generatingDesign}
              onGenerateDesignSystem={handleGenerateDesignSystem}
              artDirection={artDirection}
              recomposingDirection={recomposingDirection}
              onRecomposeDirection={handleRecomposeDirection}
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

// ── Topbar ──

function SettingsTopbar({
  clientName,
  isInsightsTab,
  saving,
  onSave,
  onCancel,
}: {
  clientName: string
  isInsightsTab: boolean
  saving: boolean
  onSave: () => void
  onCancel: () => void
}) {
  return (
    <div
      className="px-4 md:px-7"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: 20,
        marginBottom: 20,
        flexWrap: 'wrap',
        gap: 8,
      }}
    >
      {/* Left: back link + client chip */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <a
          href="/clients"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12,
            color: 'var(--color-muted)',
            textDecoration: 'none',
          }}
        >
          ← Clients
        </a>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '5px 11px',
            background: 'var(--color-surface)',
            border: '0.5px solid var(--color-border-1)',
            borderRadius: 7,
          }}
        >
          <Avatar name={clientName} size="sm" />
          <span
            style={{
              fontSize: 12,
              fontWeight: 500,
              color: 'var(--color-text-1)',
            }}
          >
            {clientName}
          </span>
        </div>
      </div>

      {/* Right: cancel + save */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Button variant="secondary" size="sm" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        {!isInsightsTab && (
          <Button size="sm" onClick={onSave} loading={saving}>
            Save changes
          </Button>
        )}
      </div>
    </div>
  )
}
