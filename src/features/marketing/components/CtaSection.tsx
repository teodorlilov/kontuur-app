import Link from 'next/link'
import { AnimateIn } from './AnimateIn'

export function CtaSection() {
  return (
    <section className="mkt-pad border-t border-line bg-sunken py-24 text-center">
      <AnimateIn>
        {/* leading-[1.25] + tracking-[-0.02em]: the fluid closing size is not a ramp
            step, so it brings no metrics of its own. */}
        <h2
          className="mx-auto mb-5 mt-0 max-w-[640px] font-display font-normal leading-[1.25] tracking-[-0.02em] text-ink"
          style={{ fontSize: 'clamp(28px, 3vw, 36px)' }}
        >
          Start managing your clients&apos; Instagram today.
        </h2>
        <p className="mx-auto mb-9 mt-0 max-w-[480px] text-lead text-text2">
          Join agencies using Kontuur to save time, deliver better results, and grow their business.
        </p>
        {/* leading-none: a single-line button label, centred by its own padding. */}
        <Link
          className="inline-flex items-center gap-1.5 rounded-md bg-forest px-7 py-3 text-title font-medium leading-none text-white no-underline"
          href="/dashboard"
        >
          Get started free →
        </Link>
        <p className="mt-3.5 text-body text-text3">No credit card required · 14-day free trial</p>
      </AnimateIn>
    </section>
  )
}
