import { cn } from '@/utils/cn'

interface SectionCardProps {
  title: string
  subtitle?: string
  headerAction?: React.ReactNode
  danger?: boolean
  children: React.ReactNode
}

/**
 * A settings panel: a titled section with a divider header.
 *
 * Distinct from components/ui/card.tsx, which is a bare container — this one
 * owns its own header structure, and is what the settings and ideas surfaces
 * are built from. Both are current.
 *
 * globals.css already aliased --color-surface/--color-text-1/--color-muted onto
 * Contour values, so this only had three genuinely off-palette values left: a
 * hardcoded navy border, a 13px radius off the scale, and the danger tints.
 * Those now read from tokens; the props and structure are unchanged.
 */
export function SectionCard({ title, subtitle, headerAction, danger, children }: SectionCardProps) {
  return (
    <div
      className={cn(
        'mb-3.5 overflow-hidden rounded-card border bg-surface',
        danger ? 'border-danger-line' : 'border-ink/[0.05]'
      )}
    >
      <div
        className={cn(
          'flex items-start justify-between gap-3 border-b px-[22px] pb-3.5 pt-[18px]',
          danger ? 'border-danger-line/50 bg-danger-bg/30' : 'border-ink/[0.04]'
        )}
      >
        <div>
          <div className={cn('mb-0.5 text-[13px] font-medium', danger ? 'text-danger' : 'text-ink')}>
            {title}
          </div>
          {subtitle && <div className="text-[11px] leading-normal text-text2">{subtitle}</div>}
        </div>
        {headerAction}
      </div>
      {children}
    </div>
  )
}
