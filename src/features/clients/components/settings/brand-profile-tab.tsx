'use client'

import { useState, useTransition } from 'react'
import { Field, FormSection } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { PillarEditor } from '@/components/ui/pillar-editor'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { cn } from '@/utils/cn'
import { describeNewPillarCoverage } from '@/features/clients/lib/pillar-notice'
import { refreshStyleMemo } from '@/features/clients/actions/style-memo-actions'
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
  /** Pillar names as last saved — draft pillars not in here are "new". */
  savedPillarNames: readonly string[]
  unrestrictedSourceCount: number
  clientId: string
  styleMemo: { bullets: Array<{ rule: string; evidence_count: number }>; updatedAt: string } | null
}

/** Tone, audience and the content mix the model follows. */
export function BrandProfileTab({
  brand,
  onChange,
  savedPillarNames,
  unrestrictedSourceCount,
  clientId,
  styleMemo,
}: BrandProfileTabProps) {
  const newPillarNotice = describeNewPillarCoverage(
    savedPillarNames,
    brand.contentPillars,
    unrestrictedSourceCount
  )
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

      <LearnedFromReviews clientId={clientId} styleMemo={styleMemo} />

      <FormSection legend="Content pillars" description="How a batch of posts is divided.">
        <div className="col-span-12">
          <PillarEditor
            pillars={brand.contentPillars}
            onChange={(contentPillars) => onChange({ contentPillars })}
            allowEmpty
          />
          {/* The feeds-all default is invisible until a run surprises someone;
              the moment a pillar is added is the moment to say it. */}
          {newPillarNotice && <p className="mt-2 text-caption text-text3">{newPillarNotice}</p>}
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

/**
 * Read-only: the memo is machine-distilled from review edits and re-derived on
 * its own cadence — hand-editing it here would be overwritten. The human-owned
 * counterpart is Language requirements above; rules the reviewer wants
 * permanent belong there, and the distiller is told not to restate them.
 */
function LearnedFromReviews({
  clientId,
  styleMemo,
}: {
  clientId: string
  styleMemo: BrandProfileTabProps['styleMemo']
}) {
  const [pending, startTransition] = useTransition()
  const [refreshResult, setRefreshResult] = useState<string | null>(null)

  const refresh = () =>
    startTransition(async () => {
      const result = await refreshStyleMemo(clientId)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setRefreshResult(
        result.data.updated
          ? `Memo updated — ${result.data.bulletCount} rule${result.data.bulletCount === 1 ? '' : 's'}.`
          : 'Not enough new review edits to learn from yet.'
      )
    })

  return (
    <FormSection
      legend="Learned from reviews"
      description="Rules the engine distilled from what gets corrected in review. They steer every future draft."
    >
      <div className="col-span-12">
        {styleMemo ? (
          <ul className="flex flex-col gap-1.5">
            {styleMemo.bullets.map((b) => (
              <li key={b.rule} className="flex items-baseline gap-2 text-body text-text2">
                <span
                  aria-hidden
                  className="size-1.5 flex-none translate-y-[-2px] rounded-full bg-forest/60"
                />
                <span className="min-w-0 flex-1">{b.rule}</span>
                <span className="flex-none text-micro tabular-nums text-text3">
                  ×{b.evidence_count}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-caption text-text3">
            Nothing learned yet — it builds from edits made in the review queue.
          </p>
        )}
        <div className="mt-3 flex items-center gap-3">
          <Button type="button" variant="secondary" size="sm" onClick={refresh} disabled={pending}>
            {pending ? 'Learning…' : 'Refresh now'}
          </Button>
          <span className="text-caption text-text3">
            {refreshResult ??
              (styleMemo ? `Updated ${new Date(styleMemo.updatedAt).toLocaleDateString()}` : '')}
          </span>
        </div>
      </div>
    </FormSection>
  )
}
