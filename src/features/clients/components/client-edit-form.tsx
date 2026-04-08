'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { cn } from '@/utils/cn'
import { parsePillars, serializePillars, type WeightedPillar } from '@/lib/clients/content-pillars'
import { PillarEditor } from '@/features/generate/components/pillar-editor'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/select'
import { Topbar } from '@/components/layout/topbar'
import { toast } from '@/components/ui/toast'
import { PLATFORMS, WEEKDAY_OPTIONS, CAROUSEL_SLIDE_OPTIONS } from '@/utils/constants'
import type { ClientRow, BrandProfileRow, PostingScheduleRow } from '@/types/database'

interface MetaConnection {
  id: string
  platform: string
  account_id: string
  account_name: string
  token_expires_at: string | null
}

interface ContentInsights {
  avgScore: number | null
  trend: 'improving' | 'stable' | 'declining' | 'insufficient_data'
  topApprovedPillars: string[]
  topRewritePillars: string[]
}

interface ClientEditFormProps {
  clientId: string
  sourceCount: number
  client: Omit<ClientRow, 'agency_id'>
  profile: Omit<BrandProfileRow, 'client_id'> | null
  schedule: Omit<PostingScheduleRow, 'client_id' | 'created_at'> | null
  insights: ContentInsights | null
}

export function ClientEditForm({ clientId, sourceCount, client, profile, schedule, insights }: ClientEditFormProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [saving, setSaving] = useState(false)

  // Meta connections state
  const [connections, setConnections] = useState<MetaConnection[]>([])
  const [disconnecting, setDisconnecting] = useState<string | null>(null)

  useEffect(() => {
    // Show toast based on OAuth result params
    const connected = searchParams.get('meta_connected')
    const error = searchParams.get('meta_error')
    if (connected) {
      toast.success(`${connected === 'instagram' ? 'Instagram' : 'Facebook'} account connected successfully`)
    } else if (error) {
      toast.error('Failed to connect account. Please try again.')
    }
  }, [searchParams])

  useEffect(() => {
    fetch(`/api/meta/connections?client_id=${clientId}`)
      .then((r) => r.json())
      .then((data: { connections?: MetaConnection[] }) => {
        if (data.connections) setConnections(data.connections)
      })
      .catch(() => { /* silently ignore */ })
  }, [clientId])

  async function handleDisconnect(connectionId: string) {
    setDisconnecting(connectionId)
    try {
      const res = await fetch(`/api/meta/connections/${connectionId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to disconnect')
      setConnections((prev) => prev.filter((c) => c.id !== connectionId))
      toast.success('Account disconnected')
    } catch {
      toast.error('Failed to disconnect account')
    } finally {
      setDisconnecting(null)
    }
  }

  const connectedPlatforms = new Set(connections.map((c) => c.platform))

  // Client fields
  const [name, setName] = useState(client.name)
  const [niche, setNiche] = useState(client.niche ?? '')
  const [language, setLanguage] = useState(client.language)
  const [websiteUrl, setWebsiteUrl] = useState(client.website_url ?? '')
  const [contactEmail, setContactEmail] = useState(client.contact_email ?? '')
  const [postsPerWeek, setPostsPerWeek] = useState(String(client.posts_per_week))

  // Brand profile fields
  const [tone, setTone] = useState(profile?.tone ?? '')
  const [targetAudience, setTargetAudience] = useState(profile?.target_audience ?? '')
  const [contentPillars, setContentPillars] = useState<WeightedPillar[]>(() =>
    parsePillars(profile?.content_pillars ?? null)
  )
  const [avoidTopics, setAvoidTopics] = useState(profile?.avoid_topics ?? '')
  const [testimonialVoice, setTestimonialVoice] = useState(profile?.client_testimonial_voice ?? '')
  const [languageFormality, setLanguageFormality] = useState(profile?.language_formality ?? 'neutral')
  const [secondaryLanguage, setSecondaryLanguage] = useState(profile?.secondary_language ?? '')
  const [isHealthNiche, setIsHealthNiche] = useState(profile?.is_health_niche ?? false)
  const [languageNotes, setLanguageNotes] = useState(profile?.language_notes ?? '')
  const [defaultPostType, setDefaultPostType] = useState(profile?.default_post_type ?? 'single')
  const [defaultCarouselSlides, setDefaultCarouselSlides] = useState(
    String(profile?.default_carousel_slides ?? 6)
  )

  // Platform — single select, derive from weekly_mix_json or default to Instagram
  const mixJson = profile?.weekly_mix_json as Record<string, unknown> | null
  const firstPlatform = mixJson
    ? (Object.keys(mixJson).find((k) => !['carousel', 'single', 'reels'].includes(k)) ?? 'Instagram')
    : 'Instagram'
  const [activePlatform, setActivePlatform] = useState<string>(firstPlatform)

  // Schedule
  const [freqValue, setFreqValue] = useState(String(schedule?.frequency_value ?? 3))
  const [autoDay, setAutoDay] = useState(schedule?.auto_generate_day ?? 'monday')

  async function handleSave() {
    if (!name.trim()) {
      toast.error('Client name is required')
      return
    }

    setSaving(true)

    try {
      const res = await fetch(`/api/clients/${clientId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          niche: niche || null,
          language,
          website_url: websiteUrl || null,
          contact_email: contactEmail || null,
          posts_per_week: parseInt(postsPerWeek, 10),
          brand_profile: {
            tone: tone || null,
            target_audience: targetAudience || null,
            content_pillars: contentPillars.length > 0 ? serializePillars(contentPillars) : null,
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
        }),
      })

      if (!res.ok) throw new Error('Failed to save')

      toast.success('Client updated')
      router.push('/clients')
    } catch {
      toast.error('Failed to save changes. Please try again.')
      setSaving(false)
    }
  }

  return (
    <>
      <Topbar title={`Edit: ${client.name}`} />
      <div className="p-6 max-w-2xl mx-auto space-y-6 pb-24">
        {/* Basic info */}
        <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <p className="text-sm font-medium text-gray-700">Basic info</p>
          <Input label="Client name" value={name} onChange={(e) => setName(e.target.value)} />
          <Input label="Niche" value={niche} onChange={(e) => setNiche(e.target.value)} placeholder="e.g. Fitness coaching" />
          <Input label="Website URL" value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} placeholder="e.g. https://example.com" />
          <Input label="Client contact email" type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="client@example.com" />
          <Select
            label="Primary language"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            options={(() => {
              const known = [
                { value: 'Bulgarian', label: 'Bulgarian' },
                { value: 'English', label: 'English' },
                { value: 'French', label: 'French' },
                { value: 'German', label: 'German' },
                { value: 'Italian', label: 'Italian' },
                { value: 'Portuguese', label: 'Portuguese' },
                { value: 'Spanish', label: 'Spanish' },
              ]
              const isKnown = known.some((o) => o.value.toLowerCase() === language.toLowerCase())
              return isKnown ? known : [{ value: language, label: language }, ...known]
            })()}
          />
          <Input
            label="Secondary language (optional)"
            value={secondaryLanguage}
            onChange={(e) => setSecondaryLanguage(e.target.value)}
            placeholder="e.g. Spanish"
          />
          <Select
            label="Posts to generate"
            value={postsPerWeek}
            onChange={(e) => setPostsPerWeek(e.target.value)}
            options={[1, 2, 3, 4, 5, 6, 7].map((n) => ({ value: String(n), label: String(n) }))}
          />
        </section>

        {/* Brand profile */}
        <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <p className="text-sm font-medium text-gray-700">Brand profile</p>
          <Textarea
            label="Brand tone"
            value={tone}
            onChange={(e) => setTone(e.target.value)}
            placeholder="e.g. Friendly, warm, and motivating"
            rows={2}
          />
          <Textarea
            label="Target audience"
            value={targetAudience}
            onChange={(e) => setTargetAudience(e.target.value)}
            placeholder="e.g. Women 25–40, fitness enthusiasts"
            rows={2}
          />
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Content pillars</p>
            <PillarEditor pillars={contentPillars} onChange={setContentPillars} allowEmpty />
          </div>
          <Textarea
            label="Topics to avoid"
            value={avoidTopics}
            onChange={(e) => setAvoidTopics(e.target.value)}
            placeholder="e.g. No diet culture messaging, no competitor mentions"
            rows={2}
          />
          <Textarea
            label="Client testimonial voice"
            value={testimonialVoice}
            onChange={(e) => setTestimonialVoice(e.target.value)}
            placeholder="e.g. They really get my style and always deliver on time"
            rows={2}
          />
          <Select
            label="Language formality"
            value={languageFormality}
            onChange={(e) => setLanguageFormality(e.target.value)}
            options={[
              { value: 'formal', label: 'Formal' },
              { value: 'neutral', label: 'Neutral' },
              { value: 'casual', label: 'Casual' },
            ]}
          />
          <Textarea
            label="Language requirements"
            value={languageNotes}
            onChange={(e) => setLanguageNotes(e.target.value)}
            placeholder="Any specific language rules for this client, e.g. always use 'програма' not 'план', avoid English loan words..."
            rows={3}
          />
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsHealthNiche(!isHealthNiche)}
              className={cn(
                'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                isHealthNiche ? 'bg-[#534AB7]' : 'bg-gray-200'
              )}
            >
              <span
                className={cn(
                  'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
                  isHealthNiche ? 'translate-x-6' : 'translate-x-1'
                )}
              />
            </button>
            <span className="text-sm text-gray-700">Health-related client</span>
          </div>
        </section>

        {/* Platform — single select */}
        <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
          <p className="text-sm font-medium text-gray-700">Active platform</p>
          <div className="flex flex-wrap gap-2">
            {PLATFORMS.map((platform) => (
              <button
                key={platform}
                type="button"
                onClick={() => setActivePlatform(platform)}
                className={cn(
                  'px-4 py-2 rounded-full text-sm font-medium border transition-colors',
                  activePlatform === platform
                    ? 'bg-[#534AB7] text-white border-[#534AB7]'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                )}
              >
                {platform}
              </button>
            ))}
          </div>
        </section>

        {/* Post type defaults — only relevant for Instagram */}
        {activePlatform === 'Instagram' && <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <p className="text-sm font-medium text-gray-700">Post defaults</p>
          <Select
            label="Default post type"
            value={defaultPostType}
            onChange={(e) => setDefaultPostType(e.target.value)}
            options={[
              { value: 'single', label: 'Single image' },
              { value: 'carousel', label: 'Carousel' },
              { value: 'reels', label: 'Reels / video' },
            ]}
          />
          {defaultPostType === 'carousel' && (
            <Select
              label="Default carousel slides"
              value={defaultCarouselSlides}
              onChange={(e) => setDefaultCarouselSlides(e.target.value)}
              options={CAROUSEL_SLIDE_OPTIONS.map((n) => ({ value: String(n), label: `${n} slides` }))}
            />
          )}
        </section>}

        {/* Autonomous schedule */}
        <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <p className="text-sm font-medium text-gray-700">Autonomous schedule</p>
          <div className="grid grid-cols-2 gap-3">
            <Select
              label="How many posts"
              value={freqValue}
              onChange={(e) => setFreqValue(e.target.value)}
              options={[1, 2, 3, 4, 5, 6, 7].map((n) => ({ value: String(n), label: String(n) }))}
            />
            <Select
              label="Generate on"
              value={autoDay}
              onChange={(e) => setAutoDay(e.target.value)}
              options={[...WEEKDAY_OPTIONS]}
            />
          </div>
        </section>

        {/* Connected accounts */}
        <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
          <p className="text-sm font-medium text-gray-700">Connected accounts</p>

          {connections.length > 0 && (
            <div className="space-y-2">
              {connections.map((conn) => {
                const isExpired = conn.token_expires_at ? new Date(conn.token_expires_at) < new Date() : false
                return (
                  <div key={conn.id} className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="text-base">{conn.platform === 'instagram' ? '📸' : '👤'}</span>
                      <div>
                        <p className="text-sm font-medium text-gray-800">
                          {conn.platform === 'instagram' ? 'Instagram' : 'Facebook'}
                          {' · '}
                          <span className="font-normal text-gray-600">{conn.account_name}</span>
                        </p>
                        {isExpired && (
                          <p className="text-xs text-red-500">Token expired — reconnect to refresh</p>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDisconnect(conn.id)}
                      disabled={disconnecting === conn.id}
                      className="text-xs text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50"
                    >
                      {disconnecting === conn.id ? 'Disconnecting…' : 'Disconnect'}
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <a
              href={`/api/meta/connect?platform=instagram&client_id=${clientId}`}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors',
                connectedPlatforms.has('instagram')
                  ? 'border-[#534AB7] text-[#534AB7] hover:bg-[#534AB7]/5'
                  : 'border-gray-200 text-gray-700 hover:border-gray-300'
              )}
            >
              📸 {connectedPlatforms.has('instagram') ? 'Reconnect Instagram' : 'Connect Instagram'}
            </a>
            <a
              href={`/api/meta/connect?platform=facebook&client_id=${clientId}`}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors',
                connectedPlatforms.has('facebook')
                  ? 'border-[#534AB7] text-[#534AB7] hover:bg-[#534AB7]/5'
                  : 'border-gray-200 text-gray-700 hover:border-gray-300'
              )}
            >
              👤 {connectedPlatforms.has('facebook') ? 'Reconnect Facebook Page' : 'Connect Facebook Page'}
            </a>
          </div>
          <p className="text-xs text-gray-400">
            Connected accounts enable real analytics reports on the Analytics page.
          </p>
        </section>

        {/* Content insights */}
        {insights && (insights.avgScore !== null || insights.topApprovedPillars.length > 0) && (
          <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
            <p className="text-sm font-medium text-gray-700">Content insights</p>
            {insights.avgScore !== null && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">Avg quality score:</span>
                <span className="text-sm font-semibold text-gray-900">{insights.avgScore}/10</span>
                {insights.trend === 'improving' && <span className="text-green-500 text-sm">↑ improving</span>}
                {insights.trend === 'declining' && <span className="text-red-500 text-sm">↓ declining</span>}
                {insights.trend === 'stable' && <span className="text-gray-400 text-sm">→ stable</span>}
              </div>
            )}
            {insights.topApprovedPillars.length > 0 && (
              <div>
                <span className="text-xs text-gray-500 uppercase tracking-wide">Top approved pillars: </span>
                <span className="text-sm text-gray-700">{insights.topApprovedPillars.join(', ')}</span>
              </div>
            )}
            {insights.topRewritePillars.length > 0 && (
              <div>
                <span className="text-xs text-gray-500 uppercase tracking-wide">Most rewritten pillars: </span>
                <span className="text-sm text-gray-700">{insights.topRewritePillars.join(', ')}</span>
              </div>
            )}
          </section>
        )}

        {/* Research sources */}
        <section className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-gray-700">Research sources</p>
            <a
              href={`/clients/${clientId}/sources`}
              className="text-xs font-medium text-[#534AB7] hover:underline"
            >
              Manage
            </a>
          </div>
          {sourceCount === 0 ? (
            <p className="text-sm text-gray-400">
              No sources yet.{' '}
              <a href={`/clients/${clientId}/sources`} className="text-[#534AB7] hover:underline">
                Add RSS feeds or website URLs
              </a>{' '}
              to ground research in real content.
            </p>
          ) : (
            <p className="text-sm text-gray-500">
              {sourceCount} active source{sourceCount !== 1 ? 's' : ''}
            </p>
          )}
        </section>

        {/* Actions */}
        <div className="flex gap-3 pb-4">
          <Button onClick={handleSave} loading={saving} className="flex-1">
            Save changes
          </Button>
          <Button variant="ghost" onClick={() => router.push('/clients')} disabled={saving}>
            Cancel
          </Button>
        </div>
      </div>
    </>
  )
}

