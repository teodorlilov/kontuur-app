'use client'

import { AlertTriangle, ChevronLeft, Contrast, Keyboard, Redo2, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/utils/cn'
import { EDITOR_ICON_BUTTON } from './chrome'

interface TopBarProps {
  /** Where you are in the carousel. Derived here, so nothing upstream can name the slide twice. */
  position: number
  slideCount: number
  /** The overflowing layers' text; empty when everything fits. */
  overflowing: string[]
  onAutoFit: () => void
  /**
   * Layers the picture is swallowing — text whose colour no palette entry can rescue.
   *
   * A warning rather than a repaint. A lockup that MOVED the text resolves its own colours, because
   * it chose the position; text the user placed keeps the colour they chose, and this says why it
   * is hard to read instead of overriding them.
   */
  lowContrast: string[]
  canUndo: boolean
  canRedo: boolean
  undo: () => void
  redo: () => void
  saving: boolean
  /** Slides finished out of slides in the run — only set while several are saving at once. */
  progress: { done: number; total: number } | null
  canSave: boolean
  /** Carrying a look onto the siblings stays available with nothing dirty — it is its own action. */
  canApplyStyle: boolean
  onCancel: () => void
  onSave: () => void
  /** Opens the apply-style panel. Absent on a single-slide post, which has nothing to apply to. */
  onApplyStyle?: () => void
  onShowShortcuts: () => void
  /**
   * What the editor is working on, rendered by the overlay that owns the job list.
   *
   * Passed in rather than read here: the header's job is to lay out what it is given, and reaching
   * into the registry from a presentational bar would give the same list two owners.
   */
  jobs?: React.ReactNode
}

/**
 * The editor's header: where you are, what is wrong with the design, and the two ways out. The
 * editor is a place you go rather than a page you browse, so the way back is explicit.
 */
export function TopBar(props: TopBarProps) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-paper px-3">
      <button
        type="button"
        onClick={props.onCancel}
        title="Back to the post"
        aria-label="Back to the post"
        className={EDITOR_ICON_BUTTON}
      >
        <ChevronLeft size={16} aria-hidden />
      </button>
      <span className="font-sans text-body font-medium text-ink">
        {props.slideCount > 1
          ? `Slide ${props.position + 1} of ${props.slideCount}`
          : 'Post visual'}
      </span>

      {props.overflowing.length > 0 && (
        <span className="inline-flex items-center gap-2 text-micro text-danger">
          <AlertTriangle size={13} aria-hidden />
          <span title={`Does not fit: ${props.overflowing.join(' · ')}`}>
            {props.overflowing.length === 1
              ? `"${props.overflowing[0]}" overflows`
              : `${props.overflowing.length} text layers overflow`}
          </span>
          <button
            type="button"
            onClick={props.onAutoFit}
            className="rounded-xs px-1 py-px underline underline-offset-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest"
          >
            Auto-fit
          </button>
        </span>
      )}

      {props.lowContrast.length > 0 && (
        <span
          className="inline-flex items-center gap-1.5 text-micro text-text2"
          title={`Hard to read against the picture: ${props.lowContrast.join(' · ')}. Try a backdrop behind it, a different colour, or moving the layer.`}
        >
          <Contrast size={13} aria-hidden />
          {props.lowContrast.length === 1
            ? `"${props.lowContrast[0]}" is hard to read`
            : `${props.lowContrast.length} layers are hard to read`}
        </span>
      )}

      <span className="flex-1" />

      {/* Before the icon row, so a running job sits beside the words it belongs with rather than
          among the controls — and it takes no space at all when nothing is running. */}
      {props.jobs}

      <button
        type="button"
        onClick={props.onShowShortcuts}
        title="Keyboard shortcuts (?)"
        aria-label="Keyboard shortcuts"
        className={EDITOR_ICON_BUTTON}
      >
        <Keyboard size={16} aria-hidden />
      </button>
      <button
        type="button"
        title="Undo (⌘Z)"
        aria-label="Undo"
        disabled={!props.canUndo}
        onClick={props.undo}
        className={EDITOR_ICON_BUTTON}
      >
        <Undo2 size={16} aria-hidden />
      </button>
      <button
        type="button"
        title="Redo (⇧⌘Z)"
        aria-label="Redo"
        disabled={!props.canRedo}
        onClick={props.redo}
        className={cn(EDITOR_ICON_BUTTON, 'mr-1')}
      >
        <Redo2 size={16} aria-hidden />
      </button>

      <Button variant="secondary" size="sm" onClick={props.onCancel}>
        Cancel
      </Button>
      {props.onApplyStyle && (
        <Button
          variant="secondary"
          size="sm"
          disabled={!props.canApplyStyle}
          onClick={props.onApplyStyle}
          title="Carry this slide's type and backdrop onto the other slides (each keeps its own words)"
        >
          Apply style…
        </Button>
      )}
      {/* The one commitment in this header, and so the one lime answer on the screen. */}
      <Button size="sm" loading={props.saving} disabled={!props.canSave} onClick={props.onSave}>
        {props.progress
          ? `Saving ${Math.min(props.progress.done + 1, props.progress.total)}/${props.progress.total}…`
          : 'Save'}
      </Button>
    </header>
  )
}
