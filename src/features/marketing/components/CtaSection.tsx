import Link from 'next/link'
import { AnimateIn } from './AnimateIn'

export function CtaSection() {
  return (
    <section
      className="mkt-pad"
      style={{
        background: 'var(--sunken)',
        paddingTop: 96,
        paddingBottom: 96,
        textAlign: 'center',
        borderTop: '1px solid var(--line)',
      }}
    >
      <AnimateIn>
        <h2
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(26px, 3vw, 36px)',
            fontWeight: 400,
            letterSpacing: '-0.02em',
            color: 'var(--ink)',
            maxWidth: 640,
            margin: '0 auto 20px',
            lineHeight: 1.25,
          }}
        >
          Start managing your clients&apos; Instagram today.
        </h2>
        <p
          className="text-lead"
          style={{
            color: 'var(--text2)',
            maxWidth: 480,
            margin: '0 auto 36px',
            lineHeight: 1.6,
          }}
        >
          Join agencies using Kontuur to save time, deliver better results, and grow their business.
        </p>
        <Link
          className="text-title"
          href="/dashboard"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '12px 28px',
            background: 'var(--forest)',
            color: '#fff',
            borderRadius: 10,
            fontWeight: 500,
            textDecoration: 'none',
            lineHeight: 1,
          }}
        >
          Get started free →
        </Link>
        <p className="text-body" style={{ color: 'var(--text3)', marginTop: 14 }}>
          No credit card required · 14-day free trial
        </p>
      </AnimateIn>
    </section>
  )
}
