import { describe, expect, it } from 'vitest'
import { BRAND_STYLES } from '@/lib/visual/brand-styles'
import type { CanvasDoc, CanvasTextNode } from '@/types/canvas'
import type { Palette } from '@/types/visual'
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../constants'
import { isLockupOwned, isTextNode } from '../doc-nodes'
import { getFontEntry } from '../font-library'
import {
  LOCKUPS,
  LOCKUP_FIELDS,
  LOCKUP_PACKS,
  TEXT_FLOOR,
  activeLockup,
  applyLockup,
  fitsCopy,
  lockupCapacity,
  lockupFamilies,
  lockupBlock,
  lockupMemberCount,
  lockupMemberIds,
  lockupNodeDelta,
  setHeadline,
  slideCopy,
  leadingFor,
  slotLines,
  splitHero,
  trackingFor,
  supportsCyrillic,
  textBottom,
  type LockupContext,
} from '../lockups'
import { applyCopyToDoc } from '../seed-doc'

const palette: Palette = {
  surface: '#FFFFFF',
  ink: '#101010',
  accent: '#2E9E68',
  'accent-deep': '#14523A',
  line: '#E4E4E4',
}

/** Both brand pairings, so a lockup leaning on the style's fonts is checked under each. */
const CONTEXTS: LockupContext[] = Object.values(BRAND_STYLES).map((style) => ({
  palette,
  fonts: style.fonts,
  slide: { position: 2, total: 7 },
}))

const ctx = CONTEXTS[0]!

function textNode(role: CanvasTextNode['role'], text: string): CanvasTextNode {
  return {
    id: `${role}-1`,
    kind: 'text',
    role,
    text,
    x: 0,
    y: 0,
    width: 400,
    fontFamily: 'Manrope',
    fontSize: 40,
    fontWeight: 400,
    fill: '#000000',
    align: 'left',
    lineHeight: 1.2,
  }
}

function doc(nodes: CanvasDoc['nodes']): CanvasDoc {
  return {
    version: 2,
    canvas: { w: CANVAS_WIDTH, h: CANVAS_HEIGHT },
    background: { publicUrl: 'https://example.test/a.jpg', storagePath: 'a.jpg' },
    flattenedStoragePath: null,
    scrim: { enabled: true, color: '#FFFFFF', opacity: 0.35, mode: 'bottom' },
    nodes,
  }
}

/** A doc with the two copy nodes every lockup expects to find. */
const copyDoc = () => doc([textNode('headline', 'Five ways to grow'), textNode('body', 'Supporting line')])

/**
 * Ids the way the editor mints them — sequential and deterministic, so assertions can name them.
 *
 * The counter is module-level, standing in for `crypto.randomUUID`'s promise never to repeat itself.
 * Reset per call it did repeat: a doc built by one apply already held `minted-0`, and the next apply
 * minted `minted-0` again, which reads as the product emitting a duplicate id.
 */
let mintCount = 0
function idsFor(source: CanvasDoc, id: Parameters<typeof applyLockup>[1]) {
  return lockupMemberIds(source, id, ctx, () => `minted-${mintCount++}`)
}

const apply = (source: CanvasDoc, id: Parameters<typeof applyLockup>[1]) =>
  applyLockup(source, id, ctx, idsFor(source, id))

describe('the catalogue', () => {
  it('gives every lockup a unique id and a declared pack', () => {
    const ids = LOCKUPS.map((l) => l.id)
    expect(new Set(ids).size).toBe(ids.length)
    const packs = new Set(LOCKUP_PACKS.map((p) => p.id))
    for (const lockup of LOCKUPS) expect(packs, lockup.id).toContain(lockup.pack)
  })

  it('writes every owned field for both copy roles, so switching leaves nothing stale', () => {
    for (const context of CONTEXTS) {
      for (const lockup of LOCKUPS) {
        const patch = lockup.copy(context)
        for (const field of LOCKUP_FIELDS) {
          expect(field in patch.headline, `${lockup.id}.headline.${field}`).toBe(true)
          expect(field in patch.body, `${lockup.id}.body.${field}`).toBe(true)
        }
      }
    }
  })

  it('only ever creates lockup-owned nodes', () => {
    for (const context of CONTEXTS) {
      for (const lockup of LOCKUPS) {
        for (const member of lockup.members(context)) {
          expect(isLockupOwned({ ...member, id: 'x' }), `${lockup.id} member`).toBe(true)
        }
      }
    }
  })

  it('draws a hairline as a line and a colour field as a rect, never the reverse', () => {
    // The Transformer gives a LINE a width-only branch; every other shape takes the element branch
    // and its 40px floor on BOTH axes. So a 2px rule must be a line or it is un-resizable — and a
    // block must NOT be, because a line is nothing but its stroke and cannot be a filled field.
    for (const context of CONTEXTS) {
      for (const lockup of LOCKUPS) {
        for (const member of lockup.members(context)) {
          if (member.kind === 'text') continue
          expect(['line', 'rect'], `${lockup.id} member`).toContain(member.kind)
          if (member.kind === 'line') {
            expect(member.height, `${lockup.id} rule is a hairline`).toBeLessThanOrEqual(8)
          } else {
            expect(member.height, `${lockup.id} block clears the resize floor`).toBeGreaterThanOrEqual(40)
            expect(member.width, `${lockup.id} block clears the resize floor`).toBeGreaterThanOrEqual(40)
          }
        }
      }
    }
  })
})

describe('the line budget', () => {
  it('gives every slot room for at least one line', () => {
    for (const context of CONTEXTS) {
      for (const lockup of LOCKUPS) {
        const { headline, body } = lockup.copy(context)
        const headlineFloor = headline.y < body.y ? body.y : TEXT_FLOOR
        expect(textBottom(headline, 1), `${lockup.id} headline`).toBeLessThanOrEqual(headlineFloor)
        expect(textBottom(body, 1), `${lockup.id} body`).toBeLessThanOrEqual(TEXT_FLOOR)
      }
    }
  })

  it('never claims capacity a slot does not have', () => {
    // The slot's allowance is DERIVED from its own geometry, so this asserts the derivation stays
    // consistent with textBottom rather than re-deriving it a second way.
    for (const context of CONTEXTS) {
      for (const lockup of LOCKUPS) {
        const { headline, body } = lockup.copy(context)
        const headlineFloor = headline.y < body.y ? body.y : TEXT_FLOOR
        expect(textBottom(headline, slotLines(headline, headlineFloor)), lockup.id).toBeLessThanOrEqual(headlineFloor)
        expect(textBottom(body, slotLines(body, TEXT_FLOOR)), lockup.id).toBeLessThanOrEqual(TEXT_FLOOR)
      }
    }
  })

  it('leaves at least half the catalogue usable for ordinary social copy', () => {
    // A catalogue where most tiles are greyed out for a normal headline is not a catalogue.
    const headline = 'Five ways to grow your audience faster'
    const body = 'A short supporting line that explains the idea in one sentence.'
    const usable = LOCKUPS.filter((lockup) => fitsCopy(lockup, ctx, headline, body))
    expect(usable.length).toBeGreaterThanOrEqual(Math.ceil(LOCKUPS.length / 2))
  })

  it('refuses a display-sized slot the sentence that overflowed it', () => {
    // The regression: Stat sets its headline at display size because it is built for a figure. A
    // 38-character Bulgarian medical headline poured into that slot ran clean off the canvas.
    const sentence = 'Ехография на щитовидната жлеза в Haelan'
    const stat = LOCKUPS.find((l) => l.id === 'stat')!
    expect(lockupCapacity(stat, ctx).headline).toBeLessThan(sentence.length)
    expect(fitsCopy(stat, ctx, sentence, '')).toBe(false)
    // ...while a lockup built for a sentence still takes it.
    expect(fitsCopy(LOCKUPS.find((l) => l.id === 'editorial')!, ctx, sentence, '')).toBe(true)
  })

  it('keeps every box within a deliberate bleed of the canvas', () => {
    // Not a hard frame. A word running off the edge is a real device — the previous assertion
    // forbade it outright, which is one reason every box in the catalogue started at x=96. What is
    // still forbidden is losing MOST of an element off-screen, which is a mistake rather than a
    // choice: at least two thirds of every box has to be on the canvas.
    for (const context of CONTEXTS) {
      for (const lockup of LOCKUPS) {
        const boxes = [
          ...Object.entries(lockup.copy(context)),
          ...lockup.members(context).map((m, i) => [`member${i}`, m] as const),
        ]
        for (const [name, box] of boxes) {
          const visible =
            Math.min(box.x + box.width, CANVAS_WIDTH) - Math.max(box.x, 0)
          expect(visible / box.width, `${lockup.id}.${name} is mostly off-canvas`).toBeGreaterThan(0.66)
          expect(box.y, `${lockup.id}.${name}`).toBeGreaterThanOrEqual(0)
        }
      }
    }
  })

  it('keeps a single-line member above the autofit floor', () => {
    for (const context of CONTEXTS) {
      for (const lockup of LOCKUPS) {
        for (const member of lockup.members(context)) {
          if (member.kind !== 'text') {
            expect(member.y + member.height, `${lockup.id} rule`).toBeLessThanOrEqual(CANVAS_HEIGHT)
            continue
          }
          expect(textBottom(member, 1), `${lockup.id} member`).toBeLessThanOrEqual(TEXT_FLOOR)
        }
      }
    }
  })
})

/**
 * The silent-failure class. An off-library family is never requested, never awaited, and handed to
 * Konva raw — so the slide renders AND EXPORTS in the OS default face. A weight or italic the family
 * does not serve is synthesized by the browser and bakes in the same way.
 */
describe('font claims', () => {
  const everyTextBox = (context: LockupContext) =>
    LOCKUPS.flatMap((lockup) => [
      ...Object.entries(lockup.copy(context)).map(([role, node]) => [lockup.id, role, node] as const),
      ...lockup
        .members(context)
        .filter((m) => m.kind === 'text')
        .map((m, i) => [lockup.id, `member${i}`, m] as const),
    ])

  it('only pins families the library actually carries', () => {
    for (const lockup of LOCKUPS) {
      for (const family of lockup.pinned) {
        expect(getFontEntry(family), `${lockup.id} pins ${family}`).not.toBeNull()
      }
    }
  })

  it('never asks a family for a weight it does not serve', () => {
    for (const context of CONTEXTS) {
      for (const [id, role, node] of everyTextBox(context)) {
        const entry = getFontEntry(node.fontFamily)
        expect(entry, `${id}.${role} uses ${node.fontFamily}`).not.toBeNull()
        expect(entry!.weights, `${id}.${role}: ${node.fontFamily} has no ${node.fontWeight}`).toContain(
          node.fontWeight
        )
      }
    }
  })

  it('never claims italic on a family with no italic face', () => {
    for (const context of CONTEXTS) {
      for (const [id, role, node] of everyTextBox(context)) {
        if (!node.italic) continue
        expect(
          getFontEntry(node.fontFamily)?.italic,
          `${id}.${role}: ${node.fontFamily} has no italic face`
        ).toBe(true)
      }
    }
  })

  it('derives Cyrillic support from the pinned families rather than declaring it', () => {
    const byId = Object.fromEntries(LOCKUPS.map((l) => [l.id, l]))
    expect(supportsCyrillic(byId.stack!)).toBe(true)
    expect(supportsCyrillic(byId.tight!)).toBe(true)
    expect(supportsCyrillic(byId.editorial!)).toBe(true)
    expect(supportsCyrillic(byId.anchor!)).toBe(true)
    expect(supportsCyrillic(byId.edge!)).toBe(false)
  })

  it('reports every pinned family once, for preloading', () => {
    const families = lockupFamilies()
    expect(new Set(families).size).toBe(families.length)
    expect(families).toContain('Yeseva One')
  })
})

describe('applyLockup', () => {
  it('restyles the copy without touching its words', () => {
    const after = apply(copyDoc(), 'field')
    const headline = after.nodes.find((n) => isTextNode(n) && n.role === 'headline') as CanvasTextNode
    expect(headline.text).toBe('Five ways to grow')
    expect(headline.align).toBe('left')
    expect(headline.fontSize).toBe(100)
  })

  it('creates the members a lockup declares, below the headline in render order', () => {
    const after = apply(copyDoc(), 'editorial')
    const owned = after.nodes.filter(isLockupOwned)
    expect(owned).toHaveLength(2)
    const headlineIndex = after.nodes.findIndex((n) => isTextNode(n) && n.role === 'headline')
    for (const member of owned) {
      expect(after.nodes.indexOf(member), 'members draw under the copy').toBeLessThan(headlineIndex)
    }
  })

  it('sweeps the previous lockup rather than stacking on it', () => {
    const first = apply(copyDoc(), 'quote')
    expect(first.nodes.filter(isLockupOwned)).toHaveLength(3)
    const second = apply(first, 'tip')
    expect(second.nodes.filter(isLockupOwned)).toHaveLength(1)
    // And the copy nodes are still exactly two — nothing was duplicated or dropped.
    expect(second.nodes.filter((n) => isTextNode(n) && n.role !== 'kicker' && n.role !== 'tagline')).toHaveLength(2)
  })

  it('is byte-identical when re-applied, so it costs no undo step', () => {
    // lockupMemberIds reuses the swept nodes' ids precisely so commitHistory's structural no-op
    // guard can drop a repeat click. Fresh uuids would defeat it and re-dirty the slide.
    const once = apply(copyDoc(), 'badge')
    const twice = apply(once, 'badge')
    expect(twice).toEqual(once)
  })

  it('leaves custom text, pictures, user shapes and the scrim exactly as they were', () => {
    const custom = textNode('custom', 'My own note')
    const before = doc([
      textNode('headline', 'Headline'),
      custom,
      {
        id: 'img-1',
        kind: 'image',
        x: 10,
        y: 20,
        width: 100,
        height: 100,
        src: { publicUrl: 'https://example.test/b.png', storagePath: 'b.png' },
      },
      { id: 'rect-1', kind: 'rect', x: 5, y: 5, width: 50, height: 50, fill: '#FF0000' },
    ])
    const after = apply(before, 'stack')
    expect(after.nodes.find((n) => n.id === custom.id)).toEqual(custom)
    expect(after.nodes.find((n) => n.id === 'img-1')).toEqual(before.nodes[2])
    expect(after.nodes.find((n) => n.id === 'rect-1')).toEqual(before.nodes[3])
    expect(after.scrim).toEqual(before.scrim)
  })

  it('handles a slide that seeds no body node', () => {
    const after = apply(doc([textNode('headline', 'Just a hook')]), 'anchor')
    expect(after.nodes).toHaveLength(1)
    expect((after.nodes[0] as CanvasTextNode).y).toBe(780)
  })

  it('returns the doc untouched for an unknown id', () => {
    const before = copyDoc()
    // @ts-expect-error — an id retired from the catalogue is exactly the case this guards.
    expect(applyLockup(before, 'no-such-lockup', ctx, [])).toBe(before)
  })

  it('numbers an index from the slide it is applied to', () => {
    const after = applyLockup(copyDoc(), 'index', { ...ctx, slide: { position: 4, total: 9 } }, ['k'])
    const kicker = after.nodes.find((n) => isTextNode(n) && n.role === 'kicker') as CanvasTextNode
    expect(kicker.text).toBe('05')
  })
})

describe('the node budget', () => {
  it('reports the NET delta, because the cap guard is gross', () => {
    // A 38-node slide must not be refused an operation that lands it at 39.
    const empty = copyDoc()
    expect(lockupNodeDelta(empty, 'quote', ctx)).toBe(3)
    const withQuote = apply(empty, 'quote')
    // Three owned already; swapping to a one-member lockup frees two.
    expect(lockupNodeDelta(withQuote, 'tip', ctx)).toBe(-2)
    expect(lockupNodeDelta(withQuote, 'quote', ctx)).toBe(0)
  })

  it('predicts the change it actually makes, for every lockup and every starting doc', () => {
    // Stated against the transform rather than re-derived, because the delta and the transform
    // disagreeing is precisely how a promoted hero got counted as swept.
    for (const source of [copyDoc(), apply(copyDoc(), 'quote'), promotedDoc()]) {
      for (const lockup of LOCKUPS) {
        const change = apply(source, lockup.id).nodes.length - source.nodes.length
        expect(lockupNodeDelta(source, lockup.id, ctx), lockup.id).toBe(change)
      }
    }
  })
})

/**
 * A slide whose only copy is a hero: the poster word kept, the small remainder line deleted.
 *
 * The state that makes the next apply PROMOTE rather than sweep — and the one the id bookkeeping
 * gets wrong, because the promoted node keeps its id while the same id is still in the reuse pool.
 */
function promotedDoc(): CanvasDoc {
  const withHero = apply(copyDoc(), 'headliner')
  return {
    ...withHero,
    nodes: withHero.nodes.filter((n) => !(isTextNode(n) && n.role === 'headline')),
  }
}

describe('node ids', () => {
  it('are unique after any lockup, from any starting doc', () => {
    // The earlier promotion test reached for `stack`, which creates nothing — so there was no id to
    // lend and the collision stayed invisible. Applying a lockup with members to a promoted hero
    // handed the created rule the surviving node's own id: colliding React keys, and every
    // find-by-id aliasing onto whichever of the two came first.
    for (const source of [copyDoc(), apply(copyDoc(), 'quote'), promotedDoc()]) {
      for (const lockup of LOCKUPS) {
        const ids = apply(source, lockup.id).nodes.map((n) => n.id)
        expect(new Set(ids).size, lockup.id).toBe(ids.length)
      }
    }
  })

  it('keeps the promoted hero on its own id while the lockup still brings its members', () => {
    const trimmed = promotedDoc()
    const hero = trimmed.nodes.find((n) => isTextNode(n) && n.role === 'hero') as CanvasTextNode
    const after = apply(trimmed, 'editorial')
    const headline = after.nodes.find((n) => isTextNode(n) && n.role === 'headline') as CanvasTextNode
    expect(headline.id).toBe(hero.id)
    expect(headline.text).toBe('Five')
    expect(after.nodes.filter(isLockupOwned).length).toBe(lockupMemberCount('editorial', ctx))
  })
})

const HERO_LOCKUPS = ['headliner', 'duet'] as const

describe('the hero split', () => {

  it('takes the FIRST word, never a rearrangement', () => {
    expect(splitHero('Five ways to grow')).toEqual({ hero: 'Five', rest: 'ways to grow' })
    expect(splitHero('  Пет  начина да растеш ')).toEqual({ hero: 'Пет', rest: 'начина да растеш' })
    expect(splitHero('Solo')).toEqual({ hero: 'Solo', rest: '' })
    expect(splitHero('')).toEqual({ hero: '', rest: '' })
  })

  it('lifts the first word out and leaves the remainder on the headline', () => {
    for (const id of HERO_LOCKUPS) {
      const after = apply(copyDoc(), id)
      const hero = after.nodes.find((n) => isTextNode(n) && n.role === 'hero') as CanvasTextNode
      const headline = after.nodes.find(
        (n) => isTextNode(n) && n.role === 'headline'
      ) as CanvasTextNode
      expect(hero?.text, id).toBe('Five')
      expect(headline.text, id).toBe('ways to grow')
    }
  })

  it('rejoins the sentence when a flat lockup replaces a hero one', () => {
    const before = copyDoc()
    const original = (before.nodes[0] as CanvasTextNode).text
    const withHero = apply(before, 'headliner')
    const flat = apply(withHero, 'editorial')
    const headline = flat.nodes.find((n) => isTextNode(n) && n.role === 'headline') as CanvasTextNode
    expect(headline.text).toBe(original)
    expect(flat.nodes.some((n) => isTextNode(n) && n.role === 'hero')).toBe(false)
  })

  it('round-trips through every lockup without shedding a word', () => {
    // The property that matters: whatever route the user takes through the catalogue, the sentence
    // they typed comes back whole.
    const before = copyDoc()
    const original = (before.nodes[0] as CanvasTextNode).text
    let doc = before
    for (const lockup of LOCKUPS) doc = apply(doc, lockup.id)
    doc = apply(doc, 'stack')
    const headline = doc.nodes.find((n) => isTextNode(n) && n.role === 'headline') as CanvasTextNode
    expect(headline.text).toBe(original)
  })

  it('reports the logical headline whichever way the slide is split', () => {
    const before = copyDoc()
    expect(slideCopy(apply(before, 'headliner')).headline).toBe(slideCopy(before).headline)
  })

  it('measures the SPLIT against the slots, not the whole sentence', () => {
    const headliner = LOCKUPS.find((l) => l.id === 'headliner')!
    const capacity = lockupCapacity(headliner, ctx)
    const headline = 'Five ways to grow your audience faster'
    // The raw sentence could never fit a poster slot — the split is what makes the tile offerable.
    expect(headline.length).toBeGreaterThan(capacity.hero)
    expect(fitsCopy(headliner, ctx, headline, 'A short supporting line.')).toBe(true)
    // ...and a first word too long for the slot still declines, rather than picking another word.
    expect(fitsCopy(headliner, ctx, 'Internationalisation matters here', '')).toBe(false)
  })

  it('offers a hero lockup to real Bulgarian copy', () => {
    // The defect that made the whole feature pointless: the hero slot held five characters, so any
    // Cyrillic first word — "Ехография" is nine — greyed out every hero tile permanently.
    const bulgarian = 'Ехография на щитовидната жлеза в Haelan'
    for (const id of HERO_LOCKUPS) {
      const lockup = LOCKUPS.find((l) => l.id === id)!
      expect(supportsCyrillic(lockup), `${id} must take Cyrillic`).toBe(true)
      expect(fitsCopy(lockup, ctx, bulgarian, ''), `${id} must fit ${bulgarian}`).toBe(true)
    }
  })

  it('keeps the hand-typed flag when the halves rejoin', () => {
    // A word typed into the poster half is still the headline's wording, so it must go on
    // protecting the sentence from the next copy rewrite after the layout changes.
    const withHero = apply(copyDoc(), 'headliner')
    const edited = {
      ...withHero,
      nodes: withHero.nodes.map((n) =>
        isTextNode(n) && n.role === 'hero' ? { ...n, text: 'Seven', textOverridden: true } : n
      ),
    }
    const flat = apply(edited, 'stack')
    const headline = flat.nodes.find((n) => isTextNode(n) && n.role === 'headline') as CanvasTextNode
    expect(headline.text).toBe('Seven ways to grow')
    expect(headline.textOverridden).toBe(true)
  })

  it('refreshes both halves together, or neither', () => {
    // Half-applying produced sentences nobody wrote: hero "Seven" + rewrite "Ten tips for founders"
    // gave "Seven tips for founders", with the rewrite's own first word appearing nowhere.
    const withHero = apply(copyDoc(), 'headliner')
    const edited = {
      ...withHero,
      nodes: withHero.nodes.map((n) =>
        isTextNode(n) && n.role === 'hero' ? { ...n, text: 'Seven', textOverridden: true } : n
      ),
    }
    const rewritten = applyCopyToDoc(edited, {
      slide: { headline: 'Ten tips for founders', body: 'New body' },
    })
    expect(slideCopy(rewritten).headline).toBe('Seven ways to grow')
  })

  it('promotes the hero rather than deleting its word when no headline node is left', () => {
    const withHero = apply(copyDoc(), 'headliner')
    // The user keeps only the poster word and deletes the small remainder line.
    const trimmed = {
      ...withHero,
      nodes: withHero.nodes.filter((n) => !(isTextNode(n) && n.role === 'headline')),
    }
    const flat = apply(trimmed, 'stack')
    expect(slideCopy(flat).headline).toBe('Five')
    expect(flat.nodes.some((n) => isTextNode(n) && n.role === 'headline')).toBe(true)
  })

  it('rejoins every hero, not just the first', () => {
    const withHero = apply(copyDoc(), 'headliner')
    const hero = withHero.nodes.find((n) => isTextNode(n) && n.role === 'hero') as CanvasTextNode
    const twin = { ...withHero, nodes: [...withHero.nodes, { ...hero, id: 'hero-2', text: 'WAYS' }] }
    expect(slideCopy(twin).headline).toBe('Five WAYS ways to grow')
  })

  it('un-hides the node it rejoins into, so the words cannot vanish', () => {
    const withHero = apply(copyDoc(), 'headliner')
    const hidden = {
      ...withHero,
      nodes: withHero.nodes.map((n) =>
        isTextNode(n) && n.role === 'headline' ? { ...n, hidden: true } : n
      ),
    }
    const flat = apply(hidden, 'stack')
    const headline = flat.nodes.find((n) => isTextNode(n) && n.role === 'headline') as CanvasTextNode
    expect(headline.hidden).toBeUndefined()
  })

  it('writes the rejoined sentence into only the FIRST headline node', () => {
    const base = copyDoc()
    const headline = base.nodes[0] as CanvasTextNode
    const twin = { ...base, nodes: [...base.nodes, { ...headline, id: 'h2', text: 'Sale ends Friday' }] }
    const after = apply(twin, 'stack')
    const second = after.nodes.find((n) => n.id === 'h2') as CanvasTextNode
    expect(second.text).toBe('Sale ends Friday')
  })

  it('clears when the hero itself is hand-moved', () => {
    const withHero = apply(copyDoc(), 'headliner')
    expect(activeLockup(withHero, ctx)).toBe('headliner')
    const moved = {
      ...withHero,
      nodes: withHero.nodes.map((n) => (isTextNode(n) && n.role === 'hero' ? { ...n, y: 900 } : n)),
    }
    expect(activeLockup(moved, ctx)).toBeNull()
  })
})

describe('slot capacity', () => {
  it('counts tracking as part of the glyph advance', () => {
    // `label` sets +8px at 34px — a 47% wider glyph than the font size implies. Ignoring it claimed
    // 104 characters for a slot that really holds about 70, and let overflowing copy through.
    // `edge` sets 190px capitals, where the rule tightens by 2% — so the real advance is
    // 190*0.59-4 = 108, not the 95 a tracking-blind budget assumed. Ignoring tracking is what let
    // the old `label` entry claim 104 characters for a slot that really held about 70.
    const edge = LOCKUPS.find((l) => l.id === 'edge')!
    const patch = edge.copy(ctx).headline
    expect(patch.letterSpacing).toBe(-4)
    expect(lockupCapacity(edge, ctx).headline).toBeLessThan(
      Math.floor((patch.width / (patch.fontSize * 0.59)) * 6)
    )
  })

  it('re-divides rewritten copy instead of stranding the old word', () => {
    const withHero = apply(copyDoc(), 'headliner')
    const rewritten = applyCopyToDoc(withHero, {
      slide: { headline: 'Seven habits that stick', body: 'New body' },
    })
    const hero = rewritten.nodes.find((n) => isTextNode(n) && n.role === 'hero') as CanvasTextNode
    const headline = rewritten.nodes.find(
      (n) => isTextNode(n) && n.role === 'headline'
    ) as CanvasTextNode
    expect(hero.text).toBe('Seven')
    expect(headline.text).toBe('habits that stick')
  })

  it('retypes the whole sentence, leaving no fragment to rejoin later', () => {
    // The reported sequence. Editorial -> Headliner splits "Формулата, която показва…" into a
    // poster word plus a remainder. Retyping the poster word used to change only that half, so
    // switching back to Editorial rejoined the NEW word onto the OLD remainder and produced
    // "Новата Формула която показва дали кампанията е печеливша" — a sentence nobody wrote.
    const before = doc([
      textNode('headline', 'Формулата, която показва дали кампанията е печеливша'),
      textNode('body', 'ROI обяснение'),
    ])
    const split = apply(before, 'headliner')
    expect(slideCopy(split).headline).toBe('Формулата, която показва дали кампанията е печеливша')

    // The user double-clicks the big word; the editor hands them the SENTENCE, they replace it.
    const retyped = setHeadline(split, 'Новата Формула')
    expect(slideCopy(retyped).headline).toBe('Новата Формула')

    // ...and switching back to a flat lockup has nothing stale to glue on.
    const flat = apply(retyped, 'editorial')
    const headline = flat.nodes.find((n) => isTextNode(n) && n.role === 'headline') as CanvasTextNode
    expect(headline.text).toBe('Новата Формула')
    expect(headline.textOverridden).toBe(true)
  })

  it('sets the headline on a slide with no hero without inventing one', () => {
    const flat = doc([textNode('headline', 'Old words'), textNode('body', 'B')])
    const after = setHeadline(flat, 'New words entirely')
    expect(slideCopy(after).headline).toBe('New words entirely')
    expect(after.nodes.some((n) => isTextNode(n) && n.role === 'hero')).toBe(false)
  })

  it('is still byte-identical when re-applied', () => {
    const once = apply(copyDoc(), 'headliner')
    expect(apply(once, 'headliner')).toEqual(once)
  })

  it('writes the first node of each role and leaves a duplicated line alone', () => {
    // The rule `applyLockup`'s rejoin already follows, for the same reason: a user can duplicate
    // either half to build a second line, and writing the sentence into every match destroys what
    // they typed into the copy. setHeadline did the thing the other function documents as fatal —
    // and blanked duplicate heroes on top of it, leaving layers that draw nothing.
    const withHero = apply(copyDoc(), 'headliner')
    const hero = withHero.nodes.find((n) => isTextNode(n) && n.role === 'hero') as CanvasTextNode
    const head = withHero.nodes.find((n) => isTextNode(n) && n.role === 'headline') as CanvasTextNode
    const duplicated = {
      ...withHero,
      nodes: [
        ...withHero.nodes,
        { ...hero, id: 'hero-copy', text: 'MINE' },
        { ...head, id: 'head-copy', text: 'my own second line' },
      ],
    }
    const after = setHeadline(duplicated, 'Seven better ways')
    const byId = (id: string) => after.nodes.find((n) => n.id === id) as CanvasTextNode
    expect(byId(hero.id).text).toBe('Seven')
    expect(byId(head.id).text).toBe('better ways')
    expect(byId('hero-copy').text).toBe('MINE')
    expect(byId('head-copy').text).toBe('my own second line')
  })
})

describe('activeLockup', () => {
  it('round-trips every lockup in the catalogue', () => {
    for (const lockup of LOCKUPS) {
      expect(activeLockup(apply(copyDoc(), lockup.id), ctx), lockup.id).toBe(lockup.id)
    }
  })

  it('goes quiet once the geometry is hand-adjusted', () => {
    const applied = apply(doc([textNode('headline', 'H')]), 'field')
    const moved = { ...applied, nodes: [{ ...(applied.nodes[0] as CanvasTextNode), y: 700 }] }
    expect(activeLockup(moved, ctx)).toBeNull()
  })

  it('reports nothing for a doc with no copy roles', () => {
    expect(activeLockup(doc([textNode('custom', 'mine')]), ctx)).toBeNull()
  })

  it('survives a recoloured fill, because the contrast pass repaints every apply', () => {
    // The lockup writes a colour and `recolourForBackdrop` immediately overwrites it on any art busy
    // enough to need it — the common case. Matching identity on `fill` meant a lockup stopped
    // reporting active the moment it was applied, so the panel showed nothing selected and withheld
    // "apply to every slide", which is offered only for the active one.
    for (const lockup of LOCKUPS) {
      const applied = apply(copyDoc(), lockup.id)
      const repainted = {
        ...applied,
        nodes: applied.nodes.map((n) => (isTextNode(n) ? { ...n, fill: '#123456' } : n)),
      }
      expect(activeLockup(repainted, ctx), lockup.id).toBe(lockup.id)
    }
  })
})

describe('lockupBlock', () => {
  const cyrillic = { headline: 'Пет начина', body: 'Кратък ред' }
  const latin = { headline: 'Five ways', body: 'Short line' }

  it('refuses a Latin-only lockup for Cyrillic copy, and allows it for Latin copy', () => {
    const latinOnly = LOCKUPS.filter((lockup) => !supportsCyrillic(lockup))
    expect(latinOnly.length, 'catalogue has Latin-only lockups to test').toBeGreaterThan(0)
    for (const lockup of latinOnly) {
      expect(lockupBlock(lockup, ctx, cyrillic).wrongScript, lockup.id).toBe(true)
      expect(lockupBlock(lockup, ctx, latin).wrongScript, lockup.id).toBe(false)
    }
  })

  it('reads the words on the slide, not the client language', () => {
    // A Bulgarian client running an English campaign line is entitled to the Latin-only faces.
    const latinOnly = LOCKUPS.find((lockup) => !supportsCyrillic(lockup))!
    expect(lockupBlock(latinOnly, ctx, { headline: 'Growth', body: '' }).wrongScript).toBe(false)
  })

  it('reports both reasons independently, since a slide can fail on both', () => {
    const latinOnly = LOCKUPS.find((lockup) => !supportsCyrillic(lockup))!
    const flood = { headline: 'Пет'.repeat(200), body: 'Ред'.repeat(200) }
    const block = lockupBlock(latinOnly, ctx, flood)
    expect(block).toEqual({ wrongScript: true, tooMuchCopy: true })
  })
})

/**
 * The catalogue as a SET. Every check here failed on the previous catalogue, which is why it reads
 * as one lockup twenty times: 17 of 18 headlines in the top third, 30 of 36 boxes on one x axis,
 * accent never filling anything larger than a label, and four Layouts resolving to the same two
 * faces under the shipping brand style.
 */
describe('catalogue variety', () => {
  const layouts = LOCKUPS.filter((l) => l.pack === 'layouts')

  it('gives the Layouts pack more than one skeleton', () => {
    // Where the SUPPORT sits relative to the headline is the skeleton. All ten of the old entries
    // put it underneath.
    const above = layouts.filter((l) => {
      const { headline, body } = l.copy(ctx)
      return body.y < headline.y
    })
    expect(above.length, 'no layout puts its supporting line above the headline').toBeGreaterThanOrEqual(2)
  })

  it('hangs type on more than one axis', () => {
    const axes = new Set<string>()
    for (const lockup of layouts) {
      for (const box of Object.values(lockup.copy(ctx))) {
        axes.add(box.x < 0 ? 'bleed' : `${Math.round(box.x)}:${box.align}`)
      }
    }
    expect(axes.size, `only ${axes.size} distinct axes`).toBeGreaterThanOrEqual(4)
  })

  it('crops at least one composition off the frame on purpose', () => {
    expect(layouts.some((l) => Object.values(l.copy(ctx)).some((b) => b.x < 0))).toBe(true)
  })

  it('makes the brand colour the ground at least once, not only a garnish', () => {
    // A block covering a real share of the canvas — accent on a 24px label is decoration.
    const massive = layouts.some((lockup) =>
      lockup
        .members(ctx)
        .some(
          (m) =>
            m.kind === 'rect' &&
            m.fill === palette.accent &&
            (m.width * m.height) / (CANVAS_WIDTH * CANVAS_HEIGHT) >= 0.25
        )
    )
    expect(massive, 'accent never fills more than a quarter of any layout').toBe(true)
  })

  it('never ships two layouts wearing the same pair of faces', () => {
    for (const context of CONTEXTS) {
      const pairs = layouts.map((l) => {
        const { headline, body } = l.copy(context)
        return `${headline.fontFamily}|${body.fontFamily}`
      })
      expect(new Set(pairs).size, `duplicate face pairs: ${pairs.join(', ')}`).toBe(pairs.length)
    }
  })

  it('sets tracking and leading from the rules, never by hand', () => {
    // Typed per entry these contradicted each other — six uppercase display headlines got four
    // different tracking answers, two with the wrong sign.
    for (const context of CONTEXTS) {
      for (const lockup of LOCKUPS) {
        for (const [role, box] of Object.entries(lockup.copy(context))) {
          const where = `${lockup.id}.${role}`
          expect(box.lineHeight, `${where} leading`).toBe(leadingFor(box.fontSize))
          expect(box.letterSpacing, `${where} tracking`).toBe(
            trackingFor(box.fontSize, box.uppercase)
          )
        }
      }
    }
  })
})
