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
    <section id="how-it-works" className="mkt-pad border-y border-line bg-sunken py-24">
      <AnimateIn>
        {/* tracking-[0.1em]: an all-caps eyebrow needs air between letters; the
            Micro role is tuned for mixed-case UI labels and carries none. */}
        <p className="mb-3 text-center text-micro font-medium uppercase tracking-[0.1em] text-spring">
          How it works
        </p>
        {/* tracking-[-0.02em]: the fluid section size is not a ramp step, so it
            brings no tracking of its own. */}
        <h2
          className="mb-16 text-center font-display font-normal tracking-[-0.02em] text-ink"
          style={{ fontSize: 'clamp(28px, 3vw, 40px)' }}
        >
          Up and running in minutes
        </h2>
      </AnimateIn>

      <div className="mx-auto my-0 grid max-w-[900px] grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-10">
        {steps.map((step, i) => (
          <AnimateIn key={step.num} delay={i * 0.06}>
            <div className="text-center">
              {/* leading-none: a single digit centred in its own circle. */}
              <div className="mx-auto mb-5 mt-0 flex h-9 w-9 items-center justify-center rounded-full bg-forest text-title font-semibold leading-none text-white">
                {step.num}
              </div>
              <h3 className="mb-2.5 text-title font-medium text-ink">{step.title}</h3>
              {/* leading-[1.65]: a three-line step description; the Body role's 1.6
                  is set for single-line UI text and reads dense at this length. */}
              <p className="m-0 text-body leading-[1.65] text-text2">{step.desc}</p>
            </div>
          </AnimateIn>
        ))}
      </div>
    </section>
  )
}
