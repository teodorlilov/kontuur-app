'use client'
import Image, { type StaticImageData } from 'next/image'
import { Sparkles, CheckSquare, Send, BarChart2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { AnimateIn } from './AnimateIn'
import { useIsMobile } from '@/hooks/useIsMobile'
import calendarShot from '../../../../public/calendar.png'
import generationShot from '../../../../public/generation.png'
import reportShot from '../../../../public/report.png'
import reviewShot from '../../../../public/review.png'

interface Feature {
  icon: LucideIcon
  title: string
  body: string
  tags: string[]
  imageAlt: string
  imageSrc: StaticImageData
  reversed: boolean
}

const features: Feature[] = [
  {
    icon: Sparkles,
    title: 'Generate posts from real content',
    body: "Kontuur reads your client's website, documents, and previous posts to generate on-brand Instagram content in Bulgarian or English. Single images, carousels — all with one click.",
    tags: ['AI', 'Content generation'],
    imageAlt: 'Generate posts page',
    imageSrc: generationShot,
    reversed: false,
  },
  {
    icon: CheckSquare,
    title: 'Approve, edit, schedule in seconds',
    body: 'Every generated post goes into a review queue. Read the caption, check the source grounding, approve or reject. Schedule directly to Instagram from the same screen.',
    tags: ['Review', 'Approval workflow'],
    imageAlt: 'Review queue',
    imageSrc: reviewShot,
    reversed: true,
  },
  {
    icon: Send,
    title: 'Publish directly to Instagram',
    body: "Connect your clients' Instagram accounts once. Kontuur handles publishing — single images, carousels, and scheduled posts — using the official Meta API.",
    tags: ['Publishing', 'Scheduling'],
    imageAlt: 'Calendar / scheduling view',
    imageSrc: calendarShot,
    reversed: false,
  },
  {
    icon: BarChart2,
    title: 'Real data, not estimates',
    body: 'Analytics pulled directly from the Instagram API — reach, saves, engagement rate, follower growth, and post-level performance for every client account.',
    tags: ['Analytics', 'Instagram insights'],
    imageAlt: 'Analytics page',
    imageSrc: reportShot,
    reversed: true,
  },
]

export function FeaturesDeepDive() {
  const isMobile = useIsMobile()

  return (
    <section className="mkt-pad bg-paper py-20">
      <div
        className="mx-auto my-0 flex max-w-[1100px] flex-col"
        style={{ gap: isMobile ? 48 : 80 }}
      >
        {features.map((f) => (
          <AnimateIn key={f.title}>
            <div
              className="grid items-center"
              style={{
                gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
                gap: isMobile ? 24 : 64,
              }}
            >
              {/* Text column — always first on mobile */}
              <div style={{ order: isMobile ? 1 : f.reversed ? 2 : 1 }}>
                <f.icon size={28} color="var(--spring)" className="mb-4" />
                {/* leading-[1.2] + tracking-[-0.02em]: the fluid heading size is not
                    a ramp step, so it brings no metrics of its own. */}
                <h3
                  className="mb-4 font-display font-normal leading-[1.2] tracking-[-0.02em] text-ink"
                  style={{ fontSize: 'clamp(22px, 2.5vw, 28px)' }}
                >
                  {f.title}
                </h3>
                {/* leading-[1.7]: a four-line body paragraph; the Title role's 1.4
                    is set for one-line headings and reads cramped here. */}
                <p className="mb-5 max-w-[440px] text-title leading-[1.7] text-text2">{f.body}</p>
                <div className="flex flex-wrap gap-2">
                  {f.tags.map((tag) => (
                    <span
                      className="inline-block rounded-[6px] bg-marker px-2.5 py-1 text-caption font-medium text-forest-deep"
                      key={tag}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              <Image
                src={f.imageSrc}
                alt={f.imageAlt}
                sizes="(max-width: 768px) 100vw, 518px"
                className="block h-auto w-full rounded-[12px] border border-line shadow-[0_4px_24px_rgba(0,0,0,0.08)]"
                style={{ order: isMobile ? 2 : f.reversed ? 1 : 2 }}
              />
            </div>
          </AnimateIn>
        ))}
      </div>
    </section>
  )
}
