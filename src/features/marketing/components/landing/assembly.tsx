'use client'

import Image from 'next/image'
import { cn } from '@/utils/cn'
import { useSectionLoop } from '../../hooks/use-section-loop'
import { useTypewriter } from '../../hooks/use-typewriter'

const THEMES = ['Autumn menu launch', 'Baking behind the scenes', 'Meet the roaster'] as const

const COPY =
  'The autumn menu lands Friday — pumpkin cortado, cardamom buns, and slow Sunday brunch is back.'

/** Theme picked → copy written → every slide designed. */
const HOLDS = [2200, 4200, 6800] as const

/**
 * The whole post, not the cover.
 *
 * A carousel where slide one is designed and slides two to four are filler is
 * the failure mode this section exists to deny — so the strip shows four
 * finished slides and one still-open tile, hatched the way the app hatches an
 * unfilled day.
 */
export function Assembly() {
  const { ref, phase } = useSectionLoop<HTMLDivElement>({ holds: HOLDS })
  const copy = useTypewriter(COPY, phase >= 1)

  return (
    <div ref={ref} aria-hidden="true" className="mt-6 flex flex-col gap-3">
      <Phase index={1} tone="bg-lime" title="Researching the theme" active={phase >= 0}>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {THEMES.map((theme, index) => (
            <span
              key={theme}
              className={cn(
                'rounded-full px-3 py-1 text-caption transition-colors duration-500 ease-contour',
                index === 0 && phase >= 0
                  ? 'bg-forest text-white'
                  : 'bg-surface/70 text-text2 opacity-60'
              )}
            >
              {theme}
            </span>
          ))}
        </div>
      </Phase>

      <Phase index={2} tone="bg-sage" title="Writing the copy" active={phase >= 1}>
        <p className="mt-2.5 min-h-[44px] rounded-md bg-surface/70 px-3 py-2 text-body text-ink">
          {copy}
          {phase === 1 && copy.length < COPY.length && (
            <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-spring" />
          )}
        </p>
      </Phase>

      <Phase
        index={3}
        tone="surface-dark"
        dark
        title="Generating a visual for every slide"
        active={phase >= 2}
      >
        <div className="mt-3 flex gap-2.5 overflow-x-auto pb-1">
          {SLIDES.map((slide, index) => (
            <span
              key={index}
              style={{ transitionDelay: `${index * 160}ms` }}
              className={cn(
                'relative h-[132px] w-[106px] flex-none overflow-hidden rounded-md',
                'transition-[opacity,transform] duration-500 ease-contour motion-reduce:transition-none',
                phase >= 2 ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'
              )}
            >
              <SlideFace slide={slide} />
              {slide.kind !== 'open' && (
                <span className="absolute left-1.5 top-1.5 grid size-4 place-items-center rounded-full bg-surface text-micro font-semibold text-ink">
                  {index + 1}
                </span>
              )}
            </span>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <span className="text-caption text-ink-inv/70">Carousel · 4 slides, one visual each</span>
          <span className="rounded-full bg-accent px-2.5 py-1 text-micro font-semibold text-forest-deep">
            Ready for review
          </span>
        </div>
      </Phase>
    </div>
  )
}

type Slide =
  | { kind: 'photo'; src: string; word?: string }
  | { kind: 'type'; kicker: string; head: string }
  | { kind: 'cta'; head: string; sub: string }
  | { kind: 'open' }

const SLIDES: readonly Slide[] = [
  { kind: 'photo', src: '/landing/assembly-cover.jpg', word: 'seasonal' },
  { kind: 'type', kicker: 'GreenLeaf · Menu', head: 'Three new drinks, one weekend.' },
  { kind: 'photo', src: '/landing/assembly-detail.jpg' },
  { kind: 'cta', head: 'First pour on us', sub: 'greenleaf café' },
  { kind: 'open' },
]

function SlideFace({ slide }: { slide: Slide }) {
  if (slide.kind === 'photo') {
    return (
      <>
        <Image src={slide.src} alt="" fill sizes="106px" className="object-cover" />
        {slide.word && (
          <span className="absolute bottom-2 left-2 right-2 font-display text-caption italic text-white">
            {slide.word}
          </span>
        )}
      </>
    )
  }
  if (slide.kind === 'type') {
    return (
      <span className="flex size-full flex-col justify-between bg-wash p-2.5">
        <span className="text-micro uppercase text-text3">{slide.kicker}</span>
        <span className="font-display text-caption italic text-forest">{slide.head}</span>
      </span>
    )
  }
  if (slide.kind === 'cta') {
    return (
      <span className="surface-dark flex size-full flex-col justify-end gap-1 p-2.5">
        <span className="font-display text-caption italic text-ink-inv">{slide.head}</span>
        <span className="text-micro uppercase text-ink-inv/60">{slide.sub}</span>
      </span>
    )
  }
  // Hatching means absence — the same texture the calendar uses for an open day.
  return <span className="slot-open-inv block size-full rounded-md" />
}

function Phase({
  index,
  tone,
  dark = false,
  title,
  active,
  children,
}: {
  index: number
  tone: string
  dark?: boolean
  title: string
  active: boolean
  children: React.ReactNode
}) {
  return (
    <div
      className={cn(
        'flex gap-4 rounded-card p-5 transition-opacity duration-500 ease-contour motion-reduce:transition-none',
        tone,
        active ? 'opacity-100' : 'opacity-45'
      )}
    >
      <span
        className={cn(
          'grid size-6 flex-none place-items-center rounded-full text-micro font-semibold',
          dark ? 'bg-ink-inv/12 text-ink-inv' : 'bg-surface text-ink'
        )}
      >
        {index}
      </span>
      <div className="min-w-0 flex-1">
        <p className={cn('text-title', dark ? 'text-ink-inv' : 'text-ink')}>{title}</p>
        {children}
      </div>
    </div>
  )
}
