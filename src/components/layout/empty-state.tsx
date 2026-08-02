import { cn } from '@/utils/cn'

interface EmptyStateProps {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2 px-6 py-12 text-center',
        className
      )}
    >
      {icon && <div className="mb-1 text-line2">{icon}</div>}
      <p className="text-title font-medium text-ink">{title}</p>
      {description && <p className="mb-2 text-body text-text3">{description}</p>}
      {action}
    </div>
  )
}
