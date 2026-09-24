import Link from 'next/link'
import {
  ChartIcon,
  CheckCircleIcon,
  StarsIcon,
  UserPlusRoundedIcon,
} from '@solar-icons/react/line-duotone'
import type { Icon as Glyph } from '@solar-icons/react/lib/types'
import { Icon } from '@/components/ui/icon'
import { IconChip } from '@/components/ui/icon-chip'
import { cn } from '@/utils/cn'

const CARD_CLASS =
  'flex items-center gap-3 rounded-panel border border-ink/[0.05] bg-surface px-3.5 py-3.5 no-underline transition-[transform,border-color] duration-150 ease-contour'
// No hover shadow: resting and hover elevation make the same claim, and this ground replaces
// elevation with interrupted terrain. The lift and the border carry the affordance instead.
const CARD_HOVER = 'hover:-translate-y-0.5 hover:border-sage'

interface QuickAction {
  href: string
  icon: Glyph
  title: string
  subtitle: string
  /** Why this one leads nowhere useful right now; it then states the reason instead of its own hint. */
  refusal?: string | null
}

interface QuickActionsStripProps {
  pendingCount: number
  isSolo: boolean
  /** Why this workspace cannot generate right now, or null. */
  generateRefusal: string | null
}

/**
 * The routes worth one click from the dashboard; a solo workspace drops "Add client".
 *
 * A card the plan would refuse is not a link: it keeps its place and says why, rather than
 * spending a click to arrive at a wizard that can only refuse.
 */
export function QuickActionsStrip({
  pendingCount,
  isSolo,
  generateRefusal,
}: QuickActionsStripProps) {
  const actions: Array<QuickAction | false> = [
    {
      href: '/generate',
      icon: StarsIcon,
      title: isSolo ? 'Create content' : 'Generate posts',
      subtitle: generateRefusal ?? (isSolo ? 'Pick a platform' : 'Pick client + platform'),
      refusal: generateRefusal,
    },
    !isSolo && {
      href: '/clients/new',
      icon: UserPlusRoundedIcon,
      title: 'Add client',
      subtitle: 'Start onboarding',
    },
    {
      href: '/review',
      icon: CheckCircleIcon,
      title: isSolo ? 'My drafts' : 'Review queue',
      subtitle:
        pendingCount === 0
          ? 'Nothing waiting'
          : `${pendingCount} ${pendingCount === 1 ? 'post' : 'posts'} waiting`,
    },
    {
      href: '/analytics',
      icon: ChartIcon,
      title: isSolo ? 'My results' : 'Analytics',
      subtitle: 'View performance',
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 @2xl:grid-cols-4">
      {actions
        .filter((action): action is QuickAction => action !== false)
        .map((action) => {
          const face = (
            <>
              <IconChip className="size-[34px] shrink-0 rounded-sm">
                <Icon glyph={action.icon} size="lg" />
              </IconChip>
              <span className="min-w-0">
                <span className="block truncate text-body font-semibold text-ink">
                  {action.title}
                </span>
                <span className="block truncate text-caption text-text3" title={action.subtitle}>
                  {action.subtitle}
                </span>
              </span>
            </>
          )
          // One card, two states: the refused one keeps its place and its words and simply does
          // not lead anywhere, so the strip does not reflow around a missing tile.
          return action.refusal ? (
            <div
              key={action.href}
              aria-disabled
              className={cn(CARD_CLASS, 'cursor-not-allowed opacity-60')}
            >
              {face}
            </div>
          ) : (
            <Link key={action.href} href={action.href} className={cn(CARD_CLASS, CARD_HOVER)}>
              {face}
            </Link>
          )
        })}
    </div>
  )
}
