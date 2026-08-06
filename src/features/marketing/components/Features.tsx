'use client'
import { Sparkles, CheckSquare, BarChart2 } from 'lucide-react'
import { AnimateIn } from './AnimateIn'

const features = [
  {
    icon: Sparkles,
    title: 'AI content generation',
    body: "Generate posts from your client's website and documents. On-brand Instagram content in Bulgarian or English",
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
    <section id="features" className="mkt-pad bg-paper py-24">
      <AnimateIn>
        {/* tracking-[0.1em]: an all-caps eyebrow needs air between letters; the
            Micro role is tuned for mixed-case UI labels and carries none. */}
        <p className="mb-3 text-center text-micro font-medium uppercase tracking-[0.1em] text-spring">
          Features
        </p>
        {/* tracking-[-0.02em]: the fluid section size is not a ramp step, so it
            brings no tracking of its own. */}
        <h2
          className="mb-14 text-center font-display font-normal tracking-[-0.02em] text-ink"
          style={{ fontSize: 'clamp(28px, 3vw, 40px)' }}
        >
          Everything your agency needs
        </h2>
      </AnimateIn>

      <div className="mx-auto my-0 grid max-w-[1100px] grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-6">
        {features.map((f, i) => (
          <AnimateIn key={f.title} delay={i * 0.08}>
            <div className="h-full cursor-default rounded-[16px] bg-sunken p-7 transition-[transform,background] duration-200 ease-[ease] hover:[transform:translateY(-2px)]">
              <f.icon size={32} color="var(--spring)" className="mb-5" />
              <h3 className="mb-2.5 text-lead font-medium text-ink">{f.title}</h3>
              {/* leading-[1.65]: a three-line card paragraph; the Body role's 1.6
                  is set for single-line UI text and reads dense at this length. */}
              <p className="m-0 text-body leading-[1.65] text-text2">{f.body}</p>
            </div>
          </AnimateIn>
        ))}
      </div>
    </section>
  )
}
