'use client'

import { Field, FormSection } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { PillarEditor } from '@/components/ui/pillar-editor'
import { cn } from '@/utils/cn'
import type { BrandDraft } from '@/features/clients/lib/client-draft'

/**
 * Guidance length past which a prompt starts to dilute rather than sharpen.
 *
 * Advisory, not enforced: no `maxLength`, because existing profiles may already be longer and
 * silently truncating someone's saved guidance to satisfy a new limit would be data loss.
 */
const GUIDANCE_SOFT_LIMIT = 600

interface BrandProfileTabProps {
  brand: BrandDraft
  onChange: (patch: Partial<BrandDraft>) => void
}

/** Tone, audience and the content mix the model follows. */
export function BrandProfileTab({ brand, onChange }: BrandProfileTabProps) {
  return (
    <>
      <FormSection>
        <Field label="Brand tone" count={<SoftCount value={brand.tone} />}>
          <Textarea
            autoGrow
            value={brand.tone}
            onChange={(e) => onChange({ tone: e.target.value })}
            placeholder="Professional yet approachable, informative without being technical…"
          />
        </Field>
        <Field label="Target audience" count={<SoftCount value={brand.targetAudience} />}>
          <Textarea
            autoGrow
            value={brand.targetAudience}
            onChange={(e) => onChange({ targetAudience: e.target.value })}
            placeholder="Small businesses looking to improve their social presence…"
          />
        </Field>
        <Field label="Post goal" hint="What a post should get someone to do.">
          <Input
            value={brand.socialGoals}
            onChange={(e) => onChange({ socialGoals: e.target.value })}
            placeholder="Book an appointment, send an enquiry…"
          />
        </Field>
        <Field label="Topics to avoid" hint="Comma-separated.">
          <Textarea
            autoGrow
            value={brand.avoidTopics}
            onChange={(e) => onChange({ avoidTopics: e.target.value })}
            placeholder="Hard-sell messaging, competitor comparisons…"
          />
        </Field>
        <Field label="Language requirements" optional>
          <Textarea
            autoGrow
            value={brand.languageNotes}
            onChange={(e) => onChange({ languageNotes: e.target.value })}
            placeholder="e.g. Always use 'програма', never 'план'…"
          />
        </Field>
      </FormSection>

      <FormSection legend="Content pillars" description="How a batch of posts is divided.">
        <div className="col-span-12">
          <PillarEditor
            pillars={brand.contentPillars}
            onChange={(contentPillars) => onChange({ contentPillars })}
            allowEmpty
          />
        </div>
      </FormSection>
    </>
  )
}

/** Character count that warns past the soft limit instead of blocking at it. */
function SoftCount({ value }: { value: string }) {
  return (
    <span className={cn(value.length > GUIDANCE_SOFT_LIMIT && 'text-pending')}>
      {value.length} / {GUIDANCE_SOFT_LIMIT}
    </span>
  )
}
