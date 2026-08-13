'use client'

import {
  BarChart3,
  GalleryHorizontalEnd,
  MessageSquareCheck,
  Palette,
  PenTool,
  Send,
  Sparkles,
  type LucideIcon,
} from 'lucide-react'
import { useAuthDialog } from '@/features/auth/components/auth-dialog-provider'
import { cn } from '@/utils/cn'
import { Reveal } from './reveal'
import { Section, SectionHead } from './section'

interface Capability {
  icon: LucideIcon
  name: string
  value: string
  /** The section further down that demonstrates it — every card lands on proof. */
  href: string
  cta: string
  motif: React.ReactNode
}

/** A caption mid-composition. */
const TypingMotif = () => (
  <>
    <span className="h-1.5 w-[74%] rounded-full bg-line" />
    <span className="h-1.5 w-[52%] rounded-full bg-line" />
    <span className="h-3 w-0.5 animate-pulse bg-spring" />
  </>
)

/** One brand's palette, as the extractor returns it. */
const PaletteMotif = () => (
  <>
    {['#164430', '#7fa588', '#e6eeae', '#8a6116'].map((hex) => (
      // Client brand hexes are content, not chrome — DESIGN.md § Client Identity.
      <span key={hex} className="size-3 rounded-xs" style={{ background: hex }} />
    ))}
  </>
)

/** Three slides designed, one still to go. */
const SlidesMotif = () => (
  <>
    <span className="h-5 w-4 rounded-xs bg-forest" />
    <span className="h-5 w-4 rounded-xs bg-sage" />
    <span className="h-5 w-4 rounded-xs bg-sage" />
    <span className="slot-open h-5 w-4 rounded-xs border border-dashed border-line2" />
  </>
)

/** A selected object on the canvas. */
const HandlesMotif = () => (
  <span className="relative inline-block h-5 w-7 rounded-xs border border-dashed border-spring">
    {['-left-1 -top-1', '-right-1 -top-1', '-bottom-1 -left-1', '-bottom-1 -right-1'].map((at) => (
      <span
        key={at}
        className={cn('absolute size-1.5 rounded-[2px] border border-spring bg-surface', at)}
      />
    ))}
  </span>
)

const CAPABILITIES: readonly Capability[] = [
  {
    icon: Sparkles,
    name: 'AI post generation',
    value:
      "A week of on-brand posts from each client's actual business — their site, their news, their voice.",
    href: '#engine',
    cta: 'Watch it compose',
    motif: <TypingMotif />,
  },
  {
    icon: Palette,
    name: 'Visual design systems',
    value: 'Every brand gets its own palette, type and templates — derived from its real identity.',
    href: '#visuals',
    cta: 'See the systems',
    motif: <PaletteMotif />,
  },
  {
    icon: GalleryHorizontalEnd,
    name: 'AI carousels',
    value:
      'Multi-slide posts with a designed visual for every single slide — never slide one and filler.',
    href: '#assembly',
    cta: 'See one assemble',
    motif: <SlidesMotif />,
  },
  {
    icon: PenTool,
    name: 'Built-in editor',
    value:
      'Move the type, swipe a marker, drop in elements, cut subjects out — no Canva round-trips.',
    href: '#editor',
    cta: 'Open the editor',
    motif: <HandlesMotif />,
  },
  {
    icon: MessageSquareCheck,
    name: 'Client forms',
    value: 'Ideas come in, approvals come back — your clients use a link, never a login.',
    href: '#approvals',
    cta: 'See the flow',
    motif: (
      <span className="rounded-full bg-wash px-2 py-1 text-micro text-forest">
        kontuur.app/approve/x7…
      </span>
    ),
  },
  {
    icon: Send,
    name: 'Auto-publishing',
    value:
      'Approved posts go out to Instagram & Facebook on schedule — while you do anything else.',
    href: '#autopilot',
    cta: 'Watch it publish',
    motif: (
      <>
        <span className="rounded-xs bg-wash px-1.5 py-0.5 text-micro font-semibold text-forest">
          IG
        </span>
        <span className="rounded-xs bg-wash px-1.5 py-0.5 text-micro font-semibold text-forest">
          FB
        </span>
        <span className="live-dot size-2 self-center rounded-full bg-spring" />
      </>
    ),
  },
  {
    icon: BarChart3,
    name: 'Analytics + AI insight',
    value:
      'Trends, top posts, audiences — with an AI summary that tells you what to do next month.',
    href: '#analytics',
    cta: 'See the insight',
    motif: (
      <>
        {[40, 65, 100, 55].map((height, index) => (
          <span
            key={height}
            // Computed from the value it encodes.
            style={{ height: `${height * 0.22}px` }}
            className={cn('w-2 rounded-full', index === 2 ? 'bg-forest' : 'bg-sage')}
          />
        ))}
      </>
    ),
  },
]

const CARD_BASE =
  'flex flex-col gap-3 rounded-card border border-ink/[0.05] p-5 text-left no-underline transition-[transform,box-shadow,border-color] duration-150 ease-contour hover:-translate-y-0.5 hover:shadow-card focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-spring'

export function Capabilities() {
  const { open } = useAuthDialog()

  return (
    <Section id="capabilities" wrap="split">
      <SectionHead
        align="center"
        eyebrow="Capabilities"
        title={
          <>
            Everything the feed needs, <em>built in</em>
          </>
        }
        note="Seven jobs that used to be your week — handled by one system. Each one is demonstrated live further down the page."
        className="mb-12"
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {CAPABILITIES.map((capability, index) => (
          <Reveal key={capability.name} delay={index * 60}>
            <a
              href={capability.href}
              className={cn(CARD_BASE, 'h-full bg-surface hover:border-spring/30')}
            >
              <span className="grid size-9 place-items-center rounded-lg bg-wash text-forest">
                <capability.icon size={16} aria-hidden />
              </span>
              <span className="text-title text-ink">{capability.name}</span>
              <span className="flex-1 text-caption text-text2">{capability.value}</span>
              <span aria-hidden className="flex min-h-6 items-end gap-1.5">
                {capability.motif}
              </span>
              <span className="text-caption font-semibold text-forest">
                {capability.cta} <span aria-hidden>→</span>
              </span>
            </a>
          </Reveal>
        ))}

        <Reveal delay={CAPABILITIES.length * 60}>
          {/* A real button, not a div with role="button" — Enter and Space come
              free, and so does the focus ring. */}
          <button
            type="button"
            onClick={() => open('signup')}
            className={cn(CARD_BASE, 'surface-dark h-full w-full border-transparent')}
          >
            <span className="grid size-9 place-items-center rounded-lg bg-ink-inv/10 text-accent">
              <Sparkles size={16} aria-hidden />
            </span>
            <span className="text-title text-ink-inv">Your week, back</span>
            <span className="flex-1 text-caption text-ink-inv/75">
              Start free — 14 days, no card. Set up your first client in minutes.
            </span>
            <span aria-hidden className="flex min-h-6 items-end">
              {/* Lime as a figure: legible only because the ground is Pine Deep. */}
              <span className="rounded-full bg-accent/20 px-2 py-0.5 text-micro font-semibold text-accent">
                Free trial
              </span>
            </span>
            <span className="text-caption font-semibold text-accent">
              Start free <span aria-hidden>→</span>
            </span>
          </button>
        </Reveal>
      </div>
    </Section>
  )
}
