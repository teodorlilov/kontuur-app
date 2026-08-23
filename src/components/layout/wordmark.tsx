import Link from 'next/link'
import { cn } from '@/utils/cn'

interface WordmarkProps {
  /** Drops the name, leaving the initial alone. For collapsed rails. */
  markOnly?: boolean
  /** Omit to render as static text rather than a link home. */
  href?: string
  className?: string
}

/**
 * The Kontuur logo: the name in the display serif over a New Growth swipe.
 *
 * There is no icon. A mark beside the name was two things competing to be the
 * logo, and the name set in Instrument Serif italic carries it alone.
 *
 * The lime is a SWIPE, never ink. New Growth measures 1.35:1 on paper, so a lime
 * letter or a lime full stop is unreadable — DESIGN.md § The Fill-Only Lime Rule
 * forbids it by name. Behind the letterforms it is a ground carrying Forest Ink
 * at 13.65:1, which is the one reading of lime the rule allows on a light
 * surface. It is also the constant lime, exempt from the one-per-band count in
 * § The Standing Place Rule.
 *
 * The `tone` prop is gone rather than ported. It offered a Pine Deep variant no
 * call site ever passed — all six render on paper or surface — and the swipe
 * cannot simply invert: white letters on lime are 1.35:1, and ink letters lose
 * their ascenders against the dark ground wherever they overflow the swipe. A
 * dark-surface lockup needs its own drawing, not a colour flag.
 */
export function Wordmark({ markOnly = false, href, className }: WordmarkProps) {
  const body = (
    <span className="relative inline-block">
      {/*
        Percentages, not spacing tokens: the swipe is sized to the glyphs it sits
        behind rather than to the layout scale. It overhangs each end so the
        stroke starts before the letters and ends after them, and covers roughly
        the x-height so ascenders and descenders break out of it. The tilt is
        what separates a highlighter stroke from a filled box.
      */}
      <span
        aria-hidden="true"
        className="absolute inset-x-[-7%] bottom-[6%] h-[54%] -rotate-[1.2deg] rounded-xs bg-accent"
      />
      <span className="relative">
        {markOnly ? 'k' : 'kontuur'}
        {/* Dropped in the collapsed rail: at that size the full stop is a smudge. */}
        {!markOnly && <span className="text-forest">.</span>}
      </span>
    </span>
  )

  // `text-headline` (22px), one step up the closed ramp from the `text-display`
  // (18px) this used to be — the plate that carried the old lockup gave it bulk
  // the bare word does not have, so at 18px it read as a caption. A call site
  // that wants more can pass a larger ramp step in `className`: cn() resolves
  // font-size conflicts through TYPE_RAMP, so the later class wins.
  const shell = cn(
    'inline-flex items-center font-display text-headline italic leading-none text-ink no-underline',
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
