import { cn } from '@/utils/cn'
import { FOCUS_RING } from './form/control-classes'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
}

const VARIANT_CLASSES: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'bg-forest text-white hover:bg-forest-deep hover:-translate-y-px hover:shadow-pop',
  secondary: 'border border-line2 text-ink hover:border-forest hover:bg-wash hover:text-forest',
  ghost: 'text-forest hover:bg-wash',
  danger: 'border border-danger-line text-danger hover:border-danger hover:bg-danger-bg',
}

/**
 * Sizes mirror components/ui/action-link.tsx — see its header. `md` was 14px,
 * which was never a role on any version of the ramp; `lg` had no clean target
 * until the ramp gained a 15px Title step.
 */
const SIZE_CLASSES: Record<NonNullable<ButtonProps['size']>, string> = {
  sm: 'px-3.5 py-2 text-caption rounded-sm',
  md: 'px-5 py-3 text-body rounded-sm',
  lg: 'px-6 py-3.5 text-title rounded-md',
}

/**
 * A button's look, without a button.
 *
 * For the cases that must be a real `<a>` — an outbound link belongs in the tab strip, wants
 * middle-click and cmd-click, and is not a button pretending. Exported so those keep ONE set of
 * classes with `Button` rather than a copy that drifts.
 */
export function buttonClasses({
  variant = 'primary',
  size = 'md',
  className,
}: Pick<ButtonProps, 'variant' | 'size' | 'className'> = {}): string {
  return cn(
    // leading-none deliberately overrides the size token's paired line-height: a button
    // centres its label against its own padding, so inherited leading would just add slack
    // inside a fixed height.
    'inline-flex items-center justify-center gap-2 whitespace-nowrap font-sans font-medium leading-none',
    'transition-[background-color,border-color,color,transform,box-shadow] duration-150 ease-contour',
    FOCUS_RING,
    'active:translate-y-0 active:scale-[0.98] active:shadow-none',
    'disabled:pointer-events-none disabled:opacity-50',
    VARIANT_CLASSES[variant],
    SIZE_CLASSES[size],
    className
  )
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={buttonClasses({ variant, size, className })}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <svg
          className="size-3.5 animate-spin"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
      )}
      {children}
    </button>
  )
}
