import { AlertTriangle, MessageCircle, Pencil } from 'lucide-react'
import { ActionLink } from '@/components/ui/action-link'
import { formatRelativeTime, parseTimestamp, truncateText, formatScheduleDate } from '@/utils/format'
import { extractFlaggedSlide } from '@/utils/extract-flagged-slides'
import type { DashboardChangeRequest } from '@/types/api'

const PLATFORM_LABELS: Record<string, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  linkedin: 'LinkedIn',
  tiktok: 'TikTok',
}

/** Build post type label — "Carousel · N slides" or "Single image". */
function buildPostTypeLabel(postType: string, slideCount: number): string {
  if (postType === 'carousel') return `Carousel · ${slideCount} slides`
  return 'Single image'
}

/** Header row: client name · Post #N · scheduled date + badges + time. */
function CardHeader({ cr }: { cr: DashboardChangeRequest }) {
  const platform = cr.platform ?? 'instagram'
  const slideCount = cr.slidesJson?.length ?? 0
  const scheduledLabel = cr.scheduledAt ? formatScheduleDate(parseTimestamp(cr.scheduledAt)) : ''
  const timeAgo = cr.respondedAt ? formatRelativeTime(parseTimestamp(cr.respondedAt)) : ''

  return (
    <div className="mb-2 flex flex-wrap items-center gap-1.5">
      <span className="text-body font-semibold text-ink">{cr.clientName}</span>
      <span className="text-caption-lg text-text3">· Post #{cr.postNumber}</span>
      {scheduledLabel && <span className="text-caption-lg text-text3">· {scheduledLabel}</span>}

      <span className="ml-1 rounded-xs bg-wash px-2 py-0.5 text-micro font-medium text-forest">
        {PLATFORM_LABELS[platform] ?? platform}
      </span>
      <span className="rounded-xs bg-sunken px-2 py-0.5 text-micro font-medium text-text2">
        {buildPostTypeLabel(cr.postType, slideCount)}
      </span>

      {timeAgo && <span className="ml-auto shrink-0 text-micro text-text3">{timeAgo}</span>}
    </div>
  )
}

/** Feedback quote block with speech bubble icon. */
function FeedbackQuote({ note }: { note: string }) {
  return (
    <div className="mt-2 flex gap-2 rounded-sm border border-marker bg-marker/40 px-3 py-2.5">
      <MessageCircle size={14} className="mt-0.5 shrink-0 text-text2" />
      <p className="text-body italic leading-[1.5] text-ink">&ldquo;{note}&rdquo;</p>
    </div>
  )
}

/** Single change request card for the dashboard section. */
export function ChangeRequestCard({ changeRequest: cr }: { changeRequest: DashboardChangeRequest }) {
  const flaggedSlide = extractFlaggedSlide(cr.clientNote)

  return (
    <div className="rounded-panel border border-ink/[0.05] bg-surface px-4 py-3.5">
      <CardHeader cr={cr} />

      {cr.caption && (
        <p className="mb-1 text-body leading-[1.45] text-ink">{truncateText(cr.caption, 120)}</p>
      )}

      {cr.clientNote && <FeedbackQuote note={cr.clientNote} />}

      <div className="mt-2.5 flex items-center justify-between">
        <ActionLink href={`/calendar?editPost=${cr.id}`} size="sm">
          <Pencil size={12} />
          Edit post
        </ActionLink>

        {flaggedSlide && (
          <span className="inline-flex items-center gap-1 rounded-xs bg-pending-bg px-2.5 py-1 text-micro font-medium text-pending">
            <AlertTriangle size={11} />
            Slide {flaggedSlide} flagged
          </span>
        )}
      </div>
    </div>
  )
}
