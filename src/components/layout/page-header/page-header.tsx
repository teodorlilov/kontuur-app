import { Fragment, type ReactNode } from 'react'
import Link from 'next/link'
import { CrumbTrail, type CrumbItem } from '@/components/layout/page-header/crumb-trail'
import { RailTools } from '@/components/layout/page-header/rail-tools'
import { StickyShell } from '@/components/layout/page-header/sticky-shell'
import { PAGE_SHELL } from '@/components/layout/page-header/shared'
import { StatusPill } from '@/components/ui/status-pill'
import { cn } from '@/utils/cn'

interface PageHeaderProps {
  /** Tail only — CrumbTrail prepends the agency. Omit to drop the rail entirely. */
  crumb?: CrumbItem[]
  /** Page-specific status or secondary actions, left of the workspace utilities. */
  railTools?: ReactNode
  /** Renders the back button. Detail routes only. */
  back?: string
  /** Initials for the 42px mark. Detail routes only. */
  badge?: string
  eyebrow?: string
  /**
   * ReactNode, not string — the dashboard wraps the agency name in an <em> with
   * a Cyrillic-aware face swap, and that has to survive being passed in.
   */
  title: ReactNode
  /** The quiet figure beside the title: how many things this page is listing. */
  count?: number
  meta?: ReactNode
  actions?: ReactNode
  /** A <TabRail>. Its hairline is the boundary between chrome and content. */
  tabs?: ReactNode
}

/**
 * The single header every dashboard page opens with: rail, identity, tab rail.
 *
 * Pages differ only by which optional rows they omit. Deliberately has no
 * 'use client' — five of the seven surfaces render this from the client
 * component that owns their tab state, and the other two stay fully server
 * rendered.
 *
 * Title sizes are the Headline and Title steps of DESIGN.md's type ramp, never
 * off-ramp values.
 */
export function PageHeader({
  crumb,
  railTools,
  back,
  badge,
  eyebrow,
  title,
  count,
  meta,
  actions,
  tabs,
}: PageHeaderProps) {
  return (
    <StickyShell>
      <div className={PAGE_SHELL}>
        {crumb && (
          <div
            className={cn(
              'flex h-11 items-center justify-between gap-5 overflow-hidden',
              'transition-[height,opacity] duration-300 ease-contour motion-reduce:transition-none',
              'group-data-[stuck=true]/head:h-0 group-data-[stuck=true]/head:opacity-0'
            )}
          >
            <CrumbTrail items={crumb} />
            <div className="flex flex-none items-center gap-1.5">
              {railTools}
              <RailTools />
            </div>
          </div>
        )}

        <div
          className={cn(
            'flex flex-col gap-3.5 pb-[18px] pt-1 transition-[padding] duration-300 ease-contour motion-reduce:transition-none',
            'md:flex-row md:items-end md:justify-between md:gap-6',
            'group-data-[stuck=true]/head:py-2.5 md:group-data-[stuck=true]/head:items-center'
          )}
        >
          <div className="flex min-w-0 items-center gap-[13px]">
            {back && (
              <Link
                href={back}
                aria-label="Back"
                className={cn(
                  'grid size-[31px] flex-none place-items-center rounded-sm border border-line2',
                  'bg-surface/60 text-text2 transition-colors duration-150 ease-contour',
                  'hover:border-forest hover:text-forest'
                )}
              >
                <svg width="13" height="13" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6">
                  <path d="M7.5 2.5L4 6l3.5 3.5" />
                </svg>
              </Link>
            )}

            {badge && (
              <span
                aria-hidden="true"
                className={cn(
                  'grid size-[42px] flex-none place-items-center rounded-lg bg-forest-deep',
                  // Lime as the figure on Pine Deep, 10.87:1 — the inverse of the
                  // sidebar plate, and the header's lime on the two detail routes.
                  'text-xs font-bold text-accent transition-[width,height] duration-300 ease-contour motion-reduce:transition-none',
                  // Floating chrome, not a clearing — the one place a mark this
                  // small still earns a shadow.
                  'shadow-[0_6px_16px_-6px_rgba(15,21,18,0.4)]',
                  'group-data-[stuck=true]/head:size-[29px] group-data-[stuck=true]/head:text-label-lg'
                )}
              >
                {badge}
              </span>
            )}

            <div className="flex min-w-0 flex-col gap-[5px]">
              {eyebrow && (
                <div
                  className={cn(
                    'max-h-5 overflow-hidden text-label-lg font-semibold uppercase tracking-[0.16em] text-text3',
                    'transition-[max-height,opacity] duration-300 ease-contour motion-reduce:transition-none',
                    'group-data-[stuck=true]/head:max-h-0 group-data-[stuck=true]/head:opacity-0'
                  )}
                >
                  {eyebrow}
                </div>
              )}

              <h1
                className={cn(
                  'flex min-w-0 items-center gap-[11px] truncate text-headline font-semibold leading-tight',
                  'tracking-[-0.02em] text-ink transition-[font-size] duration-300 ease-contour motion-reduce:transition-none',
                  'group-data-[stuck=true]/head:text-title'
                )}
              >
                {title}
                {count !== undefined && (
                  <span className="text-[0.55em] font-medium tabular-nums tracking-normal text-text3">
                    {count}
                  </span>
                )}
              </h1>

              {meta && (
                <div
                  className={cn(
                    'max-h-6 overflow-hidden transition-[max-height,opacity] duration-300 ease-contour motion-reduce:transition-none',
                    'group-data-[stuck=true]/head:max-h-0 group-data-[stuck=true]/head:opacity-0'
                  )}
                >
                  {meta}
                </div>
              )}
            </div>
          </div>

          {actions && (
            <div className="flex flex-none flex-wrap items-center gap-2.5">{actions}</div>
          )}
        </div>

        {tabs}
      </div>
    </StickyShell>
  )
}

/**
 * The sub-line under the title. Takes parts rather than children so pages can
 * drop a clause conditionally without hand-writing separators — and so a page
 * with nothing true to say renders nothing at all.
 */
export function HeaderMeta({ parts }: { parts: Array<ReactNode | null | false> }) {
  const visible = parts.filter(Boolean)
  if (visible.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-[9px] text-body text-text2">
      {visible.map((part, index) => (
        <Fragment key={index}>
          {index > 0 && (
            <span aria-hidden="true" className="text-line2">
              ·
            </span>
          )}
          {part}
        </Fragment>
      ))}
    </div>
  )
}

/**
 * The one clause in the meta line that needs you — the header band's lime.
 *
 * Delegates to StatusPill rather than carrying its own colour: `mark` is already
 * lime-with-Pine-Deep, and two copies of that pairing would drift. It replaced a
 * 7px lime square, which measured 1.35:1 on paper and was not visible at all.
 */
export function MetaFlag({ children }: { children: ReactNode }) {
  return <StatusPill tone="mark">{children}</StatusPill>
}

/** A clause reporting something already wrong, rather than something waiting. */
export function MetaWarn({ children }: { children: ReactNode }) {
  return <span className="font-medium text-danger">{children}</span>
}

