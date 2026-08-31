'use client'

import { useRef } from 'react'
import { cn } from '@/utils/cn'
import { VisualFrame } from '@/components/draft-editing/visual-frame'
import { focusableItems, rovingFocus } from '@/components/ui/roving-focus'

interface SlideStripProps {
  positions: number[]
  activePosition: number
  /** The file stored at each position — a saved slide's tile updates without the editor closing. */
  images: Map<number, { publicUrl: string }>
  dirtyPositions: number[]
  onSelect: (position: number) => void
}

/**
 * Which slide of the carousel is being edited, and which others still hold unsaved work.
 *
 * The same 72px filmstrip tile the review surface uses, so moving between the two reads as one
 * carousel rather than two — but here the tile also has to answer "did I finish that one?", which
 * is what the dot is for.
 */
export function SlideStrip({
  positions,
  activePosition,
  images,
  dirtyPositions,
  onSelect,
}: SlideStripProps) {
  const listRef = useRef<HTMLDivElement>(null)

  return (
    <div className="flex shrink-0 justify-center border-t border-line bg-paper px-3 py-2">
      <div
        ref={listRef}
        role="tablist"
        aria-label="Slides"
        className="flex max-w-full gap-2 overflow-x-auto"
        onKeyDown={(event) => {
          rovingFocus(event, focusableItems(listRef.current, '[role="tab"]'), 'horizontal')
        }}
      >
        {positions.map((position) => {
          const active = position === activePosition
          const dirty = dirtyPositions.includes(position)
          return (
            <button
              key={position}
              type="button"
              role="tab"
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              aria-label={`Slide ${position + 1}${dirty ? ', unsaved changes' : ''}`}
              title={dirty ? `Slide ${position + 1} · unsaved changes` : `Slide ${position + 1}`}
              onClick={() => onSelect(position)}
              className="w-[72px] flex-none cursor-pointer"
            >
              <span
                className={cn(
                  'relative block overflow-hidden rounded-sm border-2 transition-colors duration-150 ease-contour',
                  active ? 'border-forest' : 'border-transparent hover:border-line2'
                )}
              >
                <VisualFrame
                  visual={{ status: 'done', publicUrl: images.get(position)?.publicUrl }}
                  size="strip"
                  alt=""
                />
                {dirty && (
                  <span
                    aria-hidden
                    // On the tile rather than beside it: the strip scrolls, and a marker outside
                    // the frame is the first thing an overflowing row clips.
                    className="absolute right-1 top-1 size-2 rounded-full bg-forest ring-2 ring-paper"
                  />
                )}
              </span>
              <span
                className={cn(
                  'mt-1 block text-center text-micro tabular-nums',
                  active ? 'font-medium text-ink' : 'text-text3'
                )}
              >
                {position + 1}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
