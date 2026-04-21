'use client'

import { cn } from '@/utils/cn'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'

const LANGUAGE_OPTIONS = [
  { value: 'Bulgarian', label: 'Bulgarian' },
  { value: 'English', label: 'English' },
  { value: 'French', label: 'French' },
  { value: 'German', label: 'German' },
  { value: 'Italian', label: 'Italian' },
  { value: 'Portuguese', label: 'Portuguese' },
  { value: 'Spanish', label: 'Spanish' },
]

const FORMALITY_OPTIONS = [
  { value: 'formal', label: 'Formal' },
  { value: 'neutral', label: 'Neutral' },
  { value: 'casual', label: 'Casual' },
]

const POSTS_OPTIONS = [1, 2, 3, 4, 5, 6, 7].map((n) => ({
  value: String(n),
  label: String(n),
}))

interface BasicInfoTabProps {
  name: string
  niche: string
  websiteUrl: string
  contactEmail: string
  language: string
  languageFormality: string
  postsPerWeek: string
  secondaryLanguage: string
  isHealthNiche: boolean
  onNameChange: (v: string) => void
  onNicheChange: (v: string) => void
  onWebsiteUrlChange: (v: string) => void
  onContactEmailChange: (v: string) => void
  onLanguageChange: (v: string) => void
  onLanguageFormalityChange: (v: string) => void
  onPostsPerWeekChange: (v: string) => void
  onSecondaryLanguageChange: (v: string) => void
  onIsHealthNicheChange: (v: boolean) => void
}

/** Basic info tab: client identity, language, and contact details. */
export function BasicInfoTab({
  name,
  niche,
  websiteUrl,
  contactEmail,
  language,
  languageFormality,
  postsPerWeek,
  secondaryLanguage,
  isHealthNiche,
  onNameChange,
  onNicheChange,
  onWebsiteUrlChange,
  onContactEmailChange,
  onLanguageChange,
  onLanguageFormalityChange,
  onPostsPerWeekChange,
  onSecondaryLanguageChange,
  onIsHealthNicheChange,
}: BasicInfoTabProps) {
  const languageOptions = LANGUAGE_OPTIONS.some(
    (o) => o.value.toLowerCase() === language.toLowerCase()
  )
    ? LANGUAGE_OPTIONS
    : [{ value: language, label: language }, ...LANGUAGE_OPTIONS]

  return (
    <>
      <PanelHeader title="Basic info" subtitle="Client identity, language, and contact details" />
      <div style={{ padding: '20px 22px', overflowY: 'auto' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 12,
            marginBottom: 18,
          }}
        >
          <Input
            label="Client name"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
          />
          <Input
            label="Niche"
            value={niche}
            onChange={(e) => onNicheChange(e.target.value)}
            placeholder="e.g. Fitness coaching"
          />
          <Input
            label="Website URL"
            value={websiteUrl}
            onChange={(e) => onWebsiteUrlChange(e.target.value)}
            placeholder="https://example.com"
          />
          <Input
            label="Contact email"
            type="email"
            value={contactEmail}
            onChange={(e) => onContactEmailChange(e.target.value)}
            placeholder="client@example.com"
          />
          <Select
            label="Primary language"
            value={language}
            onChange={(e) => onLanguageChange(e.target.value)}
            options={languageOptions}
          />
          <Select
            label="Language formality"
            value={languageFormality}
            onChange={(e) => onLanguageFormalityChange(e.target.value)}
            options={FORMALITY_OPTIONS}
          />
          <Select
            label="Posts to generate"
            value={postsPerWeek}
            onChange={(e) => onPostsPerWeekChange(e.target.value)}
            options={POSTS_OPTIONS}
          />
          <Input
            label="Secondary language (optional)"
            value={secondaryLanguage}
            onChange={(e) => onSecondaryLanguageChange(e.target.value)}
            placeholder="e.g. English"
          />
        </div>

        <div
          style={{
            borderTop: '0.5px solid var(--color-border-1)',
            paddingTop: 14,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 0',
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: 'var(--color-text-1)',
                  marginBottom: 2,
                }}
              >
                Health-related client
              </div>
              <div style={{ fontSize: 11, color: 'var(--color-muted)' }}>
                Applies medical content guidelines and disclaimer rules
              </div>
            </div>
            <button
              type="button"
              onClick={() => onIsHealthNicheChange(!isHealthNiche)}
              className={cn(
                'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                isHealthNiche ? 'bg-[#1A2630]' : 'bg-gray-200'
              )}
              style={{ flexShrink: 0 }}
            >
              <span
                className={cn(
                  'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
                  isHealthNiche ? 'translate-x-6' : 'translate-x-1'
                )}
              />
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

/** Panel header reused across all tab components. */
export function PanelHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div
      style={{
        padding: '18px 22px 14px',
        borderBottom: '0.5px solid var(--color-border-1)',
        flexShrink: 0,
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-display, Georgia, serif)',
          fontSize: 20,
          fontWeight: 400,
          color: 'var(--color-text-1)',
          marginBottom: 2,
        }}
      >
        {title}
      </div>
      <div style={{ fontSize: 12, color: 'var(--color-muted)' }}>{subtitle}</div>
    </div>
  )
}
