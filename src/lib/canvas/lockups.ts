/**
 * Lockups — designed type layouts for a slide.
 *
 * A lockup does three things in one transform: it SWEEPS every node it previously owned, RESTYLES
 * the headline and body the slide already has, and CREATES its own extra pieces (a kicker, a rule,
 * a tagline). A layout that creates nothing is still a lockup — that is the whole reason the two
 * are one system rather than two. Two systems would fight: a layout that moved the headline while
 * leaving a lockup's kicker behind would tear the design in half, silently.
 *
 * Why sweep-and-recreate instead of a `groupId` on the node:
 * - Roles ARE the identity. `kicker`/`tagline`/`mark` mean "a lockup put this here", so finding the
 *   previous lockup's pieces is a filter, not a bookkeeping problem.
 * - Re-application is idempotent. Member ids are REUSED from the nodes being swept, so applying the
 *   same lockup twice produces a byte-identical doc and `commitHistory`'s no-op guard drops it —
 *   minting fresh uuids would instead cost an undo step and re-dirty the slide on every click.
 *
 * What it deliberately cannot do: move or scale as a single object, or carry an ornament that is
 * neither text nor a rule. Both need a real grouping field on the node model.
 */

import { CANVAS_HEIGHT, CANVAS_WIDTH, TEXT_BOTTOM_MARGIN } from './constants'
import { isLockupOwned, isTextNode } from './doc-nodes'
import { getFontEntry, hasCyrillic, type FontFamilyName } from './font-library'
import type { BrandStyleFonts } from '@/lib/visual/brand-styles'
import type {
  CanvasDoc,
  CanvasFontWeight,
  CanvasNode,
  CanvasShapeNode,
  CanvasTextAlign,
  CanvasTextRole,
  CanvasTextNode,
} from '@/types/canvas'
import type { Palette } from '@/types/visual'

/** Packs are how the catalogue grows: a new pack is a data entry, never a refactor. */
export type LockupPack = 'essentials' | 'layouts'

export const LOCKUP_PACKS: ReadonlyArray<{ id: LockupPack; label: string; blurb: string }> = [
  { id: 'essentials', label: 'Essentials', blurb: 'The eight jobs social posts actually do' },
  { id: 'layouts', label: 'Layouts', blurb: 'Pure type layouts — nothing added to the slide' },
]

export type LockupId =
  // essentials
  | 'impact'
  | 'editorial'
  | 'index'
  | 'quote'
  | 'stat'
  | 'badge'
  | 'announce'
  | 'tip'
  | 'headliner'
  | 'duet'
  // layouts
  | 'stack'
  | 'anchor'
  | 'field'
  | 'margin'
  | 'tight'
  | 'edge'

/**
 * The fields a lockup owns on the copy nodes it restyles. EVERY lockup writes ALL of them, so
 * switching between two can never leave a value from the one you left behind.
 *
 * Deliberately absent: `shadow*`, `stroke*`, `highlight`, `arcBend`. Those are the effects layer —
 * an orthogonal choice the user makes on top of a layout.
 *
 * The consequence, stated plainly because it is a gap rather than a design: NO lockup carries any
 * decoration at all. The intended rule is ONE per lockup — stacking marker + shadow + outline + arc
 * is the fastest route to amateur work — but the field that would let a lockup declare its one is
 * not built, so the count today is zero rather than one. Do not read this comment as describing
 * behaviour that exists.
 */
type LockupField =
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

export const LOCKUP_FIELDS: readonly LockupField[] = [
  'x',
  'y',
  'width',
  'fontFamily',
  'fontSize',
  'fontWeight',
  'fill',
  'align',
  'lineHeight',
  'uppercase',
  'italic',
  'letterSpacing',
]

/**
 * The fields that say a slide is STILL wearing a lockup — everything it writes, minus `fill`.
 *
 * A lockup writes colour and the contrast pass then overwrites it, on the way to the canvas and on
 * every slide the art is busy enough to need it — which is the common case, not the exception. So
 * matching identity on `fill` meant a lockup stopped reporting as active the instant it was applied:
 * the picker showed nothing selected on a slide plainly wearing the layout, and withheld "apply to
 * every slide", which is offered only for the active one.
 *
 * Geometry and face are what a lockup IS. Colour is a downstream decision about the picture, made
 * after the layout has been chosen — so a hand-picked colour no more cancels the lockup than the
 * automatic repaint does.
 */
const IDENTITY_FIELDS: readonly LockupField[] = LOCKUP_FIELDS.filter((field) => field !== 'fill')

export interface LockupContext {
  palette: Palette
  fonts: BrandStyleFonts
  /** Which slide this is, so an index or a counter can say so instead of guessing. */
  slide: { position: number; total: number }
}

/** The patch each copy role receives. A role the slide does not have is simply not applied. */
interface LockupCopy {
  headline: Pick<CanvasTextNode, LockupField>
  body: Pick<CanvasTextNode, LockupField>
  /**
   * Present only on lockups that lift the headline's FIRST WORD out to poster scale.
   *
   * This is what buys the 6-10x contrast the flat catalogue could not reach: our copy runs to forty
   * characters, and a 220px slot on the text column holds about eight — so without a split, every
   * high-contrast layout is permanently greyed out by its own capacity gate.
   */
  hero?: Pick<CanvasTextNode, LockupField>
}

/**
 * The headline's first word and everything after it.
 *
 * FIRST word, never the longest or the shortest: any other choice reorders the sentence, and a
 * lockup that silently rearranges a client's words is worse than one that declines the job. If the
 * first word will not fit the hero slot, `fitsCopy` greys the tile out rather than picking a
 * different word.
 */
export function splitHero(headline: string): { hero: string; rest: string } {
  const trimmed = headline.trim()
  const boundary = trimmed.search(/\s/)
  if (boundary === -1) return { hero: trimmed, rest: '' }
  return { hero: trimmed.slice(0, boundary), rest: trimmed.slice(boundary + 1).trim() }
}

/**
 * The slide's LOGICAL copy — a hero node's word rejoined onto the headline it was lifted from.
 *
 * Everything measures and reasons against this rather than against the raw nodes, so a doc that is
 * currently wearing a hero lockup answers the same question as one that is not. It is what makes
 * switching between a hero lockup and a flat one round-trip instead of shedding a word each time.
 */
export function slideCopy(doc: CanvasDoc): { headline: string; body: string } {
  const first = (role: CanvasTextRole) => {
    const node = doc.nodes.find((candidate) => isTextNode(candidate) && candidate.role === role)
    return node && isTextNode(node) ? node.text : ''
  }
  // EVERY hero, in render order — not just the first. A user can duplicate the poster word to build
  // a two-word lockup, and the sweep removes all of them, so anything this function fails to see is
  // a word about to be destroyed.
  const heroes = doc.nodes
    .filter((node) => isTextNode(node) && node.role === 'hero')
    .map((node) => (node as CanvasTextNode).text)
  return {
    headline: [...heroes, first('headline')]
      .map((part) => part.trim())
      .filter(Boolean)
      .join(' '),
    body: first('body'),
  }
}

/**
 * Set the slide's whole headline, re-splitting it across the hero if one is present.
 *
 * The split is an arrangement, not a pair of independent strings — but on the canvas it looks like
 * two text layers, and the biggest one looks like "the headline". So a user who retyped either half
 * got their new wording glued to the OTHER half's leftovers: replace the poster word with "Новата
 * Формула" and the slide reads "Новата Формула която показва дали кампанията е печеливша".
 *
 * Editing therefore always operates on the sentence. Where it breaks is the lockup's decision, and
 * this is the one place that decision is re-made.
 */
export function setHeadline(doc: CanvasDoc, text: string): CanvasDoc {
  const hasHero = doc.nodes.some((node) => isTextNode(node) && node.role === 'hero')
  const split = hasHero ? splitHero(text) : { hero: '', rest: text }
  // Only the FIRST node of each role is written, which is the same rule `applyLockup`'s rejoin
  // follows and for the same reason: a user can duplicate either half to build a second line, and
  // writing the sentence into every match destroys whatever they typed into the copies. Duplicates
  // are left exactly as they are rather than blanked — an empty text node is a layer that draws
  // nothing and cannot be clicked, which is a worse thing to leave behind than a stale word.
  let heroTaken = false
  let headlineTaken = false
  const nodes = doc.nodes.map((node) => {
    if (!isTextNode(node)) return node
    if (node.role === 'hero' && !heroTaken) {
      heroTaken = true
      return { ...node, text: split.hero, textOverridden: true as const }
    }
    if (node.role === 'headline' && !headlineTaken) {
      headlineTaken = true
      return { ...node, text: split.rest, textOverridden: true as const }
    }
    return node
  })
  return { ...doc, nodes }
}

/**
 * Whether the slide's headline wording was hand-typed, on EITHER half of a split.
 *
 * `textOverridden` is stamped per node, but a split headline is one sentence in two boxes — so a
 * user who retypes the poster word has overridden the headline, whichever box they touched.
 */
function headlineOverridden(doc: CanvasDoc): boolean {
  return doc.nodes.some(
    (node) =>
      isTextNode(node) && (node.role === 'hero' || node.role === 'headline') && node.textOverridden
  )
}

/**
 * A node the lockup creates, minus its id — the caller mints ids OUTSIDE the doc transform.
 *
 * That is not a style preference. `transformDoc`'s mutate runs inside a React state updater, which
 * Strict Mode double-invokes in development; ids generated in there differ between invocations, so
 * anything the caller captured to select afterwards would point at nodes that do not exist.
 */
export type LockupMember = Omit<CanvasTextNode, 'id'> | Omit<CanvasShapeNode, 'id'>

export interface Lockup {
  id: LockupId
  pack: LockupPack
  label: string
  description: string
  /**
   * Families this lockup pins regardless of the brand style.
   *
   * Library names, never strings: an off-library family is never requested in the stylesheet, never
   * awaited, and handed to Konva raw — so the slide renders AND EXPORTS in the OS default face with
   * no error anywhere.
   */
  pinned: readonly FontFamilyName[]
  copy: (ctx: LockupContext) => LockupCopy
  /** Extra nodes, bottom-first. Empty for a pure layout. */
  members: (ctx: LockupContext) => LockupMember[]
}

/** The 1080×1350 authoring grid. 96px margins keep type clear of Instagram's 3:4 grid crop. */
const M = 96
const COL = CANVAS_WIDTH - M * 2
/** The right margin, so a lockup can hang off it instead of everything starting at x=96. */
const RIGHT = CANVAS_WIDTH - M

/**
 * Tracking as a function of size, because it is one — not a per-lockup opinion.
 *
 * Typed by hand, the catalogue gave six uppercase display headlines four different answers, two of
 * them the wrong SIGN: large capitals want tightening, not opening. Lowercase gets nothing, which is
 * the actual rule — lowercase does not ordinarily need letterspacing — while capitals need +5-12% at
 * label size and go negative once the letterforms are big enough to drift apart on their own.
 *
 * Not cosmetic: `slotCapacity` counts tracking as part of the glyph advance, so a wrong value here
 * produces a wrong character budget and mis-gates a tile.
 */
export function trackingFor(fontSize: number, uppercase = false): number | undefined {
  if (!uppercase) return undefined
  const ratio = fontSize < 32 ? 0.1 : fontSize <= 64 ? 0.03 : fontSize <= 100 ? 0 : -0.02
  const value = Math.round(fontSize * ratio)
  return value === 0 ? undefined : value
}

/**
 * Leading as a function of size. Display type wants its lines tight and body copy wants air; typed
 * by hand the catalogue ran 0.86 to 1.08 across ONE size band, where the loose end reads as two
 * separate sentences rather than one headline block.
 */
export function leadingFor(fontSize: number): number {
  if (fontSize >= 100) return 0.86
  if (fontSize >= 60) return 0.98
  if (fontSize >= 44) return 1.2
  return 1.42
}

/** The lowest a text box may reach before autofit starts shrinking it. */
export const TEXT_FLOOR = CANVAS_HEIGHT - TEXT_BOTTOM_MARGIN

/**
 * Where a text box ends once its copy wraps to `lines` lines. Mirrors Konva's auto height exactly —
 * `fontSize × lineCount × lineHeight` — sound because nothing in this app ever sets `padding`.
 */
export function textBottom(
  node: Pick<CanvasTextNode, 'y' | 'fontSize' | 'lineHeight'>,
  lines: number
): number {
  return node.y + node.fontSize * node.lineHeight * lines
}

/**
 * How many lines a slot can hold before it runs into whatever is beneath it.
 *
 * DERIVED from the slot's own geometry rather than declared per lockup, so it can never drift from
 * the numbers it describes. A headline's floor is the body's top when there is one — hitting the
 * autofit floor is not the first thing that goes wrong, colliding with the deck is.
 */
export function slotLines(
  node: Pick<CanvasTextNode, 'y' | 'fontSize' | 'lineHeight'>,
  floor: number
): number {
  return Math.max(0, Math.floor((floor - node.y) / (node.fontSize * node.lineHeight)))
}

/**
 * Average glyph advance as a share of font size.
 *
 * A deliberate approximation — the exact figure needs a loaded face and a Konva measure, and this
 * runs in a pure module with no canvas. 0.5 sits mid-range for the library's faces (condensed cuts
 * run nearer 0.4, the fatfaces nearer 0.6), which is close enough to answer the only question asked
 * of it: "is this slot for a word, a line, or a paragraph?"
 */
const AVERAGE_ADVANCE = 0.5

/**
 * Capitals are wider than the mixed-case average this figure was measured from — roughly 0.59em
 * against 0.5 — because a run of caps has no narrow x-height letters and no descenders to average
 * against. A slot that forces uppercase and budgets at 0.5 overclaims by about a sixth.
 */
const UPPERCASE_ADVANCE = 0.59

/**
 * Roughly how many characters a slot holds — its width in glyphs, times the lines it can take.
 *
 * Tracking is part of the advance, not a decoration on top of it: `label` sets +8px at 34px, which
 * is a 47% wider glyph than the bare font size implies. Ignoring it claimed 104 characters for a
 * slot that really holds about 70, and let an overflowing headline straight through the gate the
 * whole function exists to be.
 */
function slotCapacity(
  node: Pick<
    CanvasTextNode,
    'y' | 'width' | 'fontSize' | 'lineHeight' | 'uppercase' | 'letterSpacing'
  >,
  floor: number
): number {
  const glyph = node.fontSize * (node.uppercase ? UPPERCASE_ADVANCE : AVERAGE_ADVANCE)
  const advance = Math.max(1, glyph + (node.letterSpacing ?? 0))
  return Math.floor((node.width / advance) * slotLines(node, floor))
}

/**
 * The lowest a slot's text may reach: the colour block it is reversed out of, or the given floor.
 *
 * `field` sets both copy nodes to `palette.surface` because they sit on an opaque 640px-tall accent
 * block — white type that is only white-on-brand while it stays ON the block. Measured to the canvas
 * floor instead, a long headline was cleared to wrap straight off the bottom of it and finish as
 * white words on the photograph, which is the exact unreadability the whole capacity gate exists to
 * refuse. Derived from the members rather than declared, so any later lockup that reverses type out
 * of a field is bounded the same way without saying so.
 */
function blockFloor(
  lockup: Lockup,
  ctx: LockupContext,
  slot: { y: number },
  floor: number
): number {
  const under = lockup
    .members(ctx)
    .find(
      (member) => member.kind === 'rect' && slot.y >= member.y && slot.y < member.y + member.height
    )
  return under && under.kind === 'rect' ? Math.min(floor, under.y + under.height) : floor
}

/** The character budget each copy slot of this lockup affords. */
export function lockupCapacity(
  lockup: Lockup,
  ctx: LockupContext
): { headline: number; body: number; hero: number } {
  const { headline, body, hero } = lockup.copy(ctx)
  // Whichever slot is ABOVE is bounded by the one beneath it; the lower one runs to the autofit
  // floor. Symmetric on purpose — bounding only the headline assumed the body is always underneath,
  // which stops being true the moment a layout puts its supporting line above the headline.
  const headlineFloor = headline.y < body.y ? body.y : TEXT_FLOOR
  const bodyFloor = body.y < headline.y ? headline.y : TEXT_FLOOR
  const heroFloor = hero && hero.y < headline.y ? headline.y : TEXT_FLOOR
  return {
    headline: slotCapacity(headline, blockFloor(lockup, ctx, headline, headlineFloor)),
    body: slotCapacity(body, blockFloor(lockup, ctx, body, bodyFloor)),
    hero: hero ? slotCapacity(hero, blockFloor(lockup, ctx, hero, heroFloor)) : 0,
  }
}

/**
 * Whether this lockup can actually hold this slide's words.
 *
 * The picker needs it because a lockup is a SHAPE, not just a style: Stat sets its headline at
 * display size because it is built for a figure like "47%", and pouring a forty-character sentence
 * into that slot does not look bad — it runs off the canvas entirely. Offering a tile that cannot
 * work is worse than not offering it.
 *
 * Takes the LOGICAL headline — hero word rejoined — and measures the split the lockup would
 * actually produce. Measuring the raw string against the hero slot instead would grey out every
 * hero lockup permanently, since a poster slot holds about eight characters and a headline is forty.
 */
export function fitsCopy(
  lockup: Lockup,
  ctx: LockupContext,
  headline: string,
  body: string
): boolean {
  const capacity = lockupCapacity(lockup, ctx)
  if (body.length > capacity.body) return false
  if (!lockup.copy(ctx).hero) return headline.length <= capacity.headline
  const split = splitHero(headline)
  return split.hero.length <= capacity.hero && split.rest.length <= capacity.headline
}

/** Both reasons a lockup may refuse a slide's copy — both, because both can be true at once. */
export interface LockupBlock {
  /** The copy is Cyrillic and this lockup's faces have no Cyrillic letters. */
  wrongScript: boolean
  /** The copy overruns a slot whose size the lockup's geometry fixes. */
  tooMuchCopy: boolean
}

/**
 * Why this lockup cannot take this slide's copy, or neither reason when it can.
 *
 * ONE definition, because two paths ask it and they must give the same answer: the picker greys a
 * tile on it, and apply-to-all decides which slides to skip on it. Asked separately they disagreed —
 * apply-to-all checked only capacity, so a carousel whose first slide was English happily stamped a
 * Latin-only face onto a later Cyrillic one, which the picker would never have offered.
 */
export function lockupBlock(
  lockup: Lockup,
  ctx: LockupContext,
  copy: { headline: string; body: string }
): LockupBlock {
  return {
    // Keyed on the words actually on the slide, not on the client's language: a Bulgarian client
    // running an English campaign line is entitled to the Latin-only faces.
    wrongScript: hasCyrillic(`${copy.headline} ${copy.body}`) && !supportsCyrillic(lockup),
    tooMuchCopy: !fitsCopy(lockup, ctx, copy.headline, copy.body),
  }
}

/**
 * `true` only where the library hosts a real italic cut, `undefined` otherwise.
 *
 * A lockup may want italic on a font it did not choose — the brand style supplies the body face, and
 * the shipping pairings disagree. Asking anyway does not fail loudly: Konva emits `italic` into
 * `ctx.font` and the browser SLANTS THE UPRIGHT, which the font library explicitly refuses to do,
 * and it bakes into the exported JPEG.
 */
function italicIfHosted(family: FontFamilyName): true | undefined {
  return getFontEntry(family)?.italic ? true : undefined
}

interface TextMemberInput {
  role: 'kicker' | 'tagline'
  text: string
  x: number
  y: number
  width: number
  fontFamily: FontFamilyName
  fontSize: number
  fill: string
  fontWeight?: CanvasFontWeight
  align?: CanvasTextAlign
  lineHeight?: number
  uppercase?: true
  letterSpacing?: number
  /** Degrees — what lets a label run up a margin instead of everything sitting on one axis. */
  rotation?: number
}

/**
 * A created text element, with the defaults a label wants.
 *
 * Tracking is tied to the uppercase flag rather than offered freely: capitals need +5–12% to read,
 * lowercase does not want any, and a preset library that lets the two drift apart produces exactly
 * the spacing mistakes it was built to prevent.
 */
function textMember(input: TextMemberInput): LockupMember {
  return {
    kind: 'text',
    role: input.role,
    text: input.text,
    x: input.x,
    y: input.y,
    width: input.width,
    fontFamily: input.fontFamily,
    fontSize: input.fontSize,
    fontWeight: input.fontWeight ?? 700,
    fill: input.fill,
    align: input.align ?? 'left',
    lineHeight: input.lineHeight ?? leadingFor(input.fontSize),
    ...(input.uppercase ? { uppercase: true as const } : {}),
    // Through the same rule the copy nodes use. Hard-coding 8% here was correct at 24px and wrong
    // at 128px, where capitals want tightening rather than opening.
    ...(() => {
      const tracking = input.letterSpacing ?? trackingFor(input.fontSize, input.uppercase)
      return tracking === undefined ? {} : { letterSpacing: tracking }
    })(),
    ...(input.rotation !== undefined ? { rotation: input.rotation } : {}),
  }
}

/**
 * A hairline rule.
 *
 * `kind: 'line'` and never a thin rect: the Transformer gives a line a width-only branch, while
 * every other shape takes the element branch and its 40px floor on BOTH axes — so a 200×2 rect would
 * be visibly un-resizable, every drag rejected against a dead handle.
 */
function ruleMember(input: {
  x: number
  y: number
  width: number
  stroke: string
  strokeWidth?: number
}): LockupMember {
  const strokeWidth = input.strokeWidth ?? 2
  return {
    kind: 'line',
    role: 'mark',
    x: input.x,
    y: input.y,
    width: input.width,
    // A line is drawn along its box's TOP edge, so the box height IS the stroke width.
    height: strokeWidth,
    stroke: input.stroke,
    strokeWidth,
  }
}

/**
 * A filled block — a colour field behind the type, or a pill around a label.
 *
 * The catalogue had no way to make accent COLOUR MASS. Every lockup put it on a 22-32px label or a
 * 2px hairline, so the client's brand colour amounted to about one percent of the canvas and every
 * slide read as ink-on-photograph. A rect is how accent becomes the ground rather than a garnish,
 * and how a reversed lockup (surface type on a brand field) becomes expressible at all.
 *
 * A rect can be resized freely, unlike a line — the Transformer's element branch floors it at 40px
 * in BOTH axes, which is why a rule must stay a `line` and a block must not.
 */
function blockMember(input: {
  x: number
  y: number
  width: number
  height: number
  fill: string
  /** Half the height turns a block into a pill; omit for a hard-edged field. */
  cornerRadius?: number
}): LockupMember {
  return {
    kind: 'rect',
    role: 'mark',
    x: input.x,
    y: input.y,
    width: input.width,
    height: input.height,
    fill: input.fill,
    ...(input.cornerRadius !== undefined ? { cornerRadius: input.cornerRadius } : {}),
  }
}

/**
 * Copy-node patch helper — spelled out so every lockup writes every owned field.
 *
 * Leading and tracking are DERIVED from the size unless an entry insists. That is the whole reason
 * they stopped being per-lockup literals: typed by hand they contradicted each other across the
 * catalogue, and a rule expressed once can be corrected once.
 */
function copyNode(input: {
  x: number
  y: number
  width: number
  fontFamily: FontFamilyName
  fontSize: number
  fontWeight: CanvasFontWeight
  fill: string
  align: CanvasTextAlign
  /** Only when the composition genuinely wants something other than the size's own leading. */
  lineHeight?: number
  uppercase?: boolean
  italic?: true
  letterSpacing?: number
}): Pick<CanvasTextNode, LockupField> {
  return {
    x: input.x,
    y: input.y,
    width: input.width,
    fontFamily: input.fontFamily,
    fontSize: input.fontSize,
    fontWeight: input.fontWeight,
    fill: input.fill,
    align: input.align,
    lineHeight: input.lineHeight ?? leadingFor(input.fontSize),
    uppercase: input.uppercase || undefined,
    italic: input.italic,
    letterSpacing: input.letterSpacing ?? trackingFor(input.fontSize, input.uppercase),
  }
}

/** Two-digit slide index, the way a listicle numbers its items. */
function indexToken(slide: LockupContext['slide']): string {
  return String(slide.position + 1).padStart(2, '0')
}

export const LOCKUPS: readonly Lockup[] = [
  // ─── Essentials ────────────────────────────────────────────────────────────────────────────
  {
    id: 'impact',
    pack: 'essentials',
    label: 'Impact',
    description: 'One oversized statement filling the slide — the carousel hook',
    // Archivo Black reads black AT 400. The doc caps weight at 700, so impact has to come from
    // choosing a family whose regular is heavy, not from asking for a weight nobody serves.
    pinned: ['Archivo Black'],
    copy: ({ palette, fonts }) => ({
      headline: copyNode({
        x: M,
        y: 150,
        width: COL,
        fontFamily: 'Archivo Black',
        fontSize: 104,
        fontWeight: 400,
        fill: palette.ink,
        align: 'left',
        uppercase: true,
      }),
      body: copyNode({
        x: M,
        y: 1080,
        width: 760,
        fontFamily: fonts.body,
        fontSize: 30,
        fontWeight: 400,
        fill: palette.ink,
        align: 'left',
      }),
    }),
    members: () => [],
  },
  {
    id: 'editorial',
    pack: 'essentials',
    label: 'Editorial',
    description: 'Kicker, rule, headline and deck — the explainer workhorse',
    pinned: ['Playfair Display', 'Raleway'],
    copy: ({ palette }) => ({
      headline: copyNode({
        x: M,
        y: 264,
        width: COL,
        fontFamily: 'Playfair Display',
        fontSize: 82,
        fontWeight: 700,
        fill: palette.ink,
        align: 'left',
      }),
      body: copyNode({
        x: M,
        y: 980,
        width: 800,
        fontFamily: 'Raleway',
        fontSize: 32,
        fontWeight: 400,
        fill: palette.ink,
        align: 'left',
      }),
    }),
    members: ({ palette }) => [
      textMember({
        role: 'kicker',
        text: 'FEATURE',
        x: M,
        y: 150,
        width: COL,
        fontFamily: 'Raleway',
        fontSize: 24,
        fill: palette.accent,
        uppercase: true,
      }),
      ruleMember({ x: M, y: 214, width: 96, stroke: palette.accent }),
    ],
  },
  {
    id: 'index',
    pack: 'essentials',
    label: 'Index',
    description: 'A numbered item — the highest-volume carousel slide there is',
    pinned: ['Oswald', 'Nunito Sans'],
    copy: ({ palette }) => ({
      headline: copyNode({
        x: M,
        y: 372,
        width: COL,
        fontFamily: 'Oswald',
        fontSize: 62,
        fontWeight: 700,
        fill: palette.ink,
        align: 'left',
      }),
      body: copyNode({
        x: M,
        y: 1000,
        width: 800,
        fontFamily: 'Nunito Sans',
        fontSize: 30,
        fontWeight: 400,
        fill: palette.ink,
        align: 'left',
      }),
    }),
    members: ({ palette, slide }) => [
      textMember({
        role: 'kicker',
        // The slide's own position. An index numeral is CONTENT, unlike a progress counter, which
        // is chrome — a slide carrying both reads as broken, so the pack ships only this one.
        text: indexToken(slide),
        x: M,
        y: 200,
        width: 320,
        fontFamily: 'Oswald',
        fontSize: 128,
        fill: palette.accent,
      }),
    ],
  },
  {
    id: 'quote',
    pack: 'essentials',
    label: 'Quote',
    description: 'Oversized quotation mark, the words, then the attribution',
    pinned: ['Merriweather', 'Lora'],
    copy: ({ palette }) => ({
      headline: copyNode({
        x: M,
        y: 400,
        width: COL,
        fontFamily: 'Merriweather',
        fontSize: 58,
        fontWeight: 400,
        fill: palette.ink,
        align: 'left',
        italic: italicIfHosted('Merriweather'),
      }),
      body: copyNode({
        x: M,
        y: 1120,
        width: 700,
        fontFamily: 'Lora',
        fontSize: 26,
        fontWeight: 400,
        fill: palette.ink,
        align: 'left',
      }),
    }),
    members: ({ palette }) => [
      textMember({
        role: 'kicker',
        text: '“',
        x: M,
        y: 190,
        width: 300,
        fontFamily: 'Merriweather',
        fontSize: 180,
        fill: palette.accent,
      }),
      ruleMember({ x: M, y: 1040, width: 64, stroke: palette.ink }),
      textMember({
        role: 'tagline',
        text: 'NAME',
        x: M,
        y: 1064,
        width: 700,
        fontFamily: 'Lora',
        fontSize: 28,
        fill: palette.ink,
        uppercase: true,
      }),
    ],
  },
  {
    id: 'stat',
    pack: 'essentials',
    label: 'Stat',
    description: 'One number doing all the work, with its source underneath',
    pinned: ['IBM Plex Sans'],
    copy: ({ palette }) => ({
      // The headline IS the number here — the copy the slide already carries becomes the figure.
      headline: copyNode({
        x: M,
        y: 300,
        width: COL,
        fontFamily: 'IBM Plex Sans',
        fontSize: 260,
        fontWeight: 700,
        fill: palette.accent,
        align: 'left',
      }),
      body: copyNode({
        x: M,
        y: 880,
        width: 780,
        fontFamily: 'IBM Plex Sans',
        fontSize: 34,
        fontWeight: 400,
        fill: palette.ink,
        align: 'left',
      }),
    }),
    members: ({ palette }) => [
      ruleMember({ x: M, y: 1140, width: 120, stroke: palette.ink }),
      textMember({
        role: 'tagline',
        text: 'SOURCE',
        x: M,
        y: 1164,
        width: 780,
        fontFamily: 'IBM Plex Sans',
        fontSize: 22,
        fill: palette.ink,
        uppercase: true,
      }),
    ],
  },
  {
    id: 'badge',
    pack: 'essentials',
    label: 'Badge',
    description: 'A pill label over the offer, with a call to action at the foot',
    pinned: ['Bebas Neue', 'Source Sans 3'],
    copy: ({ palette }) => ({
      headline: copyNode({
        x: M,
        y: 262,
        width: COL,
        fontFamily: 'Bebas Neue',
        fontSize: 128,
        fontWeight: 400,
        fill: palette.ink,
        align: 'left',
        uppercase: true,
      }),
      body: copyNode({
        x: M,
        y: 940,
        width: 780,
        fontFamily: 'Source Sans 3',
        fontSize: 32,
        fontWeight: 400,
        fill: palette.ink,
        align: 'left',
      }),
    }),
    members: ({ palette }) => [
      textMember({
        role: 'kicker',
        text: 'NEW',
        x: M,
        y: 168,
        width: 400,
        fontFamily: 'Source Sans 3',
        fontSize: 26,
        fill: palette.accent,
        uppercase: true,
      }),
      textMember({
        role: 'tagline',
        text: 'LEARN MORE',
        x: M,
        y: 1180,
        width: 600,
        fontFamily: 'Source Sans 3',
        fontSize: 28,
        fill: palette.accent,
        uppercase: true,
      }),
      ruleMember({ x: M, y: 1224, width: 220, stroke: palette.accent }),
    ],
  },
  {
    id: 'announce',
    pack: 'essentials',
    label: 'Announce',
    description: 'Symmetric event card — the only centred layout in the pack, by design',
    pinned: ['Prata', 'Manrope'],
    copy: ({ palette }) => ({
      headline: copyNode({
        x: 140,
        y: 420,
        width: 800,
        fontFamily: 'Prata',
        fontSize: 68,
        fontWeight: 400,
        fill: palette.ink,
        align: 'center',
      }),
      body: copyNode({
        x: 200,
        y: 1030,
        width: 680,
        fontFamily: 'Manrope',
        fontSize: 28,
        fontWeight: 400,
        fill: palette.ink,
        align: 'center',
      }),
    }),
    members: ({ palette }) => [
      ruleMember({ x: 480, y: 280, width: 120, stroke: palette.accent }),
      textMember({
        role: 'kicker',
        text: 'YOU ARE INVITED',
        x: 140,
        y: 320,
        width: 800,
        fontFamily: 'Manrope',
        fontSize: 24,
        fill: palette.accent,
        align: 'center',
        uppercase: true,
      }),
      ruleMember({ x: 480, y: 960, width: 120, stroke: palette.accent }),
    ],
  },
  {
    id: 'tip',
    pack: 'essentials',
    label: 'Tip',
    description: 'A numbered tip over a single plain sentence — the quiet hook',
    pinned: ['Inter'],
    copy: ({ palette }) => ({
      headline: copyNode({
        x: M,
        y: 330,
        width: COL,
        fontFamily: 'Inter',
        fontSize: 62,
        fontWeight: 700,
        fill: palette.ink,
        align: 'left',
      }),
      body: copyNode({
        x: M,
        y: 1060,
        width: 760,
        fontFamily: 'Inter',
        fontSize: 30,
        fontWeight: 400,
        fill: palette.ink,
        align: 'left',
      }),
    }),
    members: ({ palette, slide }) => [
      textMember({
        role: 'kicker',
        text: `TIP ${indexToken(slide)}`,
        x: M,
        y: 220,
        width: 400,
        fontFamily: 'Inter',
        fontSize: 24,
        fill: palette.accent,
        uppercase: true,
      }),
    ],
  },

  {
    id: 'headliner',
    pack: 'essentials',
    label: 'Headliner',
    description: 'First word at poster scale, the rest set small against it',
    // Sofia Sans Extra Condensed at 900 is the tallest, blackest thing the library can draw, and it
    // sets Bulgarian in the default positions — so this reads as designed in either language.
    pinned: ['Sofia Sans Extra Condensed', 'Inter'],
    copy: ({ palette }) => ({
      // 168px, not the 300 this started at. Two reasons, both load-bearing:
      // - At 300 the slot held FIVE characters, so on Bulgarian copy the tile was permanently
      //   greyed out — "Ехография" is nine. At 168 it holds eleven, which covers the long Cyrillic
      //   first words as well as the short English ones.
      // - The slot must survive a word it did NOT gate. A copy rewrite writes straight through
      //   `applyCopyToDoc` with no capacity check, and autofit cannot help — it measures to the
      //   canvas floor, sees room, and leaves a two-line hero to crash through the headline below.
      //   At 168 two lines fit inside the slot, so the worst case is ugly rather than broken.
      hero: copyNode({
        x: M,
        y: 210,
        width: COL,
        fontFamily: 'Sofia Sans Extra Condensed',
        fontSize: 168,
        fontWeight: 900,
        fill: palette.ink,
        align: 'left',
        uppercase: true,
      }),
      headline: copyNode({
        x: M,
        y: 500,
        width: 700,
        fontFamily: 'Inter',
        fontSize: 34,
        fontWeight: 400,
        fill: palette.ink,
        align: 'left',
      }),
      body: copyNode({
        x: M,
        y: 1120,
        width: 700,
        fontFamily: 'Inter',
        fontSize: 26,
        fontWeight: 400,
        fill: palette.ink,
        align: 'left',
      }),
    }),
    members: ({ palette }) => [ruleMember({ x: M, y: 470, width: 700, stroke: palette.ink })],
  },
  {
    id: 'duet',
    pack: 'essentials',
    label: 'Duet',
    description: 'Two faces at the same size — the contrast lives in the letterform, not the scale',
    // Playfair rather than Bodoni Moda: both are high-contrast didones at 900, but Playfair carries
    // Cyrillic and Bodoni does not. Pinning a Latin-only face here made the ONE lockup that could
    // take a long Bulgarian first word unavailable to Bulgarian copy.
    pinned: ['Playfair', 'Sofia Sans'],
    copy: ({ palette }) => ({
      // Same size band (1.2x), two very different voices — the serif-over-script device, expressed
      // as two nodes rather than as rich text nothing in the render path could measure.
      hero: copyNode({
        x: M,
        y: 300,
        width: COL,
        fontFamily: 'Playfair',
        fontSize: 156,
        fontWeight: 900,
        fill: palette.ink,
        align: 'left',
      }),
      headline: copyNode({
        x: M,
        y: 590,
        width: COL,
        fontFamily: 'Sofia Sans',
        fontSize: 130,
        fontWeight: 400,
        fill: palette.accent,
        align: 'left',
        uppercase: true,
      }),
      body: copyNode({
        x: M,
        y: 1080,
        width: 720,
        fontFamily: 'Sofia Sans',
        fontSize: 28,
        fontWeight: 400,
        fill: palette.ink,
        align: 'left',
      }),
    }),
    members: () => [],
  },

  // ─── Layouts ───────────────────────────────────────────────────────────────────────────────
  // Six compositions answering six different questions, replacing ten that answered one. Under the
  // graphic-editorial pairing the old stack/anchor/poster/corner all resolved to the same two faces
  // in the same colour on the same x=96 axis, differing only in font size — four entries the user
  // could not tell apart. What varies here is the SKELETON: where the support sits relative to the
  // headline, which axis the type hangs on, and whether the brand colour is a garnish or the ground.
  {
    id: 'stack',
    pack: 'layouts',
    label: 'Stack',
    description: 'Big headline up top, supporting line held down at the base',
    pinned: [],
    copy: ({ palette, fonts }) => ({
      headline: copyNode({
        x: M,
        y: 120,
        width: COL,
        fontFamily: fonts.display,
        fontSize: 104,
        fontWeight: 700,
        fill: palette.ink,
        align: 'left',
        uppercase: fonts.headlineUppercase,
      }),
      body: copyNode({
        x: M,
        y: 980,
        width: 760,
        fontFamily: fonts.body,
        fontSize: 40,
        fontWeight: 400,
        fill: palette.ink,
        align: 'left',
      }),
    }),
    members: () => [],
  },
  {
    id: 'anchor',
    pack: 'layouts',
    label: 'Anchor',
    description: 'Both lines set low, the note pushed out to the opposite margin',
    // Its own condensed face rather than the brand display, because `stack` already resolves to
    // that pairing — two layouts wearing the same two faces on the same axis are one layout.
    pinned: ['Sofia Sans Extra Condensed'],
    copy: ({ palette, fonts }) => ({
      headline: copyNode({
        x: M,
        y: 780,
        width: COL,
        fontFamily: 'Sofia Sans Extra Condensed',
        fontSize: 132,
        fontWeight: 900,
        fill: palette.ink,
        align: 'left',
        uppercase: true,
      }),
      body: copyNode({
        // Hung on the RIGHT margin, so the pair reads as a spread rather than a stack.
        x: RIGHT - 700,
        y: 1080,
        width: 700,
        fontFamily: fonts.body,
        fontSize: 32,
        fontWeight: 400,
        fill: palette.ink,
        align: 'right',
      }),
    }),
    members: () => [],
  },
  {
    id: 'field',
    pack: 'layouts',
    label: 'Field',
    description: 'Type reversed out of a brand colour block — the loudest thing on the feed',
    // The one lockup where the client's colour is the GROUND rather than a garnish. Everywhere else
    // accent lands on a 24px label or a 2px rule, so it amounts to about one percent of the canvas
    // and every slide reads as ink-on-photograph regardless of the brand.
    pinned: ['Archivo Black'],
    copy: ({ palette }) => ({
      // Support ABOVE the headline: the block makes it a masthead rather than a caption, and it is
      // one of the few ways to break the top-third/bottom-quarter skeleton the catalogue was stuck in.
      body: copyNode({
        x: M,
        y: 190,
        width: 700,
        fontFamily: 'Archivo Black',
        fontSize: 28,
        fontWeight: 400,
        fill: palette.surface,
        align: 'left',
        uppercase: true,
      }),
      headline: copyNode({
        x: M,
        y: 300,
        width: COL,
        fontFamily: 'Archivo Black',
        fontSize: 100,
        fontWeight: 400,
        fill: palette.surface,
        align: 'left',
        uppercase: true,
      }),
    }),
    members: ({ palette }) => [
      blockMember({ x: 0, y: 0, width: CANVAS_WIDTH, height: 640, fill: palette.accent }),
    ],
  },
  {
    id: 'margin',
    pack: 'layouts',
    label: 'Margin',
    description: 'Headline hung on the right edge, the note answering it from the top-left',
    // The right margin. Thirty of the catalogue's thirty-six boxes used to start at x=96, so no
    // amount of size variation stopped the set reading as one layout.
    pinned: ['Playfair'],
    copy: ({ palette, fonts }) => ({
      body: copyNode({
        x: M,
        y: 190,
        width: 520,
        fontFamily: fonts.body,
        fontSize: 32,
        fontWeight: 400,
        fill: palette.ink,
        align: 'left',
      }),
      headline: copyNode({
        x: RIGHT - 792,
        y: 620,
        width: 792,
        fontFamily: 'Playfair',
        fontSize: 88,
        fontWeight: 900,
        fill: palette.ink,
        align: 'right',
      }),
    }),
    members: ({ palette }) => [
      ruleMember({ x: RIGHT - 180, y: 560, width: 180, stroke: palette.accent }),
    ],
  },
  {
    id: 'tight',
    pack: 'layouts',
    label: 'Tight',
    description: 'Headline and note interlocked as one block, with the air pushed to the edges',
    // The median gap between headline and body across the old catalogue was 569px — 42% of the
    // canvas parked empty in the middle. Here the pair reads as one object and the emptiness is a
    // margin instead, which is what the reference designs actually do.
    pinned: ['Yeseva One'],
    copy: ({ palette, fonts }) => ({
      headline: copyNode({
        x: M,
        y: 700,
        width: 820,
        fontFamily: 'Yeseva One',
        fontSize: 104,
        fontWeight: 400,
        fill: palette.ink,
        align: 'left',
      }),
      body: copyNode({
        x: M,
        y: 1010,
        width: 660,
        fontFamily: fonts.body,
        fontSize: 30,
        fontWeight: 400,
        fill: palette.ink,
        align: 'left',
      }),
    }),
    members: ({ palette }) => [
      ruleMember({ x: M, y: 960, width: 660, stroke: palette.ink, strokeWidth: 3 }),
    ],
  },
  {
    id: 'edge',
    pack: 'layouts',
    label: 'Edge',
    description: 'Condensed capitals running off the left edge — cropped on purpose',
    // A deliberate bleed. The old catalogue could not express one: a test asserted every box sat
    // fully inside the canvas, so type could never be cropped and the frame always read as a border.
    pinned: ['Bebas Neue'],
    copy: ({ palette, fonts }) => ({
      headline: copyNode({
        x: -60,
        y: 230,
        width: 1020,
        fontFamily: 'Bebas Neue',
        fontSize: 190,
        fontWeight: 400,
        fill: palette.ink,
        align: 'left',
        uppercase: true,
      }),
      body: copyNode({
        x: M,
        y: 1060,
        width: 700,
        fontFamily: fonts.body,
        fontSize: 30,
        fontWeight: 400,
        fill: palette.ink,
        align: 'left',
      }),
    }),
    members: () => [],
  },
]

/** Catalogue lookup; null for an id no longer in the catalogue. */
export function getLockup(id: LockupId): Lockup | null {
  return LOCKUPS.find((lockup) => lockup.id === id) ?? null
}

/**
 * Whether this lockup can render Cyrillic copy.
 *
 * DERIVED from the pinned families rather than declared, so it cannot drift from the font library.
 * The brand pairing is not consulted: both pairings are Cyrillic-safe by construction (guard test),
 * so a lockup that pins nothing inherits that safety.
 *
 * A real gate, not a hint. Konva writes `fontFamily` into `ctx.font` with no fallback list, so
 * Latin-only type meeting Cyrillic words produces a per-glyph OS substitution — a mixed-face line at
 * one size — and because the substitute is whatever the viewing machine has, the same doc exports
 * differently from a Mac than from a Windows box. Nothing downstream objects.
 */
export function supportsCyrillic(lockup: Lockup): boolean {
  return lockup.pinned.every((family) => getFontEntry(family)?.cyrillic === true)
}

/**
 * The families a pack pins — what the picker preloads so its tiles are not drawn in a fallback.
 *
 * Per pack, not per catalogue. The Text rail is the section the editor opens on, so preloading the
 * whole catalogue meant every editor open fetched the pinned faces of sixteen lockups before the
 * user had shown any interest in lockups at all. A pack is what is on screen; the other one loads
 * when its tab is pressed, which is the first moment its faces can be seen.
 *
 * Omitting the pack still answers for the whole catalogue — the font-claims test checks all of them.
 */
export function lockupFamilies(pack?: LockupPack): FontFamilyName[] {
  const shown = pack ? LOCKUPS.filter((lockup) => lockup.pack === pack) : LOCKUPS
  return [...new Set(shown.flatMap((lockup) => lockup.pinned))]
}

/**
 * How many nodes this lockup creates — the count the caller must mint ids for.
 *
 * The hero counts: it is created and swept exactly like a kicker, and only differs in where its
 * words come from. Ordering is hero-first and stable, because `lockupMemberIds` reuses ids by
 * position and a wobbling order would hand the rule the hero's id.
 */
export function lockupMemberCount(id: LockupId, ctx: LockupContext): number {
  const lockup = getLockup(id)
  if (!lockup) return 0
  return (lockup.copy(ctx).hero ? 1 : 0) + lockup.members(ctx).length
}

/**
 * The hero this lockup will PROMOTE into the headline instead of sweeping, if there is one.
 *
 * Deleting the small remainder line to keep only the poster word is a reasonable design move, and it
 * used to be fatal: the next lockup swept the hero, found no headline to rejoin into, and the slide
 * lost its only copy. Promotion keeps that node — which makes this one decision, taken once, that
 * three callers must agree on. `applyLockup` uses it to know what survives the sweep,
 * `lockupMemberIds` to know that the survivor's id is NOT free to lend to a created member, and
 * `lockupNodeDelta` to know it is not a removal. Re-derived independently, they disagreed: the
 * promoted node kept its id while the same id was handed to a rule, and the doc came out holding two
 * nodes with one id — colliding React keys, and every `find`-by-id aliasing onto the wrong one.
 */
function promotedHeroId(doc: CanvasDoc, id: LockupId, ctx: LockupContext): string | undefined {
  const lockup = getLockup(id)
  if (!lockup || lockup.copy(ctx).hero) return undefined
  if (doc.nodes.some((node) => isTextNode(node) && node.role === 'headline')) return undefined
  return doc.nodes.find((node) => isTextNode(node) && node.role === 'hero')?.id
}

/** The lockup-owned nodes an apply would actually remove — everything it owns bar a promoted hero. */
function sweptIds(doc: CanvasDoc, id: LockupId, ctx: LockupContext): string[] {
  const promoted = promotedHeroId(doc, id, ctx)
  return doc.nodes.filter((node) => node.id !== promoted && isLockupOwned(node)).map((n) => n.id)
}

/**
 * Ids for a lockup's members, REUSING the ids of the nodes it is about to sweep.
 *
 * Reuse is what makes re-application free: `commitHistory` decides "nothing changed" by comparing
 * the stringified doc, so fresh uuids on every click would stack an undo step and re-dirty the slide
 * even when the result is visually identical. Must be called OUTSIDE the doc transform — see
 * `LockupMember`.
 *
 * Only ids that are genuinely being swept are reusable. A promoted hero keeps its own id and is
 * therefore excluded — see `promotedHeroId`.
 */
export function lockupMemberIds(
  doc: CanvasDoc,
  id: LockupId,
  ctx: LockupContext,
  mint: () => string
): string[] {
  const reusable = sweptIds(doc, id, ctx)
  return Array.from({ length: lockupMemberCount(id, ctx) }, (_, index) => reusable[index] ?? mint())
}

/**
 * The NET change in node count, which is what the cap guard needs.
 *
 * `canAddNode` is a GROSS guard — it knows nothing about the nodes an operation is about to remove —
 * so a lockup that sweeps two and creates three must ask about ONE, or a 38-node slide is refused an
 * operation that would land it at 39.
 */
export function lockupNodeDelta(doc: CanvasDoc, id: LockupId, ctx: LockupContext): number {
  return lockupMemberCount(id, ctx) - sweptIds(doc, id, ctx).length
}

/**
 * Lay a slide's copy out in the given lockup, replacing whatever lockup was there before.
 *
 * Text the user added themselves (`custom`), pictures, their own shapes and the backdrop are the
 * slide's own content and are left exactly as they are — the same boundary `applyStyleToDoc` draws.
 *
 * The one place this DOES touch words is the hero split, and it is a round trip rather than an edit:
 * the logical headline is rejoined from whatever is on the slide, then re-divided for the lockup
 * being applied. Switching between a hero lockup and a flat one therefore returns the sentence
 * intact instead of shedding its first word each time.
 */
export function applyLockup(
  doc: CanvasDoc,
  id: LockupId,
  ctx: LockupContext,
  ids: string[]
): CanvasDoc {
  const lockup = getLockup(id)
  if (!lockup) return doc

  const patch = lockup.copy(ctx)
  // Read BEFORE the sweep — the hero node about to be removed is holding half of it.
  const copy = slideCopy(doc)
  const hasHeadline = doc.nodes.some((node) => isTextNode(node) && node.role === 'headline')

  // When there is no headline node, the FIRST hero is promoted into one instead of being swept, and
  // keeps its own id — so no extra id is minted inside a transform that must stay pure. Shared with
  // the two helpers that mint `ids`, because all three must name the same node.
  const promotedId = promotedHeroId(doc, id, ctx)

  // A hero with nowhere to put a remainder carries the WHOLE sentence rather than half of it being
  // dropped on the floor.
  const split = patch.hero
    ? hasHeadline
      ? splitHero(copy.headline)
      : { hero: copy.headline, rest: '' }
    : { hero: '', rest: copy.headline }

  // Carried across the sweep: the hero half of a split is still the headline's wording, so a word
  // typed into it must keep protecting the sentence from the next copy rewrite.
  const overridden = headlineOverridden(doc) || undefined

  const created: CanvasNode[] = []
  let nextId = 0
  const take = () => ids[nextId++]
  if (patch.hero) {
    const heroId = take()
    if (heroId) {
      // The hero being swept, so its EFFECTS survive the swap. `LOCKUP_FIELDS` deliberately excludes
      // the effects layer — shadow, outline, marker, arc are an orthogonal choice the user makes on
      // top of a layout — but building the replacement fresh threw them away anyway, so a re-apply
      // was not the no-op the id reuse assumes and switching hero lockups quietly undid the user's
      // decoration. `hidden` and `locked` are still cleared: inheriting those would resurrect them
      // onto a slide whose layout has just changed, and a hidden hero draws nothing while still
      // holding the first word of the headline.
      const previous = doc.nodes.find((node) => isTextNode(node) && node.role === 'hero')
      created.push({
        ...previous,
        id: heroId,
        kind: 'text',
        role: 'hero',
        text: split.hero,
        textOverridden: overridden,
        hidden: undefined,
        locked: undefined,
        ...patch.hero,
        // The union cannot be narrowed by construction here: `patch.hero` is a `Pick` of the text
        // node's own fields, so TypeScript sees a spread of partials rather than the complete text
        // node this provably is. `the catalogue` suite checks every lockup writes every owned field.
      } as CanvasNode)
    }
  }
  for (const member of lockup.members(ctx)) {
    const memberId = take()
    // Same reason as the hero above: a `LockupMember` is a node minus its id, and re-adding the id
    // is exactly what makes it a node — which the spread cannot express to the compiler.
    if (memberId) created.push({ ...member, id: memberId } as CanvasNode)
  }

  // Sweep first, in the same pure transform: a reused id must never be live at the moment it is
  // re-inserted, or the doc briefly holds two nodes with one id and every `find`-by-id aliases.
  const kept = doc.nodes.filter((node) => node.id === promotedId || !isLockupOwned(node))
  // ONLY the first headline-role node receives the rejoined wording. A user can duplicate the
  // headline to add a second line, and writing the sentence into every match would destroy whatever
  // they typed into the copy.
  const rejoinAt = kept.findIndex(
    (node) => node.id === promotedId || (isTextNode(node) && node.role === 'headline')
  )
  const restyled = kept.map((node, index) => {
    if (!isTextNode(node)) return node
    if (node.role === 'headline' || node.id === promotedId) {
      const patched = { ...node, ...patch.headline, role: 'headline' as const }
      if (index !== rejoinAt) return patched
      // The rejoin target must be able to SHOW what it receives: a hidden headline would swallow
      // the poster word and empty the slide's visible text without saying so.
      return { ...patched, text: split.rest, textOverridden: overridden, hidden: undefined }
    }
    if (node.role === 'body') return { ...node, ...patch.body }
    return node
  })

  // Inserted just BELOW the headline rather than appended. Array order is render order, so
  // appending would float the kicker and rule above every placed picture while the headline they
  // belong to stayed behind — one lockup, drawn on two different planes.
  const at = restyled.findIndex((node) => isTextNode(node) && node.role === 'headline')
  // With no headline to sit under, the slide's own first text node serves instead — which is the
  // same rule, not a special case. Falling straight through to `length` did the very thing the
  // paragraph above forbids, on exactly the slide that cannot spot it: one whose headline was
  // deleted, leaving a rule drawn over the picture it was meant to sit beneath.
  const under = at !== -1 ? at : restyled.findIndex(isTextNode)
  const index = under === -1 ? restyled.length : under
  return { ...doc, nodes: [...restyled.slice(0, index), ...created, ...restyled.slice(index)] }
}

/**
 * Which lockup a doc is wearing, or null once its geometry has been hand-adjusted.
 *
 * Matched on the fields a lockup OWNS plus the member roles it creates, and only against roles the
 * doc actually has — a slide with a headline but no body (single posts seed no body) still reports.
 */
export function activeLockup(doc: CanvasDoc, ctx: LockupContext): LockupId | null {
  const roled = (role: CanvasTextRole) =>
    doc.nodes.find((node) => isTextNode(node) && node.role === role) as CanvasTextNode | undefined
  const headline = roled('headline')
  const body = roled('body')
  const hero = roled('hero')
  if (!headline && !body) return null
  const ownedCount = doc.nodes.filter(isLockupOwned).length
  const matches = (node: CanvasTextNode, patch: Pick<CanvasTextNode, LockupField>) =>
    IDENTITY_FIELDS.every((field) => node[field] === patch[field])

  for (const lockup of LOCKUPS) {
    const patch = lockup.copy(ctx)
    if (lockupMemberCount(lockup.id, ctx) !== ownedCount) continue
    // The hero is checked like any other copy node. Counting owned NODES alone let a user drag the
    // 300px poster word anywhere and still be told the slide was wearing the lockup as designed —
    // while nudging the small headline by a pixel correctly cleared it.
    const heroMatches = patch.hero ? Boolean(hero) && matches(hero!, patch.hero) : !hero
    if (!heroMatches) continue
    if (headline && !matches(headline, patch.headline)) continue
    if (body && !matches(body, patch.body)) continue
    return lockup.id
  }
  return null
}
