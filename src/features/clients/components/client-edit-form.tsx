'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
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

interface ClientEditFormProps {
  clientId: string
  sourceCount: number
  client: {
    id: string
    name: string
    niche: string | null
    posts_per_week: number
    language: string
    website_url: string | null
    created_at: string
  }
  profile: {
    id: string
    tone: string | null
    target_audience: string | null
    content_pillars: string | null
    avoid_topics: string | null
    client_testimonial_voice: string | null
    default_post_type: string
    default_carousel_slides: number
    weekly_mix_json: unknown
    language_formality: string
    secondary_language: string | null
    is_health_niche: boolean
    best_time_json: unknown
    best_time_updated_at: string | null
    source_strategy: unknown
  } | null
  schedule: {
    id: string
    is_active: boolean
    frequency_type: string
    frequency_value: number
    auto_generate_day: string
    auto_generate_time: string
  } | null
}

export function ClientEditForm({ clientId, sourceCount, client, profile, schedule }: ClientEditFormProps) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)

  // Client fields
  const [name, setName] = useState(client.name)
  const [niche, setNiche] = useState(client.niche ?? '')
  const [language, setLanguage] = useState(client.language)
  const [websiteUrl, setWebsiteUrl] = useState(client.website_url ?? '')
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
  const [freqType, setFreqType] = useState(schedule?.frequency_type ?? 'per_week')
  const [freqValue, setFreqValue] = useState(String(schedule?.frequency_value ?? 3))
  const [autoDay, setAutoDay] = useState(schedule?.auto_generate_day ?? 'monday')
  const [autoTime, setAutoTime] = useState(schedule?.auto_generate_time ?? '09:00')

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
            default_post_type: defaultPostType,
            default_carousel_slides: parseInt(defaultCarouselSlides, 10),
            weekly_mix_json: { [activePlatform]: 1 },
          },
          posting_schedule: {
            frequency_type: freqType,
            frequency_value: parseInt(freqValue, 10),
            auto_generate_day: autoDay,
            auto_generate_time: autoTime,
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
              label="Frequency type"
              value={freqType}
              onChange={(e) => setFreqType(e.target.value)}
              options={[
                { value: 'per_week', label: 'Per week' },
                { value: 'per_day', label: 'Per day' },
                { value: 'per_month', label: 'Per month' },
              ]}
            />
            <Select
              label="How many"
              value={freqValue}
              onChange={(e) => setFreqValue(e.target.value)}
              options={[1, 2, 3, 4, 5, 6, 7].map((n) => ({ value: String(n), label: String(n) }))}
            />
            <Select
              label="Auto-generate day"
              value={autoDay}
              onChange={(e) => setAutoDay(e.target.value)}
              options={[...WEEKDAY_OPTIONS]}
            />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Auto-generate time</label>
              <input
                type="time"
                value={autoTime}
                onChange={(e) => setAutoTime(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 outline-none focus:border-[#534AB7] focus:ring-2 focus:ring-[#534AB7]/20"
              />
            </div>
          </div>
        </section>

        {/* Connected accounts — Phase 2 placeholder */}
        <section className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm font-medium text-gray-700 mb-2">Connected accounts</p>
          <div className="bg-gray-50 rounded-lg px-4 py-4 text-center">
            <p className="text-sm text-gray-500">Social media connections coming in Phase 2.</p>
            <p className="text-xs text-gray-400 mt-1">
              Connect Instagram, Facebook, and more to enable direct publishing and real analytics.
            </p>
          </div>
        </section>

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

