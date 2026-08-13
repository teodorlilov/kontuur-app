import { Assembly } from './assembly'
import { Reveal } from './reveal'
import { Section, SectionHead } from './section'

/**
 * Three real extraction outputs.
 *
 * The hexes are each brand's *own* palette, pulled from their site and feed —
 * content, which DESIGN.md § Client Identity explicitly allows in a swatch row
 * and explicitly forbids anywhere in Kontuur's chrome. That is why they are
 * inline values here and nowhere else on this page.
 *
 * "Aa" specimens are legitimate here too, and only here: this is a design
 * system on display, not a post pretending to be one.
 */
const IDENTITIES = [
  {
    name: 'GreenLeaf Café',
    tag: 'Editorial serif · photo-led',
    specimen: { label: 'Aa', bg: '#f5f1e6', fg: '#164430', serif: true },
    palette: ['#164430', '#7fa588', '#f5f1e6', '#c99a3c'],
  },
  {
    name: 'VitaFit Nutrition',
    tag: 'Bold caps · marker bands',
    specimen: { label: 'AA', bg: '#1b5e48', fg: '#ffffff', serif: false },
    palette: ['#1b5e48', '#9be1b8', '#f2f7f1', '#0f2a20'],
  },
  {
    name: 'Atelier Nord',
    tag: 'Poster type · deep tones',
    specimen: { label: 'Aa', bg: '#0c2e20', fg: '#d9c9a8', serif: true },
    palette: ['#0c2e20', '#d9c9a8', '#f2f5f1', '#3e4a42'],
  },
] as const

export function Visuals() {
  return (
    <Section id="visuals" wrap="default">
      <SectionHead
        align="center"
        eyebrow="Visuals"
        title={
          <>
            Posts that don&apos;t <em>look AI-made</em>
          </>
        }
        note="Every caption ships with its visual, generated as a pair — you never get text without the picture. And every brand gets its own design system — palette, typography and layout templates derived from its real visual presence. A café never looks like a gym, and none of it looks like AI."
        className="mb-12"
      />

      <div className="grid gap-5 md:grid-cols-3">
        {IDENTITIES.map((identity, index) => (
          <Reveal key={identity.name} delay={index * 100}>
            <div className="flex h-full items-center gap-4 rounded-card border border-ink/[0.05] bg-surface p-5">
              <span
                aria-hidden
                // A brand's own colours, rendered as content.
                style={{
                  background: identity.specimen.bg,
                  color: identity.specimen.fg,
                }}
                className={
                  'grid size-16 flex-none place-items-center rounded-panel text-metric' +
                  (identity.specimen.serif ? ' font-display font-normal italic' : ' font-semibold')
                }
              >
                {identity.specimen.label}
              </span>
              <div className="min-w-0">
                <p className="text-title text-ink">{identity.name}</p>
                <p className="mt-0.5 text-caption text-text2">{identity.tag}</p>
                <div className="mt-2.5 flex gap-1.5">
                  {identity.palette.map((hex) => (
                    <span
                      key={hex}
                      aria-hidden
                      style={{ background: hex }}
                      className="size-3.5 rounded-full border border-ink/[0.08]"
                    />
                  ))}
                </div>
              </div>
            </div>
          </Reveal>
        ))}
      </div>

      <p className="mt-5 text-caption text-text3">
        Built from each brand&apos;s site, feed and materials — then applied to every post,
        automatically.
      </p>

      <div id="assembly" className="mt-16 scroll-mt-24">
        <h3
          // Fluid Hero Exception — a section-scale heading inside the band.
          style={{ fontSize: 'clamp(22px, 2.2vw, 28px)' }}
          // leading/tracking: an off-ramp size carries no role line-height.
          className="font-semibold leading-[1.25] tracking-[-0.02em] text-ink"
        >
          How a whole post comes together —{' '}
          <em className="font-display font-normal italic text-forest">theme, copy, every slide</em>
        </h3>
        <Assembly />
      </div>
    </Section>
  )
}
