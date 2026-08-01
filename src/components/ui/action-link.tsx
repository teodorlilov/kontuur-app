import Link from 'next/link'
import { cn } from '@/utils/cn'

/**
 * Tokens deliberately mirror components/ui/button.tsx, because these two sit
 * side by side in page headers — a link that navigates and a button that acts.
 * They must be indistinguishable to the reader, so the values live in step.
 */
const VARIANT_CLASSES = {
  primary: 'bg-forest text-white hover:bg-forest-deep hover:shadow-pop',
  secondary:
    'border border-line2 bg-surface/60 text-ink hover:border-forest hover:bg-surface hover:text-forest',
} as const

/** `md` is the header action; `sm` is the inline one inside a card. */
const SIZE_CLASSES = {
  md: 'h-[35px] gap-2 rounded-sm px-3.5 text-body-lg',
  sm: 'gap-1.5 rounded-sm px-3.5 py-1.5 text-caption-lg',
} as const

interface ActionLinkProps extends Omit<React.ComponentProps<typeof Link>, 'className'> {
  variant?: keyof typeof VARIANT_CLASSES
  size?: keyof typeof SIZE_CLASSES
  className?: string
}

/** A navigation target styled as an action. Use Button when it acts instead. */
export function ActionLink({
  variant = 'primary',
  size = 'md',
  className,
  children,
  ...props
}: ActionLinkProps) {
  return (
    <Link
      className={cn(
        'inline-flex items-center font-medium no-underline',
        'transition-[background-color,border-color,box-shadow,color] duration-150 ease-contour',
        'active:scale-[0.98]',
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className
      )}
      {...props}
    >
      {children}
    </Link>
  )
}
