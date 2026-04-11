'use client'
import { Sparkles, CheckSquare, BarChart2 } from 'lucide-react'
import { AnimateIn } from './AnimateIn'

const features = [
  {
    icon: Sparkles,
    title: 'AI content generation',
    body: "Generate posts from your client's website and documents. On-brand Instagram content in Bulgarian or English — single images, carousels, and Reels scripts.",
  },
  {
    icon: CheckSquare,
    title: 'Review & approve',
    body: 'Multi-client approval flow. One click to publish. Every post goes into a review queue with source grounding so you can verify what the AI used.',
  },
  {
    icon: BarChart2,
    title: 'Real analytics',
    body: 'Direct from the Instagram API — reach, saves, and engagement. Not estimates. Real numbers for every client account in one dashboard.',
  },
]

export function Features() {
  return (
    <section id="features" style={{ padding: '96px 40px', background: 'var(--color-page)' }}>
      <AnimateIn>
        <p
          style={{
            fontSize: 11,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            color: 'var(--color-brand-accent)',
            fontWeight: 500,
            textAlign: 'center',
            marginBottom: 12,
          }}
        >
          Features
        </p>
        <h2
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(28px, 3vw, 40px)',
            fontWeight: 400,
            letterSpacing: '-0.02em',
            textAlign: 'center',
            marginBottom: 56,
            color: 'var(--color-text-1)',
          }}
        >
          Everything your agency needs
        </h2>
      </AnimateIn>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: 24,
          maxWidth: 1100,
          margin: '0 auto',
        }}
      >
        {features.map((f, i) => (
          <AnimateIn key={f.title} delay={i * 0.08}>
            <div
              style={{
                background: 'var(--color-sunken)',
                borderRadius: 16,
                padding: '28px 28px',
                transition: 'transform 200ms ease, background 200ms ease',
                cursor: 'default',
                height: '100%',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)'
                e.currentTarget.style.background = '#EEECEA'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)'
                e.currentTarget.style.background = 'var(--color-sunken)'
              }}
            >
              <f.icon size={32} color="var(--color-brand-accent)" style={{ marginBottom: 20 }} />
              <h3
                style={{
                  fontSize: 16,
                  fontWeight: 500,
                  marginBottom: 10,
                  color: 'var(--color-text-1)',
                }}
              >
                {f.title}
              </h3>
              <p
                style={{
                  fontSize: 13.5,
                  color: 'var(--color-text-2)',
                  lineHeight: 1.65,
                  margin: 0,
                }}
              >
                {f.body}
              </p>
            </div>
          </AnimateIn>
        ))}
      </div>
    </section>
  )
}
