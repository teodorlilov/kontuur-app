'use client'

import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { PillarEditor } from '@/components/ui/pillar-editor'
import { PanelHeader } from './basic-info-tab'
import type { WeightedPillar } from '@/lib/clients/content-pillars'

interface BrandProfileTabProps {
  tone: string
  targetAudience: string
  contentPillars: WeightedPillar[]
  avoidTopics: string
  testimonialVoice: string
  languageNotes: string
  onToneChange: (v: string) => void
  onTargetAudienceChange: (v: string) => void
  onContentPillarsChange: (pillars: WeightedPillar[]) => void
  onAvoidTopicsChange: (v: string) => void
  onTestimonialVoiceChange: (v: string) => void
  onLanguageNotesChange: (v: string) => void
}

/** Brand profile tab: tone, audience, pillars, and language rules. */
export function BrandProfileTab({
  tone,
  targetAudience,
  contentPillars,
  avoidTopics,
  testimonialVoice,
  languageNotes,
  onToneChange,
  onTargetAudienceChange,
  onContentPillarsChange,
  onAvoidTopicsChange,
  onTestimonialVoiceChange,
  onLanguageNotesChange,
}: BrandProfileTabProps) {
  return (
    <>
      <PanelHeader
        title="Brand profile"
        subtitle="Tone, audience, content pillars, and language rules"
      />
      <div style={{ padding: '20px 22px', overflowY: 'auto' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 12,
            marginBottom: 12,
          }}
        >
          <Textarea
            label="Brand tone"
            value={tone}
            onChange={(e) => onToneChange(e.target.value)}
            placeholder="e.g. Friendly, warm, and motivating"
            rows={3}
            style={{ minHeight: 80 }}
          />
          <Textarea
            label="Target audience"
            value={targetAudience}
            onChange={(e) => onTargetAudienceChange(e.target.value)}
            placeholder="e.g. Women 25–40, fitness enthusiasts"
            rows={3}
            style={{ minHeight: 80 }}
          />
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            marginBottom: 18,
          }}
        >
          <Textarea
            label="Topics to avoid"
            value={avoidTopics}
            onChange={(e) => onAvoidTopicsChange(e.target.value)}
            placeholder="e.g. No diet culture messaging, no competitor mentions"
            rows={2}
            style={{ minHeight: 60 }}
          />
          <Input
            label="Client testimonial voice"
            value={testimonialVoice}
            onChange={(e) => onTestimonialVoiceChange(e.target.value)}
            placeholder="e.g. They really get my style and always deliver on time"
          />
          <Textarea
            label="Language requirements"
            value={languageNotes}
            onChange={(e) => onLanguageNotesChange(e.target.value)}
            placeholder="e.g. Always use 'програма' not 'план', avoid English loan words..."
            rows={2}
            style={{ minHeight: 60 }}
          />
        </div>

        <div
          style={{
            borderTop: '0.5px solid var(--color-border-1)',
            paddingTop: 16,
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 500,
              color: 'var(--color-text-2)',
              letterSpacing: '0.01em',
              marginBottom: 10,
            }}
          >
            Content pillars
          </div>
          <PillarEditor
            pillars={contentPillars}
            onChange={onContentPillarsChange}
            allowEmpty
          />
        </div>
      </div>
    </>
  )
}
