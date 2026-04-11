import { Sparkles, CheckSquare, Send, BarChart2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { AnimateIn } from './AnimateIn'

interface Feature {
  icon: LucideIcon
  title: string
  body: string
  tags: string[]
  imageAlt: string
  reversed: boolean
}

const features: Feature[] = [
  {
    icon: Sparkles,
    title: 'Generate posts from real content',
    body: "Kontuur reads your client's website, documents, and previous posts to generate on-brand Instagram content in Bulgarian or English. Single images, carousels, and Reels scripts — all with one click.",
    tags: ['AI', 'Content generation'],
    imageAlt: 'Generate posts page',
    reversed: false,
  },
  {
    icon: CheckSquare,
    title: 'Approve, edit, schedule in seconds',
    body: 'Every generated post goes into a review queue. Read the caption, check the source grounding, approve or reject. Schedule directly to Instagram from the same screen.',
    tags: ['Review', 'Approval workflow'],
    imageAlt: 'Review queue',
    reversed: true,
  },
  {
    icon: Send,
    title: 'Publish directly to Instagram',
    body: "Connect your clients' Instagram accounts once. Kontuur handles publishing — single images, carousels, and scheduled posts — using the official Meta API.",
    tags: ['Publishing', 'Scheduling'],
    imageAlt: 'Calendar / scheduling view',
    reversed: false,
  },
  {
    icon: BarChart2,
    title: 'Real data, not estimates',
    body: 'Analytics pulled directly from the Instagram API — reach, saves, engagement rate, follower growth, and post-level performance for every client account.',
    tags: ['Analytics', 'Instagram insights'],
    imageAlt: 'Analytics page',
    reversed: true,
  },
]

export function FeaturesDeepDive() {
  return (
    <section style={{ padding: '80px 40px', background: 'var(--color-page)' }}>
      <div
        style={{
          maxWidth: 1100,
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 80,
        }}
      >
        {features.map((f) => (
          <AnimateIn key={f.title}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 64,
                alignItems: 'center',
              }}
            >
              {/* Text column */}
              <div style={{ order: f.reversed ? 2 : 1 }}>
                <f.icon size={28} color="var(--color-brand-accent)" style={{ marginBottom: 16 }} />
                <h3
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: 'clamp(22px, 2.5vw, 28px)',
                    fontWeight: 400,
                    letterSpacing: '-0.02em',
                    color: 'var(--color-text-1)',
                    marginBottom: 16,
                    lineHeight: 1.2,
                  }}
                >
                  {f.title}
                </h3>
                <p
                  style={{
                    fontSize: 15,
                    color: 'var(--color-text-2)',
                    lineHeight: 1.7,
                    marginBottom: 20,
                    maxWidth: 440,
                  }}
                >
                  {f.body}
                </p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {f.tags.map((tag) => (
                    <span
                      key={tag}
                      style={{
                        display: 'inline-block',
                        padding: '4px 10px',
                        background: 'var(--color-scheduled-bg)',
                        color: 'var(--color-scheduled-fg)',
                        borderRadius: 6,
                        fontSize: 12,
                        fontWeight: 500,
                      }}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              {/* Image column — placeholder until real screenshots */}
              <div
                style={{
                  order: f.reversed ? 1 : 2,
                  background: 'var(--color-sunken)',
                  borderRadius: 12,
                  border: '0.5px solid var(--color-border-1)',
                  minHeight: 300,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <p style={{ fontSize: 12, color: 'var(--color-text-3)' }}>{f.imageAlt}</p>
              </div>
            </div>
          </AnimateIn>
        ))}
      </div>
    </section>
  )
}
