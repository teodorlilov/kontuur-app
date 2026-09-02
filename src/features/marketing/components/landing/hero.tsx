'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { ContourField } from '@/components/layout/contour-field'
import { Button } from '@/components/ui/button'
import { useAuthDialog } from '@/features/auth/components/auth-dialog-provider'
import { cn } from '@/utils/cn'
import { usePrefersReducedMotion } from '../../hooks/use-prefers-reduced-motion'
import { PostWall } from './post-wall'

/** Long enough that the fonts have swapped and the first line is not re-laid out mid-rise. */
const SETTLE_MS = 280
/** If fonts or the observer never resolve, the hero still arrives. */
const FALLBACK_MS = 4500

/**
 * Runs the entrance once the hero is actually on screen.
 *
 * Not on mount: a landing page that plays its entrance while the browser is
 * still painting shows the visitor only the end state, which is how this
 * sequence was lost the first time it was built.
 */
function useHeroEntrance(prefersReducedMotion: boolean) {
  const anchorRef = useRef<HTMLDivElement>(null)
  const [started, setStarted] = useState(false)

  useEffect(() => {
    if (prefersReducedMotion) return

    const element = anchorRef.current
    if (!element) return

    let settle: ReturnType<typeof setTimeout>
    const fallback = setTimeout(() => setStarted(true), FALLBACK_MS)

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return
        observer.disconnect()
        settle = setTimeout(() => setStarted(true), SETTLE_MS)
      },
      { threshold: 0.2 }
    )

    const arm = () => observer.observe(element)
    // `document.fonts.ready` is a promise, so testing it was always true — the check was
    // meant to be feature detection, and the optional chain has to sit on `fonts` to be it.
    if (document.fonts) void document.fonts.ready.then(arm)
    else arm()

    return () => {
      observer.disconnect()
      clearTimeout(settle)
      clearTimeout(fallback)
    }
  }, [prefersReducedMotion])

  return { anchorRef, go: prefersReducedMotion || started }
}

/** One masked line of the headline, rising from its own clipping box. */
function HeadlineLine({
  go,
  delayMs = 0,
  children,
}: {
  go: boolean
  delayMs?: number
  children: React.ReactNode
}) {
  return (
    // The negative margin cancels the padding that stops descenders being
    // clipped by the same overflow that makes the rise possible.
    <span className="-mb-[0.08em] block overflow-hidden pb-[0.08em]">
      <span
        style={delayMs ? { transitionDelay: `${delayMs}ms` } : undefined}
        className={cn(
          'block transition-transform duration-[1300ms] ease-contour motion-reduce:transition-none',
          go ? 'translate-y-0' : 'translate-y-[112%]'
        )}
      >
        {children}
      </span>
    </span>
  )
}

/**
 * Kontuur's own output, floating at the edges of the hero.
 *
 * Only above 1240px — below that the composition has no margins to spare, and a
 * photo crowding the headline is worse than no photo.
 */
function FloatingPost({
  src,
  className,
  style,
}: {
  src: string
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <div
      aria-hidden="true"
      style={style}
      className={cn(
        'ph-bob pointer-events-none absolute z-0 hidden h-[168px] w-[132px] overflow-hidden rounded-panel border-4 border-surface shadow-frame xl:block',
        className
      )}
    >
      <Image src={src} alt="" fill sizes="132px" className="object-cover" />
    </div>
  )
}

export function Hero() {
  const { open } = useAuthDialog()
  const prefersReducedMotion = usePrefersReducedMotion()
  const { anchorRef, go } = useHeroEntrance(prefersReducedMotion)

  return (
    <section className="relative overflow-hidden pb-16 pt-14 md:pt-20">
      <ContourField />

      <span
        aria-hidden="true"
        // Fluid Hero Exception — decorative display type, sized to the viewport.
        style={{ fontSize: 'clamp(130px, 20vw, 280px)' }}
        className="pointer-events-none absolute -left-[3%] bottom-0 z-0 select-none font-display italic leading-none text-transparent [-webkit-text-stroke:1.5px_rgba(22,68,48,0.09)]"
      >
        composed.
      </span>

      <FloatingPost src="/landing/skincare.jpg" style={{ right: '3%', top: 64, rotate: '6deg' }} />
      <FloatingPost
        src="/landing/botanical.jpg"
        className="[animation-delay:-4s] [animation-duration:10s]"
        style={{ right: '9%', bottom: 40, rotate: '-7deg' }}
      />

      <div ref={anchorRef} className="mkt-pad relative z-10 mx-auto w-full max-w-[1280px]">
        {/* The hero's one lime moment. A plate carrying Pine Deep, never a word
            or a line — on paper lime measures 1.35:1 and would simply be absent. */}
        <span
          className={cn(
            'inline-block rounded-full bg-accent px-3 py-1 text-label uppercase text-forest-deep',
            'transition-[opacity,transform] duration-[900ms] ease-contour motion-reduce:transition-none',
            go ? 'translate-y-0 opacity-100' : 'translate-y-3.5 opacity-0'
          )}
        >
          The AI social studio for agencies
        </span>

        <h1
          // Fluid Hero Exception, raised for this composition — see DESIGN.md.
          style={{ fontSize: 'clamp(36px, 7.5vw, 104px)' }}
          // leading/tracking: an off-ramp size carries no role line-height.
          className="mt-6 max-w-[16ch] font-semibold leading-[1.04] tracking-[-0.03em] text-ink [text-wrap:balance]"
        >
          <HeadlineLine go={go}>Beautiful client posts —</HeadlineLine>
          <HeadlineLine go={go} delayMs={180}>
            written, designed &amp;{' '}
            <em
              className={cn(
                'relative isolate whitespace-nowrap font-display font-normal not-italic text-forest',
                "before:absolute before:-left-[0.06em] before:-right-[0.08em] before:bottom-[0.02em] before:-z-10 before:h-[0.44em] before:origin-left before:-skew-x-12 before:bg-marker before:transition-transform before:delay-[1600ms] before:duration-[900ms] before:ease-contour before:content-['']",
                'italic',
                go ? 'before:scale-x-100' : 'before:scale-x-0'
              )}
            >
              published
            </em>
            .
          </HeadlineLine>
        </h1>

        <p
          style={{ transitionDelay: '550ms' }}
          className={cn(
            'mt-6 max-w-[58ch] text-lead text-text2',
            'transition-[opacity,transform] duration-[900ms] ease-contour motion-reduce:transition-none',
            go ? 'translate-y-0 opacity-100' : 'translate-y-3.5 opacity-0'
          )}
        >
          Kontuur writes the copy, composes the visuals in each brand&apos;s identity, gets your
          client&apos;s approval, and publishes on schedule — for every client you manage.
        </p>

        <div
          style={{ transitionDelay: '750ms' }}
          className={cn(
            'mt-9 flex flex-wrap items-center gap-6',
            'transition-[opacity,transform] duration-[900ms] ease-contour motion-reduce:transition-none',
            go ? 'translate-y-0 opacity-100' : 'translate-y-3.5 opacity-0'
          )}
        >
          <Button size="lg" onClick={() => open('signup')}>
            Start free
            <span aria-hidden>→</span>
          </Button>
          <a
            href="#engine"
            className="rounded-xs text-body font-medium text-forest underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-spring"
          >
            See how it works
          </a>
        </div>
      </div>

      <PostWall />
    </section>
  )
}
