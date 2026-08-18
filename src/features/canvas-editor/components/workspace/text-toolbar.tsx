'use client'

import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  CaseUpper,
  Highlighter,
  Italic,
  RotateCw,
} from 'lucide-react'
import { cn } from '@/utils/cn'
import { clamp } from '@/lib/canvas/clamp'
import { getFontEntry } from '@/lib/canvas/font-library'
import { CANVAS_FONT_WEIGHTS } from '@/types/canvas'
import type { CanvasFontWeight, CanvasTextNode } from '@/types/canvas'
import type { Palette } from '@/types/visual'
import { EDITOR_CONTROL, EDITOR_ICON_BUTTON, EDITOR_PRESSED, TOOLBAR_DIVIDER } from './chrome'
import { FontListbox } from './font-listbox'
import { TextEffectsPopover } from './text-effects-popover'
import { ColorPopover } from './toolbar-controls'

const WEIGHT_FALLBACK: CanvasFontWeight[] = [400, 700]
const ALIGN_ICONS = { left: AlignLeft, center: AlignCenter, right: AlignRight } as const

interface TextToolbarProps {
  node: CanvasTextNode
  palette: Palette
  /** `discrete` marks a press rather than a drag — a preset writes several range-backed fields
   *  at once, and only the control knows that is one decision rather than a gesture. */
  onChange: (patch: Partial<CanvasTextNode>, discrete?: boolean) => void
}

/** Everything you can do to the selected text, in the bar directly above the canvas. */
export function TextToolbar({ node, palette, onChange }: TextToolbarProps) {
  const italicAvailable = getFontEntry(node.fontFamily)?.italic ?? false
  return (
    <>
      <FontListbox
        value={node.fontFamily}
        text={node.text}
        onChange={(fontFamily) => onChange({ fontFamily })}
      />
      <NumberField
        label="Size"
        value={Math.round(node.fontSize)}
        min={8}
        max={400}
        onChange={(fontSize) => onChange({ fontSize })}
      />
      <select
        aria-label="Font weight"
        title="Font weight"
        value={node.fontWeight}
        onChange={(event) =>
          onChange({ fontWeight: Number(event.target.value) as CanvasFontWeight })
        }
        className={cn(EDITOR_CONTROL, 'cursor-pointer')}
      >
        {weightOptions(node.fontFamily).map((weight) => (
          <option key={weight} value={weight}>
            {weight}
          </option>
        ))}
      </select>

      <span className={TOOLBAR_DIVIDER} aria-hidden />

      <div className="flex items-center gap-0.5" role="group" aria-label="Alignment">
        {(Object.keys(ALIGN_ICONS) as Array<keyof typeof ALIGN_ICONS>).map((align) => {
          const Icon = ALIGN_ICONS[align]
          return (
            <button
              key={align}
              type="button"
              title={`Align ${align}`}
              aria-label={`Align ${align}`}
              aria-pressed={node.align === align}
              onClick={() => onChange({ align })}
              className={cn(EDITOR_ICON_BUTTON, node.align === align && EDITOR_PRESSED)}
            >
              <Icon size={15} aria-hidden />
            </button>
          )
        })}
      </div>

      <span className={TOOLBAR_DIVIDER} aria-hidden />

      <ColorPopover
        label="Text colour"
        palette={palette}
        value={node.fill}
        onChange={(fill) => onChange({ fill })}
      />

      <ToggleButton
        label="UPPERCASE"
        pressed={node.uppercase ?? false}
        onChange={(uppercase) => onChange({ uppercase: uppercase || undefined })}
        icon={<CaseUpper size={15} aria-hidden />}
      />
      <ToggleButton
        label="Italic"
        pressed={node.italic ?? false}
        // Never disable an ON toggle — a family switch must not trap the flag.
        disabled={!italicAvailable && !node.italic}
        title={italicAvailable ? 'Italic' : 'This font family has no italic face'}
        onChange={(italic) => onChange({ italic: italic || undefined })}
        icon={<Italic size={15} aria-hidden />}
      />
      <ToggleButton
        label="Marker highlight"
        pressed={Boolean(node.highlight)}
        // Clears any arc rather than disabling itself: a marker band is a straight pill measured
        // from the wrapped line, so it cannot sit under a curve. Mutual clear, not a dead control.
        onChange={(on) =>
          onChange(
            { highlight: on ? palette.accent : undefined, ...(on ? { arcBend: undefined } : {}) },
            true
          )
        }
        icon={<Highlighter size={15} aria-hidden />}
      />
      {node.highlight && (
        <ColorPopover
          label="Highlight colour"
          palette={palette}
          value={node.highlight}
          onChange={(highlight) => onChange({ highlight })}
        />
      )}

      <span className={TOOLBAR_DIVIDER} aria-hidden />

      <TextEffectsPopover node={node} onChange={onChange} />

      <span className={TOOLBAR_DIVIDER} aria-hidden />

      <NumberField
        label="Line height"
        value={node.lineHeight}
        min={0.8}
        max={3}
        step={0.05}
        onChange={(lineHeight) => onChange({ lineHeight })}
      />
      <NumberField
        label="Rotation"
        icon={<RotateCw size={13} aria-hidden />}
        value={Math.round(node.rotation ?? 0)}
        min={-180}
        max={180}
        onChange={(rotation) => onChange({ rotation })}
      />
    </>
  )
}

interface NumberFieldProps {
  label: string
  value: number
  min: number
  max: number
  step?: number
  icon?: React.ReactNode
  onChange: (value: number) => void
}

/** A compact numeric control. The label is the tooltip — the toolbar has no room for a caption. */
function NumberField({ label, value, min, max, step, icon, onChange }: NumberFieldProps) {
  return (
    <label title={label} className="inline-flex items-center gap-1 text-text3">
      {icon}
      <span className="sr-only">{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => {
          const next = Number(event.target.value)
          if (!Number.isNaN(next)) onChange(clamp(next, min, max))
        }}
        className={cn(EDITOR_CONTROL, 'w-[62px] tabular-nums')}
      />
    </label>
  )
}

function ToggleButton({
  label,
  pressed,
  disabled,
  title,
  icon,
  onChange,
}: {
  label: string
  pressed: boolean
  disabled?: boolean
  title?: string
  icon: React.ReactNode
  onChange: (pressed: boolean) => void
}) {
  return (
    <button
      type="button"
      title={title ?? label}
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={() => onChange(!pressed)}
      className={cn(EDITOR_ICON_BUTTON, pressed && EDITOR_PRESSED)}
    >
      {icon}
    </button>
  )
}

function weightOptions(fontFamily: string): CanvasFontWeight[] {
  const entry = getFontEntry(fontFamily)
  if (!entry) return WEIGHT_FALLBACK
  // Against the shared list, never a copy of it: a second hard-coded set here would keep offering
  // 700 as the ceiling long after the doc learned to store 900.
  const supported = entry.weights.filter((weight): weight is CanvasFontWeight =>
    CANVAS_FONT_WEIGHTS.includes(weight as CanvasFontWeight)
  )
  return supported.length > 0 ? supported : WEIGHT_FALLBACK
}
