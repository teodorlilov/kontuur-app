import Link from 'next/link'
import { BarChart2, CircleCheck, Sparkles, UserPlus, type LucideIcon } from 'lucide-react'

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
      {actions.filter((action): action is QuickAction => action !== false).map((action) => {
        const Icon = action.icon
        return (
          <Link
            key={action.href}
            href={action.href}
            className="flex items-center gap-3 rounded-panel border border-ink/[0.05] bg-[image:var(--raised)] px-3.5 py-3.5 no-underline shadow-card transition-[transform,border-color,box-shadow] duration-150 ease-contour hover:-translate-y-0.5 hover:border-sage hover:shadow-pop"
          >
            <span className="grid size-[34px] shrink-0 place-items-center rounded-sm bg-wash text-forest">
              <Icon size={15} />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-semibold text-ink">{action.title}</span>
              <span className="block truncate text-[11.5px] text-text3">{action.subtitle}</span>
            </span>
          </Link>
        )
      })}
    </div>
  )
}
