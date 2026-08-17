'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { focusableItems, rovingFocus } from '@/components/ui/roving-focus'
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '@/lib/canvas/constants'
import {
  fillCandidates,
  readableFill,
  textBox,
  type BackdropGrid,
} from '@/lib/canvas/contrast'
import { scrimNodeAttrs } from '@/lib/canvas/node-attrs'
import { buildBackdropGrid } from '../../lib/backdrop-grid'
import { decodedImage } from '../../lib/load-image'
import { clampAtWordBoundary } from '@/lib/visual/prompt'
import {
  LOCKUPS,
  LOCKUP_PACKS,
  activeLockup,
  lockupBlock,
  lockupCapacity,
  lockupFamilies,
  slideCopy,
  splitHero,
  supportsCyrillic,
  type Lockup,
  type LockupBlock,
  type LockupContext,
  type LockupId,
  type LockupMember,
  type LockupPack,
} from '@/lib/canvas/lockups'
import type { CanvasDoc, CanvasScrim, CanvasTextNode } from '@/types/canvas'
import { cn } from '@/utils/cn'
import { ensureFontsReady, injectLibraryStylesheet } from '../../lib/fonts'
import { EDITOR_LABEL } from './chrome'

/** Tiles per row — also the step `rovingFocus` moves on Up/Down, so the two cannot drift. */
const COLUMNS = 2

/**
 * How much copy a tile shows.
 *
 * A tile is ~118px wide showing a 1080px canvas, so a headline renders at about a tenth of its real
 * size — roughly nine characters a line. Drawn in full, a normal 70-character headline wraps to
 * eight lines and floods the tile, which made every layout look like the same grey block and hid the
 * one thing the tile exists to show. Clamped, the composition reads.
 *
 * `clampAtWordBoundary` appends an ellipsis, so a shortened preview announces itself as a sample
 * rather than quietly misrepresenting what will land on the slide.
 */
const PREVIEW_HEADLINE_CHARS = 26
const PREVIEW_BODY_CHARS = 52

interface LockupsSectionProps {
  doc: CanvasDoc
  ctx: LockupContext
  /** Offered only on a carousel — one slide has nothing to apply a lockup across. */
  onApplyToAll?: (id: LockupId) => void
  onApply: (id: LockupId) => void
  /** Slides the last apply-to-all landed on; null once undone or superseded. */
  appliedToAll: number[] | null
  onUndoApplyToAll: () => void
}

/**
 * The lockup picker.
 *
 * Tiles draw THIS slide's own words, so the choice is made on the real thing rather than on lorem.
 * They are DOM rather than an offscreen Konva raster: the whole font library is already loaded as
 * ordinary web fonts so the faces are byte-identical, and a Konva tile would build a full-size stage
 * per preview — allocated at device pixel ratio, not at tile size — for a picture 124px wide.
 */
export function LockupsSection({
  doc,
  ctx,
  onApply,
  onApplyToAll,
  appliedToAll,
  onUndoApplyToAll,
}: LockupsSectionProps) {
  const gridRef = useRef<HTMLDivElement>(null)
  const [pack, setPack] = useState<LockupPack>('essentials')
  // The LOGICAL copy, with any hero word rejoined — never the raw headline node. Reading the node
  // measures the sentence minus its first word, which quietly re-enabled tiles the whole sentence
  // overflows: wear a hero lockup and Stat's 13-character slot would accept an 18-character line.
  const { headline, body } = slideCopy(doc)
  /**
   * The same backdrop measurement the apply will use, so a tile PREDICTS its own result.
   *
   * Without it a tile drew the doc's current colours over the art and could look unreadable while
   * clicking it produced readable type — the preview under-selling the thing it is advertising.
   * `decodedImage` is a synchronous cache read; before the art decodes there is simply no repaint
   * to predict and the tiles draw the doc's colours, which is what they would have done anyway.
   */
  const backdrop = useMemo(() => {
    const image = decodedImage(doc.background.publicUrl)
    return image ? buildBackdropGrid(doc, image) : null
  }, [doc])
  const candidates = useMemo(() => fillCandidates(ctx.palette), [ctx.palette])
  const active = activeLockup(doc, ctx)

  // Pinned faces are not in the doc yet, so the editor's own font pass has never asked for them.
  // Loading them when the panel opens keeps the cost with the feature, and means a tile is never
  // drawn in a substitute face.
  useEffect(() => {
    injectLibraryStylesheet()
    void ensureFontsReady(lockupFamilies())
  }, [])

  if (!headline && !body) {
    return (
      <p className="m-0 text-micro text-text2">
        A lockup lays out a slide&rsquo;s headline and supporting line. This slide has neither yet —
        add text and they will appear here.
      </p>
    )
  }

  const shown = LOCKUPS.filter((lockup) => lockup.pack === pack)

  return (
    <div>
      <div role="group" aria-label="Lockup packs" className="mb-2 flex gap-1">
        {LOCKUP_PACKS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            title={entry.blurb}
            aria-pressed={pack === entry.id}
            onClick={() => setPack(entry.id)}
            className={cn(
              'flex-1 cursor-pointer rounded-sm border px-2 py-1 text-micro transition-colors duration-150 ease-contour',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-spring',
              pack === entry.id
                ? 'border-forest bg-wash text-forest'
                : 'border-line text-text2 hover:border-line2 hover:bg-ink/[0.03]'
            )}
          >
            {entry.label}
          </button>
        ))}
      </div>

      <div
        ref={gridRef}
        role="group"
        aria-label="Lockups"
        className="grid grid-cols-2 gap-2"
        // A grid claims all four arrows. Without this they reach the editor's window-level handler
        // and nudge the selected node by 1px while focus is over here — a move with no visible cause.
        onKeyDown={(event) =>
          rovingFocus(event, focusableItems(gridRef.current, 'button'), { grid: COLUMNS })
        }
      >
        {shown.map((lockup) => {
          // The same predicate apply-to-all skips a slide on, so a tile the picker offers can never
          // be one the carousel then refuses — or the reverse, which is how a Latin-only face
          // reached a Cyrillic slide.
          const block = lockupBlock(lockup, ctx, { headline, body })
          const blocked = block.wrongScript || block.tooMuchCopy
          const note = blockedNote(block)
          return (
            <button
              key={lockup.id}
              type="button"
              disabled={blocked}
              aria-pressed={active === lockup.id}
              title={tileReason(lockup, ctx, { headline, body }, block)}
              onClick={() => onApply(lockup.id)}
              className={cn(
                'flex cursor-pointer flex-col gap-1 rounded-sm border p-1 text-left transition-colors duration-150 ease-contour',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-spring',
                active === lockup.id
                  ? 'border-forest bg-wash'
                  : 'border-line hover:border-line2 hover:bg-ink/[0.03]',
                // Dimmed, but not to the point of illegibility: at opacity-40 on an already pale
                // tile the user could see something was off and nothing about why.
                blocked && 'cursor-default border-line/70 hover:border-line/70 hover:bg-transparent'
              )}
            >
              <span className={cn('block', blocked && 'opacity-45 grayscale')}>
                <TilePreview
                  lockup={lockup}
                  ctx={ctx}
                  headline={headline}
                  body={body}
                  background={doc.background.publicUrl}
                  scrim={doc.scrim}
                  backdrop={backdrop}
                  candidates={candidates}
                />
              </span>
              <span className="flex items-center justify-between gap-1 px-0.5">
                <span className={cn('text-micro', blocked ? 'text-text2' : 'text-ink')}>
                  {lockup.label}
                </span>
                {!supportsCyrillic(lockup) && (
                  <span
                    title="Latin alphabet only"
                    className="rounded-xs border border-line px-1 text-label leading-4 text-text3"
                  >
                    Lat
                  </span>
                )}
              </span>
              {/* The reason, on the tile rather than only in a tooltip. A greyed control whose
                  explanation is a hover away reads as broken on a touch device and to anyone who
                  simply does not hover. */}
              {note && <span className="px-0.5 text-label leading-4 text-text3">{note}</span>}
            </button>
          )
        })}
      </div>

      {active && onApplyToAll && (
        <div className="mt-3 border-t border-line pt-3">
          <div className={EDITOR_LABEL}>Across the carousel</div>
          <button
            type="button"
            onClick={() => onApplyToAll(active)}
            className={cn(
              'mt-1 w-full cursor-pointer rounded-sm border border-line px-2 py-1.5 text-micro text-ink',
              'transition-colors duration-150 ease-contour hover:border-line2 hover:bg-ink/[0.03]',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-spring'
            )}
          >
            Put this lockup on every slide
          </button>
          {appliedToAll ? (
            <p className="m-0 mt-1 flex items-baseline gap-2 text-micro text-text2">
              <span>
                On {appliedToAll.length} slide{appliedToAll.length === 1 ? '' : 's'}. Save to keep it.
              </span>
              {/* ONE undo for the set. `transformSlides` commits an entry per slide and ⌘Z steps
                  only the active one, so without this the way out of a seven-slide apply is to
                  visit each slide and undo it there. */}
              <button
                type="button"
                onClick={onUndoApplyToAll}
                className="rounded-xs underline underline-offset-2 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-spring"
              >
                Undo
              </button>
            </p>
          ) : (
            <p className="m-0 mt-1 text-micro text-text2">
              Each slide is laid out around its own words, so an index or a counter still counts up.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

/** The short reason printed on a blocked tile; empty when the tile is offered. */
function blockedNote(blocked: LockupBlock): string {
  if (blocked.wrongScript) return 'No Cyrillic'
  if (blocked.tooMuchCopy) return 'Needs shorter copy'
  return ''
}

/**
 * What the tile's tooltip says — its description when it is offered, and WHY when it is not.
 *
 * A dead control with no reason reads as broken, which is the same rule the panel sliders follow.
 */
function tileReason(
  lockup: Lockup,
  ctx: LockupContext,
  copy: { headline: string; body: string },
  blocked: LockupBlock
): string {
  if (blocked.wrongScript) {
    return `${lockup.label} — this lockup's font has no Cyrillic letters, and the slide's text is in Cyrillic`
  }
  if (!blocked.tooMuchCopy) return lockup.description

  const capacity = lockupCapacity(lockup, ctx)
  // Name the slot that ACTUALLY rejected. Reporting the headline budget when the hero slot was the
  // blocker produced tooltips like "holds about 535 characters" on a 30-character headline, which
  // reads as a broken control rather than as a thing the user could act on.
  if (lockup.copy(ctx).hero) {
    const split = splitHero(copy.headline)
    if (split.hero.length > capacity.hero) {
      return `${lockup.label} sets the first word at poster size, which fits about ${capacity.hero} letters — "${split.hero}" is longer`
    }
  }
  return `${lockup.label} holds about ${capacity.headline} characters — this slide's headline is longer`
}

interface TilePreviewProps {
  lockup: Lockup
  ctx: LockupContext
  headline: string
  body: string
  /** The slide's own clean art, so a tile reads as a miniature of THIS slide. */
  background: string
  scrim: CanvasScrim
  /** Null until the art decodes — the tile then draws the doc's colours unchanged. */
  backdrop: BackdropGrid | null
  candidates: readonly string[]
}

/**
 * The lockup at tile size, drawn from the same patch and members the click will apply.
 *
 * Sized in container units rather than a `transform: scale()`, so the tile needs no measurement and
 * no ResizeObserver: `100cqi` IS the tile's width, and every doc coordinate is expressed as its
 * fraction of the 1080px authoring width.
 */
function TilePreview({ lockup, ctx, headline, body, background, scrim, backdrop, candidates }: TilePreviewProps) {
  const patch = lockup.copy(ctx)
  // Clamped to the LOCKUP'S OWN capacity as well as the tile's budget, so a preview never draws
  // copy the slot cannot hold. Stat's headline slot takes thirteen characters; without this its
  // tile rendered a sentence colliding with the body and breaking words mid-letter — the picker
  // showing, as its advertisement for a layout, exactly the failure the layout is gated against.
  const capacity = lockupCapacity(lockup, ctx)
  const fit = (text: string, budget: number, slot: number) =>
    clampAtWordBoundary(text, Math.max(1, Math.min(budget, slot)))
  // The tile has to show the SPLIT, because that is what clicking it produces. Drawing the whole
  // sentence in the small remainder slot — and leaving the poster slot empty — made both hero
  // lockups preview as a caption layout and apply as a poster.
  const raw = patch.hero ? splitHero(headline) : { hero: '', rest: headline }
  const split = {
    hero: fit(raw.hero, PREVIEW_HEADLINE_CHARS, capacity.hero),
    rest: fit(raw.rest, PREVIEW_HEADLINE_CHARS, capacity.headline),
  }
  const bodyText = fit(body, PREVIEW_BODY_CHARS, capacity.body)
  const scrimBox = scrimNodeAttrs(scrim, { w: CANVAS_WIDTH, h: CANVAS_HEIGHT })
  return (
    <span
      aria-hidden
      className="relative block w-full overflow-hidden rounded-xs bg-cover bg-center"
      style={{
        containerType: 'inline-size',
        aspectRatio: `${CANVAS_WIDTH} / ${CANVAS_HEIGHT}`,
        // The slide's real art, not a flat swatch. Every tile drawn on plain `palette.surface` read
        // as an empty grey box that looked nothing like the slide it was previewing — and since the
        // canvas has already fetched this exact URL, the browser serves it from cache.
        backgroundColor: ctx.palette.surface,
        backgroundImage: background ? `url(${JSON.stringify(background)})` : undefined,
      }}
    >
      {/* The doc's own scrim, from the shared resolver the stage and the exporter both read — so a
          tile dims its picture by exactly as much as the slide does, rather than by a guess. */}
      {scrimBox && (
        <span
          className="absolute block"
          style={{
            left: `${(scrimBox.x / CANVAS_WIDTH) * 100}%`,
            top: `${(scrimBox.y / CANVAS_HEIGHT) * 100}%`,
            width: `${(scrimBox.width / CANVAS_WIDTH) * 100}%`,
            height: `${(scrimBox.height / CANVAS_HEIGHT) * 100}%`,
            background: scrimBox.fill,
            opacity: scrimBox.opacity,
          }}
        />
      )}
      {/* Members first, matching the render order the apply produces: furniture under the copy. */}
      {lockup.members(ctx).map((member, index) => (
        <TileMember key={index} member={member} />
      ))}
      {patch.hero && split.hero && (
        <TileText node={patch.hero} text={split.hero} backdrop={backdrop} candidates={candidates} />
      )}
      {split.rest && (
        <TileText node={patch.headline} text={split.rest} backdrop={backdrop} candidates={candidates} />
      )}
      {bodyText && (
        <TileText node={patch.body} text={bodyText} backdrop={backdrop} candidates={candidates} />
      )}
    </span>
  )
}

/** A created member — its own words for text, a hairline for a rule. */
function TileMember({ member }: { member: LockupMember }) {
  if (member.kind === 'text') return <TileText node={member} text={member.text} />
  const height = `calc(${member.height / CANVAS_WIDTH} * 100cqi)`
  return (
    <span
      className="absolute block"
      style={{
        left: `${(member.x / CANVAS_WIDTH) * 100}%`,
        top: `${(member.y / CANVAS_HEIGHT) * 100}%`,
        width: `${(member.width / CANVAS_WIDTH) * 100}%`,
        height,
        background: member.stroke,
      }}
    />
  )
}

/** One text box, positioned and sized as a fraction of the authoring canvas. */
function TileText({
  node,
  text,
  backdrop,
  candidates,
}: {
  node: Pick<
    CanvasTextNode,
    | 'x'
    | 'y'
    | 'width'
    | 'fontFamily'
    | 'fontSize'
    | 'fontWeight'
    | 'fill'
    | 'align'
    | 'lineHeight'
    | 'uppercase'
    | 'italic'
    | 'letterSpacing'
  >
  text: string
  backdrop?: BackdropGrid | null
  candidates?: readonly string[]
}) {
  // Named rather than inlined: these are canvas-document sizes scaled to the tile, and the value
  // reads better beside its sibling than buried in the style object.
  const fontSize = `calc(${node.fontSize / CANVAS_WIDTH} * 100cqi)`
  // The colour the APPLY would land on, resolved through the same helper the doc transform uses —
  // so the tile shows the result rather than the starting point.
  const fill =
    backdrop && candidates ? readableFill(backdrop, textBox(node), node.fill, candidates) : node.fill
  const letterSpacing = node.letterSpacing
    ? `calc(${node.letterSpacing / CANVAS_WIDTH} * 100cqi)`
    : undefined

  return (
    <span
      className="absolute block"
      style={{
        left: `${(node.x / CANVAS_WIDTH) * 100}%`,
        top: `${(node.y / CANVAS_HEIGHT) * 100}%`,
        width: `${(node.width / CANVAS_WIDTH) * 100}%`,
        // The library stylesheet is already in <head>, so this resolves to the same binary Konva
        // rasterises. The fallback only covers the moment before the face lands.
        fontFamily: `"${node.fontFamily}", sans-serif`,
        fontSize,
        fontWeight: node.fontWeight,
        fontStyle: node.italic ? 'italic' : 'normal',
        color: fill,
        textAlign: node.align,
        lineHeight: node.lineHeight,
        letterSpacing,
        textTransform: node.uppercase ? 'uppercase' : 'none',
        // Konva wraps on words too, but with its own binary search over measureText rather than
        // UAX-14 — so a long word can break to a different line here than on the canvas. The tile
        // is a layout, not a pixel preview, and the difference costs at most one line of impression.
        overflowWrap: 'break-word',
      }}
    >
      {text}
    </span>
  )
}
