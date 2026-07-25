'use client'

import type { CanvasDoc, CanvasElement, CanvasFontWeight, CanvasScrim, CanvasTextLayer } from '@/types/canvas'
import type { Palette } from '@/types/visual'
import { getFontEntry } from '@/lib/canvas/font-library'
import { BackgroundControls } from './background-controls'
import { ColorSwatches } from './color-swatches'
import { ElementsSection } from './elements-section'
import { FontSelect } from './font-select'
import { EraseControls, type ErasePanelState } from './erase-controls'
import { InpaintControls, type InpaintPanelState } from './inpaint-controls'
import { LassoControls, type LassoPanelState } from './lasso-controls'
import { LayerList } from './layer-list'
import { PANEL_CONTROL, PANEL_LABEL } from './panel-styles'
import { ScrimControls } from './scrim-controls'

const WEIGHT_FALLBACK: CanvasFontWeight[] = [400, 700]
const ALIGNS: CanvasTextLayer['align'][] = ['left', 'center', 'right']

interface PropertiesPanelProps {
  doc: CanvasDoc
  palette: Palette
  selectedId: string | null
  repositionMode: boolean
  uploadingAsset: boolean
  isolating: boolean
  onSelect: (id: string) => void
  onLayerChange: (id: string, patch: Partial<CanvasTextLayer>) => void
  onAddLayer: () => void
  onRemoveLayer: (id: string) => void
  onElementChange: (id: string, patch: Partial<CanvasElement>) => void
  onMoveElement: (id: string, direction: 'up' | 'down') => void
  onRemoveElement: (id: string) => void
  onUploadElement: (file: File) => void
  onIsolateSubject: () => void
  onScrimChange: (patch: Partial<CanvasScrim>) => void
  onToggleReposition: () => void
  onBackgroundZoom: (zoom: number) => void
  onBackgroundReset: () => void
  inpaint: InpaintPanelState
  lasso: LassoPanelState
  erase: ErasePanelState
  onLassoCut: () => void
  onEraseSelected: () => void
  generatingSvg: boolean
  onGenerateSvg: (prompt: string) => void
  removingBackground: boolean
  onRemoveElementBackground: () => void
}

/** The editor's right-hand controls: text layers, elements, scrim, background. */
export function PropertiesPanel(props: PropertiesPanelProps) {
  const { doc, palette, selectedId, onSelect, onLayerChange, onAddLayer, onRemoveLayer, onScrimChange } = props
  const selected = doc.layers.find((layer) => layer.id === selectedId) ?? null

  // Focused modes take the panel over — one task, one set of controls.
  if (props.inpaint.active || props.lasso.active || props.erase.active) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', padding: '16px', overflowY: 'auto' }}>
        {props.inpaint.active && <InpaintControls inpaint={props.inpaint} />}
        {props.lasso.active && <LassoControls lasso={props.lasso} />}
        {props.erase.active && <EraseControls erase={props.erase} />}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', padding: '16px', overflowY: 'auto' }}>
      <LayerList layers={doc.layers} selectedId={selectedId} onSelect={onSelect} onAdd={onAddLayer} onRemove={onRemoveLayer} />
      {selected && <TextControls layer={selected} palette={palette} onChange={(patch) => onLayerChange(selected.id, patch)} />}
      <ElementsSection
        elements={doc.elements ?? []}
        selectedId={selectedId}
        uploading={props.uploadingAsset}
        isolating={props.isolating}
        onSelect={onSelect}
        onMove={props.onMoveElement}
        onRemove={props.onRemoveElement}
        onOpacityChange={(id, opacity) => props.onElementChange(id, { opacity })}
        onAboveTextChange={(id, aboveText) => props.onElementChange(id, { aboveText: aboveText || undefined })}
        onUpload={props.onUploadElement}
        onIsolate={props.onIsolateSubject}
        onLassoCut={props.onLassoCut}
        onEraseSelected={props.onEraseSelected}
        generatingSvg={props.generatingSvg}
        onGenerateSvg={props.onGenerateSvg}
        removingBackground={props.removingBackground}
        onRemoveBackground={props.onRemoveElementBackground}
      />
      <ScrimControls scrim={doc.scrim} palette={palette} onChange={onScrimChange} />
      <BackgroundControls
        transform={doc.backgroundTransform}
        repositionMode={props.repositionMode}
        onToggleReposition={props.onToggleReposition}
        onEnterInpaint={props.inpaint.onToggle}
        onZoom={props.onBackgroundZoom}
        onReset={props.onBackgroundReset}
      />
    </div>
  )
}

function TextControls({
  layer,
  palette,
  onChange,
}: {
  layer: CanvasTextLayer
  palette: Palette
  onChange: (patch: Partial<CanvasTextLayer>) => void
}) {
  const weights = weightOptions(layer.fontFamily)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <FontSelect value={layer.fontFamily} text={layer.text} onChange={(fontFamily) => onChange({ fontFamily })} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        <div>
          <div style={PANEL_LABEL}>Size</div>
          <input
            type="number"
            min={8}
            max={400}
            value={Math.round(layer.fontSize)}
            onChange={(event) => onChange({ fontSize: clampNumber(event.target.value, 8, 400, layer.fontSize) })}
            style={PANEL_CONTROL}
          />
        </div>
        <div>
          <div style={PANEL_LABEL}>Weight</div>
          <select
            value={layer.fontWeight}
            onChange={(event) => onChange({ fontWeight: Number(event.target.value) as CanvasFontWeight })}
            style={PANEL_CONTROL}
          >
            {weights.map((weight) => (
              <option key={weight} value={weight}>
                {weight}
              </option>
            ))}
          </select>
        </div>
        <div>
          <div style={PANEL_LABEL}>Align</div>
          <div style={{ display: 'flex', gap: '4px' }}>
            {ALIGNS.map((align) => (
              <button
                key={align}
                type="button"
                onClick={() => onChange({ align })}
                style={{
                  ...PANEL_CONTROL,
                  width: 'auto',
                  flex: 1,
                  cursor: 'pointer',
                  textTransform: 'capitalize',
                  background: layer.align === align ? 'var(--color-overlay)' : 'var(--color-page)',
                }}
              >
                {align[0]?.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div style={PANEL_LABEL}>Line height</div>
          <input
            type="number"
            min={0.8}
            max={3}
            step={0.05}
            value={layer.lineHeight}
            onChange={(event) => onChange({ lineHeight: clampNumber(event.target.value, 0.8, 3, layer.lineHeight) })}
            style={PANEL_CONTROL}
          />
        </div>
        <div>
          <div style={PANEL_LABEL}>Rotation °</div>
          <input
            type="number"
            min={-180}
            max={180}
            step={1}
            value={Math.round(layer.rotation ?? 0)}
            onChange={(event) => onChange({ rotation: clampNumber(event.target.value, -180, 180, layer.rotation ?? 0) })}
            style={PANEL_CONTROL}
          />
        </div>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--color-text-1)', cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={layer.uppercase ?? false}
          onChange={(event) => onChange({ uppercase: event.target.checked || undefined })}
        />
        UPPERCASE letters
      </label>
      <ColorSwatches label="Text colour" palette={palette} value={layer.fill} onChange={(fill) => onChange({ fill })} />
    </div>
  )
}

function weightOptions(fontFamily: string): CanvasFontWeight[] {
  const entry = getFontEntry(fontFamily)
  if (!entry) return WEIGHT_FALLBACK
  const supported = entry.weights.filter((weight): weight is CanvasFontWeight =>
    [400, 500, 600, 700].includes(weight)
  )
  return supported.length > 0 ? supported : WEIGHT_FALLBACK
}

function clampNumber(raw: string, min: number, max: number, fallback: number): number {
  const value = Number(raw)
  if (Number.isNaN(value)) return fallback
  return Math.min(Math.max(value, min), max)
}
