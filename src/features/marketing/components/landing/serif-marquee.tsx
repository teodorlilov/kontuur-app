import { cn } from '@/utils/cn'

interface SerifMarqueeProps {
  words: readonly string[]
  reverse?: boolean
  durationS?: number
}

/**
 * A band of drifting serif words between sections — a breath, not a claim.
 *
 * The separator dots are Marker rather than lime: on paper lime measures 1.35:1
 * and a dot at this size would be invisible, which is the whole of DESIGN.md's
 * Fill-Only Lime Rule.
 */
export function SerifMarquee({ words, reverse = false, durationS = 52 }: SerifMarqueeProps) {
  return (
    <div className="mq py-8" aria-hidden="true">
      <div
        className="mq-track"
        style={
          {
            '--mq-duration': `${durationS}s`,
            '--mq-direction': reverse ? 'reverse' : 'normal',
          } as React.CSSProperties
        }
      >
        {[0, 1].map((copy) => (
          <span
            key={copy}
            // Fluid Hero Exception — decorative display type, sized to the viewport.
            style={{ fontSize: 'clamp(44px, 6vw, 76px)' }}
            className={cn(
              'flex shrink-0 items-center whitespace-nowrap font-display italic leading-none text-ink/[0.08]'
            )}
          >
            {words.map((word) => (
              <span key={word} className="flex items-center">
                {word}
                <span className="px-[0.35em] text-marker">·</span>
              </span>
            ))}
          </span>
        ))}
      </div>
    </div>
  )
}
