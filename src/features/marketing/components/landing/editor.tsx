import { cn } from '@/utils/cn'
import { LOCKUP_FONT_VARIABLES } from '../../lib/lockup-fonts'
import { layoutsPackPreviews } from '../../lib/lockup-previews'
import { EditorFrame } from './editor-frame'
import { Reveal } from './reveal'
import { Section, SectionHead } from './section'

/**
 * What the editor is for, which is no longer "a tweak".
 *
 * The section this replaced sold a workflow — no Canva round-trip — because that was the whole of
 * what the editor did. Lockups changed the argument: a layout the client's own copy is poured into,
 * chosen from a catalogue, is a quality claim, and the workflow claim survives underneath it.
 *
 * A SERVER component. It resolves the real catalogue's geometry at build time and hands plain
 * numbers to the one client leaf that needs them, so `lockups.ts` and the font library stay out of
 * the public page's bundle.
 */
export function Editor() {
  const previews = layoutsPackPreviews()

  return (
    // The lockup faces are scoped HERE rather than to the document, so a page without this section
    // never resolves them.
    <Section id="editor" wrap="wide" className={cn(LOCKUP_FONT_VARIABLES)}>
      <SectionHead
        align="center"
        eyebrow="The editor"
        title={
          <>
            Layouts a designer would make, <em>applied in one click</em>
          </>
        }
        note="Every visual opens in a real editor — the whole carousel at once. Pick a lockup and the slide re-sets itself around your own words: the type, the scale, the rules, the colour block. Then tweak anything, or ask for a different picture without leaving the page."
        className="mb-12"
      />

      <Reveal>
        <EditorFrame previews={previews} />
      </Reveal>

      <Reveal delay={90}>
        <ul className="mt-9 grid list-none gap-px overflow-hidden rounded-card border border-line bg-line p-0 sm:grid-cols-3">
          {CLAIMS.map((claim) => (
            <li key={claim.title} className="bg-surface p-5">
              <p className="m-0 text-title font-semibold text-ink">{claim.title}</p>
              <p className="m-0 mt-1.5 text-caption text-text2">{claim.body}</p>
            </li>
          ))}
        </ul>
      </Reveal>
    </Section>
  )
}

/** The capabilities the frame cannot show, named rather than given a section each. */
const CLAIMS = [
  {
    title: 'The whole carousel, one workspace',
    body: 'Move between slides without closing anything. Every slide keeps its own undo, and one Save writes them all.',
  },
  {
    title: 'Type that stays readable',
    body: 'Kontuur measures the picture behind every line and picks a colour from the client’s own palette that holds up against it.',
  },
  {
    title: 'A different picture, in place',
    body: 'Ask for another take on the same slide, compare what comes back, keep the one you want. No export, no re-import.',
  },
]
