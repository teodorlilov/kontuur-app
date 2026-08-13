import Image from 'next/image'
import { Reveal } from './reveal'
import { Section, SectionHead } from './section'

/**
 * A photograph of the real dashboard, not a replica of it.
 *
 * The mock this page was built from rebuilt a miniature dashboard in markup.
 * That version animates and stays crisp, but it is a second dashboard to keep
 * true — and the moment either one changes, the landing page is advertising a
 * product that does not exist. A screenshot can only ever be out of date; a
 * replica can be wrong.
 */
export function Product() {
  return (
    <Section id="product" wrap="wide">
      <SectionHead
        align="center"
        eyebrow="Product"
        title={
          <>
            One calm dashboard for <em>every client</em>
          </>
        }
        className="mb-12"
      />

      <Reveal>
        <div className="overflow-hidden rounded-card border border-ink/[0.05] bg-surface shadow-frame">
          <Image
            src="/landing/dashboard.png"
            alt="The Kontuur dashboard: this week's scheduled posts, drafts awaiting review, and every client's coverage at a glance."
            width={2932}
            height={1586}
            sizes="(max-width: 1320px) 100vw, 1320px"
            className="h-auto w-full"
            priority={false}
          />
        </div>
      </Reveal>
    </Section>
  )
}
