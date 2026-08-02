import Image from 'next/image'
import { AnimateIn } from './AnimateIn'
import dashboardShot from '../../../../public/dashboard.png'

export function DashboardPreview() {
  return (
    <section
      className="mkt-pad"
      style={{
        background: 'var(--forest)',
        paddingTop: 80,
        paddingBottom: 0,
        overflow: 'hidden',
        textAlign: 'center',
      }}
    >
      <AnimateIn>
        <p
          style={{
            fontSize: 11,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            color: 'rgba(255,255,255,0.4)',
            fontWeight: 500,
            marginBottom: 12,
          }}
        >
          The dashboard
        </p>
        <h2
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(28px, 3vw, 40px)',
            fontWeight: 400,
            letterSpacing: '-0.02em',
            color: 'rgba(255,255,255,0.95)',
            marginBottom: 16,
          }}
        >
          Everything in one place
        </h2>
        <p
          style={{
            fontSize: 16,
            color: 'rgba(255,255,255,0.55)',
            maxWidth: 480,
            margin: '0 auto 48px',
            lineHeight: 1.6,
          }}
        >
          One workspace for all your clients. Generate, review, schedule, and analyse Instagram
          content without switching tabs.
        </p>
      </AnimateIn>

      <Image
        src={dashboardShot}
        alt="Kontuur dashboard"
        sizes="(max-width: 1200px) 100vw, 1200px"
        style={{
          borderRadius: '16px 16px 0 0',
          border: '1px solid rgba(255,255,255,0.12)',
          width: '100%',
          height: 'auto',
          maxWidth: 1200,
          margin: '0 auto',
          display: 'block',
        }}
      />
    </section>
  )
}
