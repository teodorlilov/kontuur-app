import { cn } from '@/utils/cn'

/**
 * Wash is the default; marker marks the section that is asking for something.
 * Both pairs are fixed here so a chip can never be tinted without its icon
 * colour following.
 */
const TONE_CLASSES = {
  wash: 'bg-wash text-forest',
  marker: 'bg-marker text-forest-deep',
} as const

/** An `h2` with its icon chip — the opening line of a dashboard section. */
export function SectionHeading({
  icon,
  tone = 'wash',
  children,
}: {
  icon: React.ReactNode
  tone?: keyof typeof TONE_CLASSES
  children: React.ReactNode
}) {
  return (
    <h2 className="flex items-center gap-2.5 text-title font-semibold text-ink">
      <span
        aria-hidden="true"
        className={cn('grid size-[27px] place-items-center rounded-sm', TONE_CLASSES[tone])}
      >
        {icon}
      </span>
      {children}
    </h2>
  )
}
