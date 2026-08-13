import Image from 'next/image'
import { cn } from '@/utils/cn'

/**
 * The wall is Kontuur's own output, which is the only honest thing it could be:
 * no client logos, no invented brands with invented follower counts. Two kinds
 * of tile, because the composition engine really does make both — photo-led
 * with a serif overlay, and type-led with a kicker and a marker band.
 */
type Tile =
  | { kind: 'photo'; src: string; word?: string }
  | { kind: 'post'; kicker: string; head: string; page: string; dark?: boolean; banded?: boolean }

const TILES: readonly Tile[] = [
  { kind: 'photo', src: '/landing/cafe.jpg', word: 'seasonal' },
  {
    kind: 'post',
    kicker: 'VitaFit · Weekly No 7',
    head: '5 myths about protein',
    page: '1/5',
    dark: true,
    banded: true,
  },
  { kind: 'photo', src: '/landing/nutrition.jpg', word: 'protein, honestly' },
  { kind: 'photo', src: '/landing/interior.jpg' },
  { kind: 'photo', src: '/landing/atelier.jpg', word: 'behind the seams' },
  {
    kind: 'post',
    kicker: 'GreenLeaf Café · No 12',
    head: 'Slow mornings, back on the menu.',
    page: '1/4',
  },
  { kind: 'photo', src: '/landing/skincare.jpg' },
  { kind: 'photo', src: '/landing/botanical.jpg', word: 'slow rituals' },
]

function WallTile({ tile }: { tile: Tile }) {
  const shell =
    'relative h-[298px] w-[238px] flex-none overflow-hidden rounded-panel border border-ink/[0.05]'

  if (tile.kind === 'photo') {
    return (
      <div className={shell}>
        <Image src={tile.src} alt="" fill sizes="238px" className="object-cover" />
        {tile.word && (
          <>
            <span className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-ink/55 to-transparent" />
            <span className="absolute bottom-4 left-4 right-4 font-display text-headline font-normal italic text-white">
              {tile.word}
            </span>
          </>
        )}
      </div>
    )
  }

  return (
    <div
      className={cn(
        shell,
        'flex flex-col justify-between p-[18px]',
        tile.dark ? 'surface-dark' : 'bg-wash'
      )}
    >
      <span className={cn('text-label uppercase', tile.dark ? 'text-ink-inv/55' : 'text-text3')}>
        {tile.kicker}
      </span>
      {tile.banded ? (
        // leading/tracking: uppercase at Title size needs the extra line gap and
        // the letterspacing that sentence-case type does not — this is the
        // condensed-caps post style the engine actually produces.
        <span className="text-title uppercase leading-[1.4] tracking-[0.04em] text-ink-inv">
          5 <span className="bg-spring/35 px-1">myths</span> about protein
        </span>
      ) : (
        <span className="font-display text-headline font-normal italic text-forest">
          {tile.head}
        </span>
      )}
      <span
        className={cn(
          'w-fit rounded-full px-2 py-0.5 text-micro',
          tile.dark ? 'bg-ink-inv/12 text-ink-inv/70' : 'bg-surface text-text2'
        )}
      >
        {tile.page}
      </span>
    </div>
  )
}

function WallRow({ reverse = false, durationS }: { reverse?: boolean; durationS: number }) {
  return (
    <div className="mq" aria-hidden="true">
      <div
        className="mq-track gap-4"
        style={
          {
            '--mq-duration': `${durationS}s`,
            '--mq-direction': reverse ? 'reverse' : 'normal',
          } as React.CSSProperties
        }
      >
        {/* Twice, so the -50% translate lands on an identical frame. */}
        {[0, 1].map((copy) => (
          <div key={copy} className="flex shrink-0 gap-4 pr-4">
            {TILES.map((tile, index) => (
              <WallTile key={`${copy}-${index}`} tile={tile} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

/** Two counter-scrolling rows of finished posts, under the hero copy. */
export function PostWall() {
  return (
    <div className="mt-14 flex flex-col gap-4">
      <WallRow durationS={46} />
      <WallRow reverse durationS={62} />
    </div>
  )
}
