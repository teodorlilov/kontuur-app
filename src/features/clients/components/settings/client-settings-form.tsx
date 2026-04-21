'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { parsePillars, serializePillars, type WeightedPillar } from '@/lib/clients/content-pillars'
import { updateClient } from '@/lib/actions/client-actions'
import { Button } from '@/components/ui/button'
import { Avatar } from '@/components/ui/avatar'
import { toast } from '@/components/ui/toast'
import type { ClientRow, BrandProfileRow, PostingScheduleRow } from '@/types/database'
import { StatusCard, SettingsNav, type SettingsTab } from './settings-nav'
import { BasicInfoTab } from './basic-info-tab'
import { BrandProfileTab } from './brand-profile-tab'
import { ScheduleTab } from './schedule-tab'
import { ConnectedAccountsTab, bustConnectionsCache } from './connected-accounts-tab'
import { ContentInsightsTab, type ContentInsights } from './content-insights-tab'

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
        frequency_value: parseInt(freqValue, 10),
        auto_generate_day: autoDay,
      },
    })
    if (result.ok) {
      toast.success('Client updated')
      router.push('/clients')
    } else {
      toast.error('Failed to save changes. Please try again.')
      setSaving(false)
    }
  }

  const isInsightsTab = activeTab === 'insights'

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
      <div style={{ display: 'flex', gap: 16, padding: '0 28px 32px', flex: 1, minHeight: 0 }}>
        {/* Left sidebar */}
        <div
          style={{
            width: 240,
            flexShrink: 0,
            display: 'flex',
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
          <SettingsNav activeTab={activeTab} onTabChange={setActiveTab} />
        </div>

        {/* Right content panel */}
        <div
          style={{
            flex: 1,
            background: 'var(--color-surface)',
            border: '0.5px solid var(--color-border-1)',
            borderRadius: 12,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            minWidth: 0,
          }}
        >
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
              onActivePlatformChange={setActivePlatform}
              onDefaultPostTypeChange={setDefaultPostType}
              onDefaultCarouselSlidesChange={setDefaultCarouselSlides}
              onFreqValueChange={setFreqValue}
              onAutoDayChange={setAutoDay}
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
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '20px 28px 0',
        marginBottom: 20,
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
