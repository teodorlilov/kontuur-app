'use client'

import { Button } from '@/components/ui/button'
import { useAuthDialog } from '@/features/auth/components/auth-dialog-provider'
import { Reveal } from './reveal'

/**
 * The last thing on the page, and one of only two places allowed a flourish —
 * the ghost word and the marker sweep live here and in the hero, nowhere in
 * between. Every band between them is a plain grid with one flat panel.
 */
export function ClosingCta() {
  const { open } = useAuthDialog()

  return (
    <section className="relative overflow-hidden border-t border-line py-24 md:py-28">
      <span
        aria-hidden="true"
        // Fluid Hero Exception — decorative display type, sized to the viewport.
        style={{ fontSize: 'clamp(130px, 20vw, 280px)' }}
        className="pointer-events-none absolute -left-[2%] bottom-0 z-0 select-none font-display italic leading-none text-transparent [-webkit-text-stroke:1.5px_rgba(22,68,48,0.09)]"
      >
        quietly.
      </span>

      <Reveal className="mkt-pad relative z-10 mx-auto w-full max-w-[1140px] text-center">
        <p
          // Fluid Hero Exception — a closing statement at hero scale.
          style={{ fontSize: 'clamp(28px, 4vw, 56px)' }}
          // leading/tracking: an off-ramp size carries no role line-height.
          className="mx-auto max-w-[18ch] font-semibold leading-[1.1] tracking-[-0.02em] text-ink"
        >
          Run every feed from one{' '}
          <em className="relative isolate whitespace-nowrap font-display font-normal italic text-forest before:absolute before:-left-[0.06em] before:-right-[0.08em] before:bottom-[0.03em] before:-z-10 before:h-[0.44em] before:-skew-x-12 before:bg-marker before:content-['']">
            quiet place
          </em>
          .
        </p>

        <div className="mt-9 flex justify-center">
          <Button size="lg" onClick={() => open('signup')}>
            Start free
            <span aria-hidden>→</span>
          </Button>
        </div>

        <p className="mt-4 text-caption text-text3">14-day free trial · no card required</p>
      </Reveal>
    </section>
  )
}
