'use client'
import Link from 'next/link'
import { motion } from 'framer-motion'

const fadeUp = (delay: number) => ({
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5, delay, ease: [0.16, 1, 0.3, 1] as const },
})

export function Hero() {
  return (
    <section className="mkt-pad overflow-hidden bg-paper pb-0 pt-24 text-center">
      {/* tracking-[0.1em]: an all-caps eyebrow needs air between letters; the
          Micro role is tuned for mixed-case UI labels and carries none. */}
      <motion.p
        className="mb-5 text-micro font-medium uppercase tracking-[0.1em] text-spring"
        {...fadeUp(0)}
      >
        Built for marketing agencies
      </motion.p>

      {/* leading-[1.1] + tracking-[-0.03em]: the fluid hero size is not a ramp
          step, so it brings no metrics of its own — both are set here. */}
      <motion.h1
        {...fadeUp(0.06)}
        className="mx-auto mb-6 mt-0 max-w-[700px] font-display font-normal leading-[1.1] tracking-[-0.03em] text-ink"
        style={{ fontSize: 'clamp(36px, 5vw, 64px)' }}
      >
        AI-powered social media
        <br />
        for serious agencies.
      </motion.h1>

      {/* leading-[1.6]: a centred two-line standfirst; the Display role's 1.35
          is set for headings and packs these lines too tight. */}
      <motion.p
        className="mx-auto mb-10 mt-0 max-w-[480px] text-display leading-[1.6] text-text2"
        {...fadeUp(0.12)}
      >
        Generate, review, schedule and analyse Instagram content for all your clients — from one
        place.
      </motion.p>

      <motion.div className="mb-18 flex flex-wrap justify-center gap-3" {...fadeUp(0.18)}>
        {/* leading-none: a single-line button label, centred by its own padding. */}
        <Link
          className="inline-flex items-center gap-1.5 rounded-md bg-forest px-6 py-3 text-title font-medium leading-none text-white no-underline transition-[background] duration-150 ease-[ease] hover:bg-forest-deep"
          href="/dashboard"
        >
          Get started free →
        </Link>
        {/* leading-none: matches the primary button so both caps sit at one height. */}
        <a
          className="inline-flex items-center rounded-md border border-line2 bg-transparent px-6 py-3 text-title font-medium leading-none text-ink no-underline transition-[background] duration-150 ease-[ease] hover:bg-ink/[0.04]"
          href="#how-it-works"
        >
          See how it works
        </a>
      </motion.div>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <motion.img
        src="/dashboard.png"
        alt="Kontuur dashboard"
        className="mx-auto my-0 block w-full max-w-[1100px] rounded-t-[16px] border border-b-0 border-line shadow-[0_-8px_48px_rgba(26,25,24,0.08)]"
        initial={{ opacity: 0, y: 32, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
      />
    </section>
  )
}
