import type { ReactNode } from 'react'
import { cn } from '@/utils/cn'

interface FormPanelProps {
  title: string
  description?: string
  /** Context boxes beside the form. Rendered content, never a component that fetches. */
  rail?: ReactNode
  /** A `SaveBar`. Sticks to the foot of the panel. */
  saveBar?: ReactNode
  className?: string
  children: ReactNode
}

/**
 * The card every settings panel lives in: title, form column, optional context rail, save bar.
 *
 * Flat — no gradient and no shadow — per DESIGN.md's Resting Surface Rule. The title here is the
 * panel's, never the page's: the page header above already states that one.
 */
export function FormPanel({
  title,
  description,
  rail,
  saveBar,
  className,
  children,
}: FormPanelProps) {
  return (
    <div className={cn('mb-4 rounded-card border border-ink/[0.05] bg-surface', className)}>
      <div className="px-6 pt-[22px]">
        {/* The `display` role. Safe to leave un-gated by hasCyrillic: panel titles are authored
            English strings, never interpolated client data. */}
        <h3 className="font-display text-display font-normal italic leading-[1.4] text-ink">
          {title}
        </h3>
        {description && <p className="mt-1 text-body text-text3">{description}</p>}
      </div>

      <div className="flex flex-col items-start gap-6 px-6 pb-[22px] pt-6 lg:flex-row lg:gap-[38px]">
        <div className="min-w-0 max-w-[660px] flex-1">{children}</div>
        {rail && <aside className="w-full flex-none lg:sticky lg:top-4 lg:w-[268px]">{rail}</aside>}
      </div>

      {saveBar}
    </div>
  )
}
