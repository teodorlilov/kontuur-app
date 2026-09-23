import type { ComponentProps, ReactNode } from 'react'
import { Icon } from '@/components/ui/icon'
import { cn } from '@/utils/cn'

interface FlowNoticeProps {
  glyph: ComponentProps<typeof Icon>['glyph']
  children: ReactNode
  /** The one thing the reader can do about it — a link or a button, styled by the caller. */
  action: ReactNode
  className?: string
}

/**
 * The flow's notice row: an icon, one sentence, one action, on the amber "pending" wash. The
 * skipped-pillar banner in review and the "drafts waiting" rows on setup are the same shell with
 * different words — a second copy of these classes is how the two would drift apart.
 */
export function FlowNotice({ glyph, children, action, className }: FlowNoticeProps) {
  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-panel bg-pending-bg px-4 py-3 text-caption text-text2',
        className
      )}
    >
      <Icon glyph={glyph} size="sm" className="mt-0.5 flex-none text-pending" />
      <p className="min-w-0 flex-1">{children}</p>
      {action}
    </div>
  )
}

/** The notice's action, as a link or a button: bold amber, underlined, never wrapping. */
export const FLOW_NOTICE_ACTION_CLASS =
  'flex-none whitespace-nowrap font-semibold text-pending underline decoration-pending/35 underline-offset-2'
