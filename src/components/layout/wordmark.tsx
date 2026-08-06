import Link from 'next/link'
import { cn } from '@/utils/cn'

interface WordmarkProps {
  /** `dark` inverts for Pine Deep grounds — the auth panel and dark rails. */
  tone?: 'light' | 'dark'
  /** Hides the lockup, leaving the mark alone. For collapsed rails. */
  markOnly?: boolean
  /** Omit to render as static text rather than a link home. */
  href?: string
  className?: string
}

/**
 * The Kontuur lockup: a New Growth plate carrying the `k`, beside the name.
 *
 * The plate is the constant lime — exempt from the one-per-band count in
 * DESIGN.md § The Standing Place Rule, and the reason lime reads as Kontuur on
 * routes that have no sidebar to carry it. Forest Ink on lime is 13.65:1.
 *
 * Extracted from the sidebar on its second consumer, per docs/CLAUDE.md.
 */
export function Wordmark({ tone = 'light', markOnly = false, href, className }: WordmarkProps) {
  const body = (
    <>
      <span
        className={cn(
          'grid size-7 shrink-0 place-items-center rounded-lg bg-accent',
          'font-display text-display italic text-ink'
        )}
      >
        k
      </span>
      {!markOnly && (
        <span className="font-display leading-none">
          kontuur
          {/* Deep Pine on light, lime on dark — green as a word on paper is 3.38:1. */}
          <span className={tone === 'dark' ? 'text-accent' : 'text-forest'}>.</span>
        </span>
      )}
    </>
  )

  const shell = cn(
    'flex items-center gap-2.5 text-display no-underline',
    tone === 'dark' ? 'text-ink-inv' : 'text-ink',
    markOnly && 'justify-center',
    className
  )

  if (!href) return <span className={shell}>{body}</span>

  return (
    <Link href={href} className={shell}>
      {body}
    </Link>
  )
}
