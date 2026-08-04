'use client'

import { AlertTriangle } from 'lucide-react'
import { cn } from '@/utils/cn'
import { StatusPill } from '@/components/ui/status-pill'
import { formatRelativeTime } from '@/utils/format'
import { AGE_WARN_DAYS, TRIAGE_REASON_LABELS, type TriagedPost } from '@/features/review/lib/triage'

/**
 * The queue's additions to the shared insight panel: the health-client
 * warning, why triage flagged this post, and the cross-client context the
 * wizard never needed (whose post this is and how long it has waited).
 */
export function QueueInsightSections({ triaged }: { triaged: TriagedPost }) {
  const { post, reasons, ageDays } = triaged

  return (
    <>
      {post.is_health_niche && (
        <section className="border-t border-line p-4">
          <div className="flex items-start gap-2 rounded-chip bg-pending-bg p-3">
            <AlertTriangle aria-hidden className="mt-0.5 size-3.5 flex-none text-pending" strokeWidth={1.8} />
            <p className="text-caption leading-relaxed text-pending">
              Medical content — verify all clinical claims before approving. Medical safety
              instructions are added on publish.
            </p>
          </div>
        </section>
      )}

      <section className="border-t border-line p-4">
        <h3 className="text-label font-semibold uppercase text-text2">Post info</h3>
        <div className="mt-3 flex flex-col gap-1.5">
          <InfoRow label="Client" value={post.client_name} />
          <InfoRow
            label="Platform"
            value={[post.platform, post.post_type].filter(Boolean).join(' · ')}
          />
          <InfoRow
            label="Generated"
            value={formatRelativeTime(new Date(post.created_at))}
            warn={ageDays > AGE_WARN_DAYS}
          />
        </div>
        {reasons.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {reasons.map((reason) => (
              <StatusPill key={reason} tone="warn">
                {TRIAGE_REASON_LABELS[reason]}
              </StatusPill>
            ))}
          </div>
        )}
      </section>
    </>
  )
}

function InfoRow({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-caption">
      <span className="text-text3">{label}</span>
      <span className={cn('text-right font-medium', warn ? 'text-pending' : 'text-ink')}>
        {value}
      </span>
    </div>
  )
}
