'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { Spinner } from '@/components/ui/spinner'
import { VisualFrame } from '@/components/posts/review/visual-frame'
import type { CanvasDoc } from '@/types/canvas'
import { cn } from '@/utils/cn'
import { renderStylePreview, styledDoc, takesStyle } from '../../lib/style-preview'

/** One row: the slide, its doc as it stood when the panel opened, and whether it can take a style. */
interface StyleTarget {
  position: number
  doc: CanvasDoc | undefined
  eligible: boolean
}

/** What one opening of the panel works from — frozen, so no later commit can move it. */
interface StyleSession {
  source: CanvasDoc
  targets: StyleTarget[]
}

/** Stable empty list, so a closed panel does not hand its effects a fresh array every render. */
const EMPTY_TARGETS: StyleTarget[] = []

interface ApplyStylePanelProps {
  open: boolean
  onClose: () => void
  /** The slide whose look is being carried. Excluded from the list — see `eligible` below. */
  sourcePosition: number
  positions: number[]
  docsByPosition: Map<number, CanvasDoc>
  onApply: (positions: number[], source: CanvasDoc) => void
  onUndo: (positions: number[]) => void
}

/**
 * Carry one slide's look onto the others, with a picture of the result before you commit to it.
 *
 * This replaces a server-side "Save & apply to all" that wrote every sibling immediately and
 * reported nothing back. Everything here happens in the editor's own per-slide histories: each
 * slide gets its own undo step, nothing is written until Save, and the previews are the same
 * transform the Apply performs, so what you see is what you get.
 */
export function ApplyStylePanel(props: ApplyStylePanelProps) {
  const { open, sourcePosition, positions, docsByPosition } = props

  const [session, setSession] = useState<StyleSession | null>(null)
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [previews, setPreviews] = useState<Map<number, string>>(new Map())
  const [building, setBuilding] = useState(false)
  const [applied, setApplied] = useState<number[] | null>(null)

  /**
   * Everything the panel works from is snapshotted ONCE, when it opens.
   *
   * Not just for consistency — `docsByPosition` is rebuilt on every doc commit, INCLUDING the one
   * this panel's own Apply performs. Deriving the rows from it live meant applying re-ran this
   * effect, which reset `applied` and put the footer back to "Apply to N slides" as though nothing
   * had happened. The style HAD been carried; the second press was a no-op that only made the
   * confirmation stick. Anything keyed on the live map has the same defect available to it.
   */
  useEffect(() => {
    if (!open) {
      setSession(null)
      setApplied(null)
      return
    }
    const source = docsByPosition.get(sourcePosition)
    if (!source) return
    // The source is never in its own list. Applying a doc to itself is not the no-op it looks like:
    // `applyStyleToDoc` matches the FIRST node of each role, so a slide holding a duplicated
    // headline would have the copy snapped onto the original's position and size.
    const targets = positions
      .filter((position) => position !== sourcePosition)
      .map((position) => {
        const doc = docsByPosition.get(position)
        return { position, doc, eligible: Boolean(doc && takesStyle(doc)) }
      })
    setSession({ source, targets })
    setApplied(null)
    // Everything eligible starts ticked: the action is "apply to the others", and unticking one is
    // the exception.
    setChecked(new Set(targets.filter((target) => target.eligible).map((t) => t.position)))
    // Open-only by design — see above. `docsByPosition` and `positions` are read, never depended on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sourcePosition])

  const source = session?.source ?? null
  const targets = session?.targets ?? EMPTY_TARGETS

  // Previews are built one at a time. Each one raises a whole offscreen Konva stage and rasterizes
  // it on the main thread, so rendering nine at once would jank the editor behind the dialog.
  useEffect(() => {
    if (!session) return
    let cancelled = false
    const urls: string[] = []
    setBuilding(true)
    void (async () => {
      for (const target of session.targets) {
        if (cancelled) break
        if (!target.eligible || !target.doc) continue
        try {
          const url = await renderStylePreview(styledDoc(target.doc, session.source))
          if (cancelled) {
            URL.revokeObjectURL(url)
            break
          }
          urls.push(url)
          setPreviews((current) => new Map(current).set(target.position, url))
        } catch {
          // One slide whose asset will not load must not block the rest, and the apply itself is a
          // pure doc transform that cannot fail — so this row keeps its checkbox and loses only
          // its picture.
        }
      }
      if (!cancelled) setBuilding(false)
    })()
    return () => {
      cancelled = true
      for (const url of urls) URL.revokeObjectURL(url)
      setPreviews(new Map())
    }
  }, [session])

  const toggle = useCallback((position: number) => {
    setChecked((current) => {
      const next = new Set(current)
      if (!next.delete(position)) next.add(position)
      return next
    })
  }, [])

  const selected = targets.filter((t) => t.eligible && checked.has(t.position)).map((t) => t.position)
  const anyEligible = targets.some((t) => t.eligible)

  return (
    <Modal open={open} onClose={props.onClose} title="Apply this slide’s style" maxWidth={640}>
      <div className="flex flex-col gap-4">
        <p className="m-0 text-caption text-text2">
          Slide {sourcePosition + 1}’s type and scrim are carried onto the slides you tick — position,
          width, font, size, weight, colour, alignment, line spacing and any tilt, plus caps,
          italics, any marker highlight, any shadow, outline or tracking, and the scrim over the
          picture.{' '}
          <b className="font-medium text-ink">Each slide keeps its own words</b>, and nothing is
          written until you press Save.
        </p>

        {!anyEligible ? (
          <p className="m-0 rounded-sm bg-sunken p-4 text-caption text-text2">
            No other slide has a headline or body to restyle. Only those roles take a style — a text
            layer you added yourself is left alone.
          </p>
        ) : (
          <>
            <div role="group" aria-label="Slides to restyle" className="grid grid-cols-4 gap-3">
              {targets.map((target) => {
                const url = previews.get(target.position)
                const isChecked = target.eligible && checked.has(target.position)
                return (
                  <label
                    key={target.position}
                    className={cn(
                      'flex cursor-pointer flex-col gap-1.5 rounded-sm border-2 p-1 transition-colors duration-150 ease-contour',
                      isChecked ? 'border-forest' : 'border-transparent hover:border-line2',
                      !target.eligible && 'cursor-not-allowed opacity-45'
                    )}
                  >
                    <span className="overflow-hidden rounded-xs">
                      <VisualFrame
                        visual={url ? { status: 'done', publicUrl: url } : { status: 'generating' }}
                        size="panel"
                        alt=""
                      />
                    </span>
                    <span className="flex items-center gap-1.5 px-0.5">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        disabled={!target.eligible || applied !== null}
                        onChange={() => toggle(target.position)}
                        // The app's checkbox idiom, also hand-written in mode-bar and the ideas
                        // rows. Not extracted here: that is a third site outside this wave.
                        className="size-3.5 accent-forest"
                      />
                      <span className="text-micro tabular-nums text-text2">
                        Slide {target.position + 1}
                        {!target.eligible && ' · no headline or body'}
                      </span>
                    </span>
                  </label>
                )
              })}
            </div>

            {building && (
              <span className="flex items-center gap-2 text-micro text-text3">
                <Spinner size="sm" /> Building previews…
              </span>
            )}
          </>
        )}

        <div className="flex items-center justify-end gap-2 border-t border-line pt-4">
          {applied ? (
            <>
              <span className="mr-auto text-caption text-text2">
                Applied to {slideList(applied)}. Save to keep it.
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  props.onUndo(applied)
                  setApplied(null)
                }}
              >
                Undo
              </Button>
              <Button size="sm" onClick={props.onClose}>
                Done
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" size="sm" onClick={props.onClose}>
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={selected.length === 0 || !source}
                onClick={() => {
                  if (!source) return
                  props.onApply(selected, source)
                  setApplied(selected)
                }}
              >
                {selected.length === 1
                  ? 'Apply to 1 slide'
                  : `Apply to ${selected.length} slides`}
              </Button>
            </>
          )}
        </div>
      </div>
    </Modal>
  )
}

/** "slides 2, 4 and 5" — the panel says which, because the user is not looking at them. */
function slideList(positions: number[]): string {
  const numbers = positions.map((position) => position + 1)
  if (numbers.length === 1) return `slide ${numbers[0]}`
  return `slides ${numbers.slice(0, -1).join(', ')} and ${numbers[numbers.length - 1]}`
}
