import Image from 'next/image'
import { AnimateIn } from './AnimateIn'
import dashboardShot from '../../../../public/dashboard.png'

export function DashboardPreview() {
  return (
    <section className="mkt-pad overflow-hidden bg-forest pb-0 pt-20 text-center">
      <AnimateIn>
        {/* tracking-[0.1em]: an all-caps eyebrow needs air between letters; the
            Micro role is tuned for mixed-case UI labels and carries none. */}
        <p className="mb-3 text-micro font-medium uppercase tracking-[0.1em] text-white/40">
          The dashboard
        </p>
        {/* tracking-[-0.02em]: the fluid section size is not a ramp step, so it
            brings no tracking of its own. */}
        <h2
          className="mb-4 font-display font-normal tracking-[-0.02em] text-white/95"
          style={{ fontSize: 'clamp(28px, 3vw, 40px)' }}
        >
          Everything in one place
        </h2>
        <p className="mx-auto mb-12 mt-0 max-w-[480px] text-lead text-white/55">
          One workspace for all your clients. Generate, review, schedule, and analyse Instagram
          content without switching tabs.
        </p>
      </AnimateIn>

      <Image
        src={dashboardShot}
        alt="Kontuur dashboard"
        sizes="(max-width: 1200px) 100vw, 1200px"
        className="mx-auto my-0 block h-auto w-full max-w-[1200px] rounded-t-[16px] border border-white/12"
      />
    </section>
  )
}
