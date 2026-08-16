'use client'

import { Sparkles } from 'lucide-react'
import { cn } from '@/utils/cn'
import {
  TEXT_EFFECT_PRESETS,
  activeTextEffect,
  applyTextEffect,
  maxStrokeWidth,
  type TextEffectId,
} from '@/lib/canvas/text-effects'
import type { CanvasTextNode } from '@/types/canvas'
import { PanelSlider } from '../panel-slider'
import { EDITOR_LABEL } from './chrome'
import { ToolbarPopover } from './toolbar-popover'

interface TextEffectsPopoverProps {
  node: CanvasTextNode
  onChange: (patch: Partial<CanvasTextNode>, discrete?: boolean) => void
}

/**
 * Shadow, outline and tracking, offered as five looks rather than eight numbers.
 *
 * Presets first because nobody arrives wanting "shadowBlur 16, shadowOpacity 0.45" — they want the
 * headline to stay readable over a busy photograph. The knobs sit underneath for when the preset is
 * nearly right, and they are the same fields the preset wrote, so moving one is an adjustment
 * rather than a mode.
 */
export function TextEffectsPopover({ node, onChange }: TextEffectsPopoverProps) {
  const active = activeTextEffect(node)
  const activeLabel = TEXT_EFFECT_PRESETS.find((preset) => preset.id === active)?.label

  return (
    <ToolbarPopover
      icon={<Sparkles size={16} aria-hidden />}
      // The state travels in the label, which drives both `title` and `aria-label` — a second
      // aria attribute on a Radix trigger would announce it as a toggle, which it is not.
      label={activeLabel ? `Effects · ${activeLabel}` : 'Effects'}
      active={active !== null && active !== 'none'}
    >
      <div className="w-64">
        <h4 className={EDITOR_LABEL}>Effect</h4>
        <div role="group" aria-label="Text effect" className="grid grid-cols-3 gap-1.5">
          {TEXT_EFFECT_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              aria-pressed={active === preset.id}
              title={preset.description}
              // A preset writes several range-backed fields at once. `discrete` says that is one
              // decision, so it never folds into a slider drag that happened a moment earlier.
              onClick={() => onChange(applyTextEffect(node, preset.id), true)}
              className={cn(
                'flex cursor-pointer flex-col items-center gap-1 rounded-sm border px-1 py-1.5 transition-colors duration-150 ease-contour',
                active === preset.id
                  ? 'border-forest bg-wash'
                  : 'border-line hover:border-line2 hover:bg-ink/[0.03]'
              )}
            >
              <PresetSample id={preset.id} />
              <span className="text-micro text-text2">{preset.label}</span>
            </button>
          ))}
        </div>

        <div className="mt-3 flex flex-col gap-2">
          <PanelSlider
            label={`Letter spacing · ${node.letterSpacing ?? 0}px`}
            min={-8}
            max={40}
            step={1}
            value={node.letterSpacing ?? 0}
            onChange={(letterSpacing) => onChange({ letterSpacing: letterSpacing || undefined })}
          />
          {node.shadowColor && (
            <>
              <PanelSlider
                label={`Shadow softness · ${node.shadowBlur ?? 0}px`}
                min={0}
                max={Math.round(node.fontSize)}
                step={1}
                value={node.shadowBlur ?? 0}
                onChange={(shadowBlur) => onChange({ shadowBlur })}
              />
              <PanelSlider
                label={`Shadow strength · ${Math.round((node.shadowOpacity ?? 1) * 100)}%`}
                min={0}
                max={100}
                step={5}
                value={Math.round((node.shadowOpacity ?? 1) * 100)}
                onChange={(percent) => onChange({ shadowOpacity: percent / 100 })}
              />
            </>
          )}
          {node.stroke && (
            <PanelSlider
              label={`Outline · ${node.strokeWidth ?? 0}px`}
              min={1}
              // Capped against the font size: with tracking on, Konva strokes glyph-by-glyph, so a
              // heavy outline paints over the neighbour that was already finished.
              max={Math.max(2, maxStrokeWidth(node.fontSize))}
              step={1}
              value={node.strokeWidth ?? 1}
              onChange={(strokeWidth) => onChange({ strokeWidth })}
            />
          )}
        </div>
      </div>
    </ToolbarPopover>
  )
}

/** A two-letter sample of each look, so the tile shows the effect rather than naming it. */
function PresetSample({ id }: { id: TextEffectId }) {
  const base = 'grid h-7 w-full place-items-center rounded-xs bg-sunken text-body font-semibold'
  if (id === 'shadow') {
    return <span className={cn(base, '[text-shadow:0_1px_3px_rgba(0,0,0,0.55)]')}>Aa</span>
  }
  if (id === 'lift') {
    return <span className={cn(base, '[text-shadow:0_0_10px_rgba(0,0,0,0.45)]')}>Aa</span>
  }
  if (id === 'outline') {
    return (
      <span
        className={cn(base, 'text-paper')}
        // `paint-order` matches Konva's `fillAfterStrokeEnabled: true` — without it the browser
        // paints the stroke over the glyph and the tile shows a thinner ring than you get.
        style={{ WebkitTextStroke: '1.5px var(--ink)', paintOrder: 'stroke fill' }}
      >
        Aa
      </span>
    )
  }
  if (id === 'spaced') return <span className={cn(base, 'tracking-[0.28em]')}>Aa</span>
  return <span className={base}>Aa</span>
}
