import { AnimateIn } from './AnimateIn'

const steps = [
  {
    num: '1',
    title: 'Connect your client Instagram account.',
    desc: "Link your clients' Instagram accounts in seconds using the official Meta API. One-time setup per account.",
  },
  {
    num: '2',
    title: 'Generate AI posts from their website.',
    desc: "Kontuur reads your client's website, documents, and previous posts to generate on-brand content automatically.",
  },
  {
    num: '3',
    title: 'Publish directly to Instagram with one click.',
    desc: 'Review, approve, and schedule. Kontuur handles publishing — single images and carousels — via the official Meta API.',
  },
]

export function HowItWorks() {
  return (
    <section
      id="how-it-works"
      className="mkt-pad"
      style={{
        paddingTop: 96,
        paddingBottom: 96,
        background: 'var(--sunken)',
        borderTop: '1px solid var(--line)',
        borderBottom: '1px solid var(--line)',
      }}
    >
      <AnimateIn>
        <p
          className="text-micro"
          style={{
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            color: 'var(--spring)',
            fontWeight: 500,
            textAlign: 'center',
            marginBottom: 12,
          }}
        >
          How it works
        </p>
        <h2
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(28px, 3vw, 40px)',
            fontWeight: 400,
            letterSpacing: '-0.02em',
            textAlign: 'center',
            marginBottom: 64,
            color: 'var(--ink)',
          }}
        >
          Up and running in minutes
        </h2>
      </AnimateIn>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 40,
          maxWidth: 900,
          margin: '0 auto',
        }}
      >
        {steps.map((step, i) => (
          <AnimateIn key={step.num} delay={i * 0.06}>
            <div style={{ textAlign: 'center' }}>
              <div
                className="text-title"
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  background: 'var(--forest)',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 600,
                  margin: '0 auto 20px',
                  lineHeight: 1,
                }}
              >
                {step.num}
              </div>
              <h3
                className="text-title"
                style={{
                  fontWeight: 500,
                  marginBottom: 10,
                  color: 'var(--ink)',
                  lineHeight: 1.4,
                }}
              >
                {step.title}
              </h3>
              <p
                className="text-body"
                style={{
                  color: 'var(--text2)',
                  lineHeight: 1.65,
                  margin: 0,
                }}
              >
                {step.desc}
              </p>
            </div>
          </AnimateIn>
        ))}
      </div>
    </section>
  )
}
