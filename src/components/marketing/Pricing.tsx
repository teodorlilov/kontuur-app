import Link from 'next/link'
import { Check } from 'lucide-react'
import { AnimateIn } from './AnimateIn'

const starterFeatures = [
  'Up to 3 clients',
  'AI content generation',
  'Review queue',
  'Instagram publishing',
  'Basic analytics',
]

const proFeatures = [
  'Unlimited clients',
  'Everything in Starter',
  'Advanced analytics',
  'Priority support',
  'White-label reports',
]

export function Pricing() {
  return (
    <section
      id="pricing"
      style={{
        padding: '96px 40px',
        background: 'var(--color-page)',
        borderTop: '0.5px solid var(--color-border-1)',
      }}
    >
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
          Pricing
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
          Simple pricing for agencies
        </h2>
      </AnimateIn>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 24,
          maxWidth: 760,
          margin: '0 auto',
        }}
      >
        {/* Starter */}
        <AnimateIn delay={0}>
          <div
            style={{
              background: 'var(--color-surface)',
              borderRadius: 16,
              border: '0.5px solid var(--color-border-1)',
              padding: 32,
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <p
              style={{
                fontSize: 16,
                fontWeight: 500,
                color: 'var(--color-text-1)',
                marginBottom: 8,
              }}
            >
              Starter
            </p>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 4 }}>
              <span
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 40,
                  fontWeight: 400,
                  color: 'var(--color-text-1)',
                  lineHeight: 1,
                }}
              >
                €49
              </span>
            </div>
            <p style={{ fontSize: 14, color: 'var(--color-text-3)', marginBottom: 28 }}>
              per month
            </p>
            <ul
              style={{
                listStyle: 'none',
                padding: 0,
                margin: '0 0 28px',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                flex: 1,
              }}
            >
              {starterFeatures.map((f) => (
                <li
                  key={f}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    fontSize: 13.5,
                    color: 'var(--color-text-2)',
                  }}
                >
                  <Check size={14} color="var(--color-published-fg)" strokeWidth={2.5} />
                  {f}
                </li>
              ))}
            </ul>
            <Link
              href="/dashboard"
              style={{
                display: 'block',
                textAlign: 'center',
                padding: '10px 0',
                background: 'var(--color-brand)',
                color: '#fff',
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 500,
                textDecoration: 'none',
              }}
            >
              Start free trial
            </Link>
          </div>
        </AnimateIn>

        {/* Pro */}
        <AnimateIn delay={0.08}>
          <div
            style={{
              background: 'var(--color-surface)',
              borderRadius: 16,
              border: '1.5px solid var(--color-brand-accent)',
              padding: 32,
              position: 'relative',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <span
              style={{
                position: 'absolute',
                top: -12,
                left: '50%',
                transform: 'translateX(-50%)',
                background: 'var(--color-brand-accent)',
                color: '#fff',
                fontSize: 11,
                fontWeight: 600,
                padding: '4px 12px',
                borderRadius: 20,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                whiteSpace: 'nowrap',
              }}
            >
              Most popular
            </span>
            <p
              style={{
                fontSize: 16,
                fontWeight: 500,
                color: 'var(--color-text-1)',
                marginBottom: 8,
              }}
            >
              Pro
            </p>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 4 }}>
              <span
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 40,
                  fontWeight: 400,
                  color: 'var(--color-text-1)',
                  lineHeight: 1,
                }}
              >
                €99
              </span>
            </div>
            <p style={{ fontSize: 14, color: 'var(--color-text-3)', marginBottom: 28 }}>
              per month
            </p>
            <ul
              style={{
                listStyle: 'none',
                padding: 0,
                margin: '0 0 28px',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                flex: 1,
              }}
            >
              {proFeatures.map((f) => (
                <li
                  key={f}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    fontSize: 13.5,
                    color: 'var(--color-text-2)',
                  }}
                >
                  <Check size={14} color="var(--color-published-fg)" strokeWidth={2.5} />
                  {f}
                </li>
              ))}
            </ul>
            <Link
              href="/dashboard"
              style={{
                display: 'block',
                textAlign: 'center',
                padding: '10px 0',
                background: 'var(--color-brand)',
                color: '#fff',
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 500,
                textDecoration: 'none',
              }}
            >
              Start free trial
            </Link>
          </div>
        </AnimateIn>
      </div>

      <p style={{ textAlign: 'center', marginTop: 24, fontSize: 13, color: 'var(--color-text-3)' }}>
        14-day free trial · No credit card required
      </p>
    </section>
  )
}
