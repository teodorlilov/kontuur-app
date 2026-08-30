'use client'

import { useState } from 'react'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { cn } from '@/utils/cn'
import {
  groupsForColumn,
  rowsForGroup,
  type DraftGroup,
  type DraftRowSpec,
} from '@/features/onboarding/lib/draft-rows'
import { paletteProvenance } from '@/features/onboarding/lib/build-draft'
import type { DraftFieldId, DraftProfile, FieldProvenance } from '@/features/onboarding/types'
import type { ExtractionStatus } from '@/features/onboarding/hooks/use-extraction-status'
import { DraftFieldEdit, DraftFieldRead } from './draft-field'
import { DraftRow } from './draft-row'

interface DraftSheetProps {
  draft: DraftProfile
  onChange: (patch: Partial<DraftProfile>) => void
  provenance: Partial<Record<DraftFieldId, FieldProvenance>>
  /** Fields the site could not answer. These render as questions rather than as blanks. */
  unanswered: DraftFieldId[]
  /** Answered here rather than left to the site — shown in Marker, "your call". */
  resolved: DraftFieldId[]
  /** No site was read: every field opens at once and there is nothing to re-read. */
  manual?: boolean
  host?: string
  /** Brand colours arrive from a separate job; the palette row reports its progress honestly. */
  paletteStatus?: ExtractionStatus
  onReread?: () => void
  rereading?: boolean
}

/**
 * The drafted client profile, as one sheet.
 *
 * The whole form is drawn before any of it is filled: the shape of a client profile is known
 * before the read starts, so values land in place and nothing reflows when it finishes.
 *
 * The columns split by kind, not by sequence — left is who the client is (all text), right is
 * what they publish (data and controls), and the band underneath holds the one row carrying
 * imagery. Folded into "Content and look" instead, the visual system made the right column half
 * again as tall as the left in every state.
 */
export function DraftSheet({
  draft,
  onChange,
  provenance,
  unanswered,
  resolved,
  manual = false,
  host,
  paletteStatus = 'idle',
  onReread,
  rereading = false,
}: DraftSheetProps) {
  const [editing, setEditing] = useState<DraftFieldId | null>(null)
  const bandGroups = groupsForColumn('band')

  function renderGroup(group: DraftGroup) {
    return (
      <section
        key={group.id}
        className={
          group.column === 'band' ? 'border-t border-line px-6 pb-5 pt-4' : 'px-6 pb-3 pt-4'
        }
      >
        <h2 className="mb-1 text-label font-semibold uppercase text-text2">{group.name}</h2>
        {rowsForGroup(group.id).map((spec) => renderRow(spec, group))}
      </section>
    )
  }

  function renderRow(spec: DraftRowSpec, group: DraftGroup) {
    const asking = unanswered.includes(spec.id) && !resolved.includes(spec.id)
    // A picker is its own read view, so it is always open and owns the full column.
    const alwaysOpen = spec.kind === 'style' || spec.kind === 'mix'
    // An ask owns the full width too. Left in the label/value grid, its question and its editor
    // became two flex items sharing one 1fr column — which crushed the platform chips and account
    // rows into a stack one word wide.
    const open = manual || alwaysOpen || asking || editing === spec.id

    return (
      <DraftRow
        key={spec.id}
        fieldId={spec.id}
        // The band heading already names its single row.
        label={group.column === 'band' ? '' : spec.label}
        tone={asking ? 'asking' : resolved.includes(spec.id) ? 'resolved' : 'default'}
        provenance={
          resolved.includes(spec.id)
            ? { source: 'your call', confidence: 'high' }
            : spec.kind === 'palette'
              ? paletteProvenance(paletteStatus)
              : provenance[spec.id]
        }
        block={open}
        editing={editing === spec.id}
        onToggleEdit={
          manual || alwaysOpen || asking
            ? undefined
            : () => setEditing((current) => (current === spec.id ? null : spec.id))
        }
      >
        {asking ? (
          <>
            {spec.question && (
              <p className="mb-2 text-caption leading-normal text-text2">{spec.question}</p>
            )}
            <DraftFieldEdit
              spec={spec}
              draft={draft}
              onChange={onChange}
              paletteStatus={paletteStatus}
            />
          </>
        ) : open ? (
          <DraftFieldEdit
            spec={spec}
            draft={draft}
            onChange={onChange}
            paletteStatus={paletteStatus}
          />
        ) : (
          <DraftFieldRead spec={spec} draft={draft} paletteStatus={paletteStatus} />
        )}
      </DraftRow>
    )
  }

  return (
    <div className="overflow-hidden rounded-card border border-ink/[0.05] bg-surface">
      {/* The identity band, and this view's one New Growth answer. Legal as a ground and never as
          ink: every passenger on it is dark. Ink Secondary on the sub-line, not Tertiary — 3.80:1
          on lime fails, 4.70:1 clears. */}
      <div className="flex items-center gap-4 bg-accent px-6 py-5">
        <Avatar name={draft.name || 'New client'} size="lg" className="flex-none" />
        <div className="min-w-0 flex-1">
          {/* Headline, not Prompt: Prompt wants a surface with nothing competing, and a twelve-row
              form competes. The sans also means a Cyrillic name and a Latin one land the same. */}
          <h1 className="truncate text-headline font-semibold text-ink">
            {draft.name || 'New client'}
          </h1>
          <p className="mt-1 text-caption text-text2">
            {manual ? (
              'Nothing to read — fill this in yourself.'
            ) : (
              <>
                Read <b className="font-medium text-forest-deep">{host}</b> ·{' '}
                {unanswered.filter((id) => !resolved.includes(id)).length > 0 ? (
                  <>
                    <b className="font-medium text-forest-deep">
                      {unanswered.filter((id) => !resolved.includes(id)).length}
                    </b>{' '}
                    need your call
                  </>
                ) : (
                  'all checked'
                )}
              </>
            )}
          </p>
        </div>
        {onReread && !manual && (
          // White on lime separates by 1.35:1 and its usual Hairline Strong edge by 1.02:1, so
          // this control needs a Pine Deep edge to have a silhouette at all.
          <Button
            variant="secondary"
            size="sm"
            onClick={onReread}
            loading={rereading}
            className="flex-none border-forest-deep text-forest-deep hover:bg-forest-deep hover:text-accent"
          >
            Read it again
          </Button>
        )}
      </div>

      <div
        className={cn(
          'grid grid-cols-1 lg:grid-cols-2',
          'lg:[&>div+div]:border-l lg:[&>div+div]:border-line'
        )}
      >
        <div>{groupsForColumn('left').map(renderGroup)}</div>
        <div className="border-t border-line lg:border-t-0">
          {groupsForColumn('right').map(renderGroup)}
        </div>
      </div>

      {bandGroups.map(renderGroup)}
    </div>
  )
}
