import { cn } from '@/utils/cn'

type BadgeVariant =
  | 'published'
  | 'scheduled'
  | 'pending'
  | 'draft'
  | 'error'
  // Legacy aliases kept for backward compatibility
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'default'
  | 'priority'

interface BadgeProps {
  variant?: BadgeVariant
  dot?: boolean
  children: React.ReactNode
  className?: string
}

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  published: 'bg-wash text-forest',
  scheduled: 'bg-marker text-forest-deep',
  pending: 'bg-pending-bg text-pending',
  draft: 'bg-sunken text-text2',
  error: 'bg-danger-bg text-danger',
  // Legacy
  success: 'bg-wash text-forest',
  warning: 'bg-pending-bg text-pending',
  danger: 'bg-danger-bg text-danger',
  info: 'bg-marker text-forest-deep',
  default: 'bg-sunken text-text2',
  priority: 'bg-danger-bg text-danger',
}

export function Badge({ variant = 'default', dot = false, children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-[3px]',
        'font-sans text-[11px] font-medium tracking-[0.02em]',
        VARIANT_CLASSES[variant],
        className
      )}
    >
      {dot && <span className="size-[5px] shrink-0 rounded-full bg-current" />}
      {children}
    </span>
  )
}
