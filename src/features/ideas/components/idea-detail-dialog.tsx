'use client'

import { ActionLink } from '@/components/ui/action-link'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { StatusPill } from '@/components/ui/status-pill'
import { IdeaDueChip } from './idea-due-chip'
import { formatRelativeTime } from '@/utils/format'
import type { ClientIdea } from '@/types/api'

interface IdeaDetailDialogProps {
  /** The open idea, or null when the dialog is closed. */
  idea: ClientIdea | null
  now: Date
  onClose: () => void
  onDismiss: (ideaId: string) => void
  onRestore: (ideaId: string) => void
}

const STATUS_TEXT: Record<string, string> = {
  new: 'In the inbox — not generated yet',
  generating: 'In the inbox — a previous run left this mid-flight',
  generated: 'A post was generated and approved from this',
  dismissed: 'Dismissed without generating',
}

/**
 * The full idea, read-only.
 *
 * It reads and does not edit, deliberately. The pipeline already refines a loose
 * submission — the generate route sends the idea text *and* the notes into topic
 * planning, which returns a proper-grammar theme and matches a source — so an
 * editable copy here would mostly restate that, while overwriting the only record
 * of what the client actually asked for. Where the agency genuinely needs to
 * reinterpret an ambiguous idea, that happens on the brief in the generate wizard,
 * where the change is scoped to one run.
 */
export function IdeaDetailDialog({
  idea,
  now,
  onClose,
  onDismiss,
  onRestore,
}: IdeaDetailDialogProps) {
  return (
    <Modal open={idea !== null} onClose={onClose} title="Client idea" maxWidth={560}>
      {idea && (
        <div className="flex flex-col gap-4">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-text3">
            <span className="font-medium text-text2">{idea.clientName}</span>
            {idea.clientNiche && (
              <>
                <span aria-hidden className="text-line2">
                  &middot;
                </span>
                <span>{idea.clientNiche}</span>
              </>
            )}
            <span aria-hidden className="text-line2">
              &middot;
            </span>
            <span>Submitted {formatRelativeTime(new Date(idea.submittedAt), now)}</span>
          </p>

          {/* Set as a quotation because that is what it is: a record of what was
              asked for, not a field. The rule is Sage rather than a border token —
              it marks provenance, it is not a container edge. */}
          <blockquote className="border-l-2 border-sage pl-3.5 text-body text-ink">
            {idea.ideaText}
          </blockquote>

          {idea.extraNotes && <p className="text-caption text-text2">{idea.extraNotes}</p>}

          <dl className="grid grid-cols-[88px_minmax(0,1fr)] items-center gap-x-3.5 gap-y-2">
            {idea.platform && (
              <>
                <dt className="text-label font-semibold uppercase text-text3">Platform</dt>
                <dd>
                  <StatusPill tone="ok">{idea.platform}</StatusPill>
                </dd>
              </>
            )}
            {idea.targetDate && (
              <>
                <dt className="text-label font-semibold uppercase text-text3">Target</dt>
                <dd>
                  <IdeaDueChip targetDate={idea.targetDate} now={now} />
                </dd>
              </>
            )}
            <dt className="text-label font-semibold uppercase text-text3">Status</dt>
            <dd className="text-body text-ink">{STATUS_TEXT[idea.status] ?? idea.status}</dd>
          </dl>

          <div className="mt-1 flex items-center gap-2">
            {idea.status === 'dismissed' ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  onRestore(idea.id)
                  onClose()
                }}
              >
                Restore
              </Button>
            ) : idea.status !== 'generated' ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  onDismiss(idea.id)
                  onClose()
                }}
              >
                Dismiss
              </Button>
            ) : null}

            <span className="flex-1" />

            <Button variant="secondary" size="sm" onClick={onClose}>
              Close
            </Button>
            {idea.status === 'generated' ? (
              idea.generatedPostId && (
                <ActionLink href={`/calendar?editPost=${idea.generatedPostId}`} size="sm">
                  View post
                  <span aria-hidden>&rarr;</span>
                </ActionLink>
              )
            ) : (
              <ActionLink href={`/generate?ideaId=${idea.id}`} size="sm">
                Generate from this idea
              </ActionLink>
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}
