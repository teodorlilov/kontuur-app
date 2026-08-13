import { cn } from '@/utils/cn'
import { Reveal } from './reveal'

/**
 * Wrap widths. Arbitrary values because the system has no width scale — the app
 * shell's one constant (`PAGE_SHELL`, 1280) is for a page beside a sidebar, and
 * a full-bleed marketing band is a different measure. Three, no more:
 * `default` for prose-led sections, `wide` for the framed compositions,
 * `split` for the two-column bands.
 */
const WRAP = {
  default: 'max-w-[1140px]',
  wide: 'max-w-[1320px]',
  split: 'max-w-[1280px]',
} as const

type Wrap = keyof typeof WRAP

/**
 * The serif-italic accent inside a marketing heading.
 *
 * These strings are hard-coded English, never interpolated user data, so the
 * Latin-Only Serif Rule's `hasCyrillic()` gate does not apply — but that is why
 * an `<em>` here must stay authored copy and never take a client's name.
 */
const HEAD_EM = '[&_em]:font-display [&_em]:font-normal [&_em]:italic [&_em]:text-forest'

interface EyebrowProps {
  children: React.ReactNode
  className?: string
}

/** The micro-caps label above a section heading, with its spring rule. */
function Eyebrow({ children, className }: EyebrowProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2.5 text-label uppercase text-text2',
        'before:h-0.5 before:w-3.5 before:rounded-full before:bg-spring before:content-[""]',
        className
      )}
    >
      {children}
    </span>
  )
}

interface SectionHeadProps {
  eyebrow: string
  title: React.ReactNode
  note?: React.ReactNode
  align?: 'left' | 'center'
  className?: string
}

/**
 * Eyebrow, fluid heading and a lead note.
 *
 * Not `components/ui/section-heading.tsx` — that is the app shell's `h2` with an
 * icon chip, sized on the ramp. A marketing head is a different object: a
 * clamped display heading that has to hold 375px and 1440px, which the Fluid
 * Hero Exception exists for.
 */
export function SectionHead({ eyebrow, title, note, align = 'left', className }: SectionHeadProps) {
  const centered = align === 'center'

  return (
    <div className={cn(centered && 'mx-auto max-w-[760px] text-center', className)}>
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2
        // Fluid Hero Exception — a section heading is a clamp, not a ramp step.
        style={{ fontSize: 'clamp(28px, 3vw, 40px)' }}
        // leading/tracking: off-ramp sizes carry no role line-height, so the
        // heading has to state its own.
        className={cn('mt-3.5 font-semibold leading-[1.15] tracking-[-0.02em] text-ink', HEAD_EM)}
      >
        {title}
      </h2>
      {note && (
        <p className={cn('mt-3 max-w-[58ch] text-lead text-text2', centered && 'mx-auto')}>
          {note}
        </p>
      )}
    </div>
  )
}

interface SectionProps {
  id?: string
  wrap?: Wrap
  children: React.ReactNode
  className?: string
}

/** A landing band: full-bleed section, centred wrap, standard vertical rhythm. */
export function Section({ id, wrap = 'default', children, className }: SectionProps) {
  return (
    <section id={id} className={cn('relative py-20 md:py-24', className)}>
      <div className={cn('mkt-pad mx-auto w-full', WRAP[wrap])}>{children}</div>
    </section>
  )
}

interface SplitBandProps {
  id?: string
  eyebrow: string
  title: React.ReactNode
  note: React.ReactNode
  /** Extra content under the note — pain rows, punchlines. */
  aside?: React.ReactNode
  /** The demo panel. */
  visual: React.ReactNode
  /** Put the visual in the first column on wide screens. */
  visualFirst?: boolean
  className?: string
}

/**
 * A two-column band: copy on one side, one large flat demo panel on the other.
 *
 * Below 980px it stacks, and the visual always lands *after* the copy no matter
 * which column it occupies on desktop — a reader on a phone should meet the
 * claim before its illustration.
 */
export function SplitBand({
  id,
  eyebrow,
  title,
  note,
  aside,
  visual,
  visualFirst = false,
  className,
}: SplitBandProps) {
  return (
    <section id={id} className={cn('relative py-20 md:py-24', className)}>
      <div
        className={cn(
          'mkt-pad mx-auto grid w-full items-center gap-11 lg:grid-cols-2 lg:gap-[72px]',
          WRAP.split
        )}
      >
        <Reveal className={cn(visualFirst && 'lg:order-2')}>
          <SectionHead eyebrow={eyebrow} title={title} note={note} />
          {aside}
        </Reveal>
        <Reveal delay={120} className={cn('min-w-0', visualFirst && 'lg:order-1')}>
          {visual}
        </Reveal>
      </div>
    </section>
  )
}
