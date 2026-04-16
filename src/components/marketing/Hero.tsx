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
    <section
      className="mkt-pad"
      style={{
        paddingTop: 96,
        paddingBottom: 0,
        textAlign: 'center',
        background: 'var(--color-page)',
        overflow: 'hidden',
      }}
    >
      <motion.p
        {...fadeUp(0)}
        style={{
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          color: 'var(--color-brand-accent)',
          fontWeight: 500,
          marginBottom: 20,
        }}
      >
        Built for marketing agencies
      </motion.p>

      <motion.h1
        {...fadeUp(0.06)}
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'clamp(40px, 5vw, 64px)',
          fontWeight: 400,
          letterSpacing: '-0.03em',
          lineHeight: 1.1,
          color: 'var(--color-text-1)',
          maxWidth: 700,
          margin: '0 auto 24px',
        }}
      >
        AI-powered social media
        <br />
        for serious agencies.
      </motion.h1>

      <motion.p
        {...fadeUp(0.12)}
        style={{
          fontSize: 18,
          color: 'var(--color-text-2)',
          maxWidth: 480,
          margin: '0 auto 40px',
          lineHeight: 1.6,
        }}
      >
        Generate, review, schedule and analyse Instagram content for all your clients — from one
        place.
      </motion.p>

      <motion.div
        {...fadeUp(0.18)}
        style={{
          display: 'flex',
          gap: 12,
          justifyContent: 'center',
          flexWrap: 'wrap',
          marginBottom: 72,
        }}
      >
        <Link
          href="/dashboard"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '12px 24px',
            background: 'var(--color-brand)',
            color: '#fff',
            borderRadius: 10,
            fontSize: 15,
            fontWeight: 500,
            textDecoration: 'none',
            lineHeight: 1,
            transition: 'background 150ms ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--color-brand-hover)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'var(--color-brand)'
          }}
        >
          Get started free →
        </Link>
        <a
          href="#how-it-works"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '12px 24px',
            background: 'transparent',
            color: 'var(--color-text-1)',
            border: '0.5px solid var(--color-border-2)',
            borderRadius: 10,
            fontSize: 15,
            fontWeight: 500,
            textDecoration: 'none',
            lineHeight: 1,
            transition: 'background 150ms ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--color-overlay)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent'
          }}
        >
          See how it works
        </a>
      </motion.div>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <motion.img
        src="/dashboard.png"
        alt="Kontuur dashboard"
        initial={{ opacity: 0, y: 32, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
        style={{
          maxWidth: 1100,
          width: '100%',
          margin: '0 auto',
          borderRadius: '16px 16px 0 0',
          border: '0.5px solid var(--color-border-1)',
          borderBottom: 'none',
          boxShadow: '0 -8px 48px rgba(26,25,24,0.08)',
          display: 'block',
        }}
      />
    </section>
  )
}
