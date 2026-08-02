import Link from 'next/link'
import { BarChart2, CircleCheck, Sparkles, UserPlus, type LucideIcon } from 'lucide-react'
import { IconChip } from '@/components/ui/icon-chip'

interface QuickAction {
  href: string
  icon: LucideIcon
  title: string
  subtitle: string
}

interface QuickActionsStripProps {
  pendingCount: number
  isSolo: boolean
}

/** The routes worth one click from the dashboard; a solo workspace drops "Add client". */
export function QuickActionsStrip({ pendingCount, isSolo }: QuickActionsStripProps) {
  const actions: Array<QuickAction | false> = [
    {
      href: '/generate',
      icon: Sparkles,
      title: isSolo ? 'Create content' : 'Generate posts',
      subtitle: isSolo ? 'Pick a platform' : 'Pick client + platform',
    },
    !isSolo && {
      href: '/clients/new',
      icon: UserPlus,
      title: 'Add client',
      subtitle: 'Start onboarding',
    },
    {
      href: '/review',
      icon: CircleCheck,
      title: isSolo ? 'My drafts' : 'Review queue',
      subtitle:
        pendingCount === 0
          ? 'Nothing waiting'
          : `${pendingCount} ${pendingCount === 1 ? 'post' : 'posts'} waiting`,
    },
    {
      href: '/analytics',
      icon: BarChart2,
      title: isSolo ? 'My results' : 'Analytics',
      subtitle: 'View performance',
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 @2xl:grid-cols-4">
      {actions
        .filter((action): action is QuickAction => action !== false)
        .map((action) => {
          const Icon = action.icon
          return (
            <Link
              key={action.href}
              href={action.href}
              // No hover shadow: resting and hover elevation make the same claim,
              // and this ground replaces elevation with interrupted terrain. The
              // lift and the border carry the affordance instead.
              className="flex items-center gap-3 rounded-panel border border-ink/[0.05] bg-surface px-3.5 py-3.5 no-underline transition-[transform,border-color] duration-150 ease-contour hover:-translate-y-0.5 hover:border-sage"
            >
              <IconChip className="size-[34px] shrink-0 rounded-sm">
                <Icon size={15} />
              </IconChip>
              <span className="min-w-0">
                <span className="block truncate text-body font-semibold text-ink">
                  {action.title}
                </span>
                <span className="block truncate text-caption text-text3">{action.subtitle}</span>
              </span>
            </Link>
          )
        })}
    </div>
  )
}
