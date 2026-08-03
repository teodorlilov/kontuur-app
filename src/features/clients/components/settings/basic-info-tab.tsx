'use client'

import { Field, FormSection, InputAffix, ToggleRow } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Select, ensureOption } from '@/components/ui/select'
import {
  CONTENT_LANGUAGE_OPTIONS,
  LANGUAGE_FORMALITY_OPTIONS,
  POSTS_PER_RUN_OPTIONS,
} from '@/utils/constants'
import type { BrandDraft, ClientDraft } from '@/features/clients/lib/client-draft'

interface BasicInfoTabProps {
  client: ClientDraft
  brand: BrandDraft
  onClientChange: (patch: Partial<ClientDraft>) => void
  onBrandChange: (patch: Partial<BrandDraft>) => void
}

/** Identity and language: who the client is and how posts are written for them. */
export function BasicInfoTab({ client, brand, onClientChange, onBrandChange }: BasicInfoTabProps) {
  const languageOptions = ensureOption(CONTENT_LANGUAGE_OPTIONS, client.language)

  return (
    <>
      <FormSection>
        <Field label="Client name" span={6} required>
          <Input
            value={client.name}
            onChange={(e) => onClientChange({ name: e.target.value })}
            placeholder="Acme Studio"
          />
        </Field>
        <Field label="Niche" span={6} hint="Shapes the angle of every post.">
          <Input
            value={client.niche}
            onChange={(e) => onClientChange({ niche: e.target.value })}
            placeholder="e.g. Fitness coaching"
          />
        </Field>
        <Field label="Website" span={6}>
          <InputAffix prefix="https://">
            <Input
              value={stripScheme(client.websiteUrl)}
              onChange={(e) => onClientChange({ websiteUrl: withScheme(e.target.value) })}
              placeholder="example.com"
            />
          </InputAffix>
        </Field>
        <Field label="Contact email" span={6} optional>
          <Input
            type="email"
            value={client.contactEmail}
            onChange={(e) => onClientChange({ contactEmail: e.target.value })}
            placeholder="client@example.com"
          />
        </Field>
      </FormSection>

      <FormSection legend="Language" description="How posts are written for this client.">
        <Field label="Primary" span={4}>
          <Select
            value={client.language}
            onChange={(e) => onClientChange({ language: e.target.value })}
            options={languageOptions}
          />
        </Field>
        <Field label="Formality" span={4}>
          <Select
            value={brand.languageFormality}
            onChange={(e) => onBrandChange({ languageFormality: e.target.value })}
            options={[...LANGUAGE_FORMALITY_OPTIONS]}
          />
        </Field>
        <Field label="Secondary" span={4} optional>
          <Input
            value={brand.secondaryLanguage}
            onChange={(e) => onBrandChange({ secondaryLanguage: e.target.value })}
            placeholder="e.g. English"
          />
        </Field>
        <Field label="Posts per run" span={3}>
          <Select
            value={client.postsPerWeek}
            onChange={(e) => onClientChange({ postsPerWeek: e.target.value })}
            options={POSTS_PER_RUN_OPTIONS}
          />
        </Field>
      </FormSection>

      <FormSection>
        <ToggleRow
          title="Health-related client"
          description="Applies medical guidelines and appends disclaimers on publish."
          checked={brand.isHealthNiche}
          onChange={(v) => onBrandChange({ isHealthNiche: v })}
        />
      </FormSection>
    </>
  )
}

/** The `https://` lives in the affix, so the field shows the bare host. */
function stripScheme(url: string): string {
  return url.replace(/^https?:\/\//, '')
}

function withScheme(host: string): string {
  const bare = stripScheme(host).trim()
  return bare ? `https://${bare}` : ''
}
