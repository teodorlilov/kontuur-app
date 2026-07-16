'use client'

import { useRef, useState } from 'react'
import {
  resolve,
  setChromeParam,
  setLayerRotation,
  setLayerSize,
  setPlateCutout,
  setPlateSrc,
  setPlateTreatment,
  setShapeFillRole,
  setTextContent,
  updateTextStyle,
  type Binding,
  type BrandTokens,
  type ColorRole,
  type Composition,
  type Layer,
  type Treatment,
} from '@/lib/scene-graph'

const ROLES: ColorRole[] = ['surface', 'ink', 'accent', 'accent-deep', 'line']
const WEIGHTS = [300, 400, 500, 600, 700, 800, 900]
const TREATMENTS: Treatment[] = ['none', 'duotone', 'tint', 'grain', 'mono', 'halftone']
const ALIGNS: Array<'left' | 'center' | 'right'> = ['left', 'center', 'right']

type Edit = (mutate: (c: Composition) => Composition) => void

const label: React.CSSProperties = {
  fontSize: 9,
  fontWeight: 500,
  letterSpacing: 1.2,
  textTransform: 'uppercase',
  color: 'var(--color-muted)',
  marginBottom: 5,
}
const row: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4 }
const num: React.CSSProperties = {
  width: '100%',
  fontSize: 12,
  padding: '5px 7px',
  borderRadius: 7,
  border: '0.5px solid var(--color-border-1)',
  background: 'var(--color-surface)',
  color: 'var(--color-text-1)',
}

/** The active brand role a colour binding points at, or null when it's a literal override. */
function boundRole(binding: Binding<string>): ColorRole | null {
  return binding.mode === 'bound' && binding.token.startsWith('color.')
    ? (binding.token.slice('color.'.length) as ColorRole)
    : null
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        fontSize: 11,
        padding: '4px 9px',
        borderRadius: 7,
        border: `0.5px solid ${active ? 'var(--color-ink)' : 'var(--color-border-1)'}`,
        background: active ? 'var(--color-ink)' : 'transparent',
        color: active ? 'var(--color-surface)' : 'var(--color-text-2)',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  )
}

function RoleSwatches({ tokens, active, onPick }: { tokens: BrandTokens; active: ColorRole | null; onPick: (r: ColorRole) => void }) {
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {ROLES.map((role) => (
        <button
          key={role}
          title={role}
          onClick={() => onPick(role)}
          style={{
            width: 22,
            height: 22,
            borderRadius: 6,
            background: tokens.color[role],
            border: `2px solid ${active === role ? 'var(--color-ink)' : 'var(--color-border-1)'}`,
            cursor: 'pointer',
            flexShrink: 0,
          }}
        />
      ))}
    </div>
  )
}

function TextControls({ layer, tokens, onEdit }: { layer: Extract<Layer, { type: 'text' }>; tokens: BrandTokens; onEdit: Edit }) {
  const size = Math.round(resolve<number>(layer.size, tokens))
  const weight = resolve<number>(layer.weight, tokens)
  const align = resolve<'left' | 'center' | 'right'>(layer.align, tokens)
  return (
    <>
      <div style={row}>
        <div style={label}>Text</div>
        <textarea
          value={layer.content}
          onChange={(e) => onEdit((c) => setTextContent(c, layer.id, e.target.value))}
          rows={2}
          style={{ ...num, resize: 'vertical', lineHeight: 1.3 }}
        />
      </div>
      <div style={row}>
        <div style={label}>Size</div>
        <input type="number" value={size} min={1} onChange={(e) => onEdit((c) => updateTextStyle(c, layer.id, { size: Number(e.target.value) }))} style={num} />
      </div>
      <div style={row}>
        <div style={label}>Weight</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          {WEIGHTS.map((w) => (
            <Chip key={w} active={weight === w} onClick={() => onEdit((c) => updateTextStyle(c, layer.id, { weight: w }))}>
              {w}
            </Chip>
          ))}
        </div>
      </div>
      <div style={row}>
        <div style={label}>Align</div>
        <div style={{ display: 'flex', gap: 5 }}>
          {ALIGNS.map((a) => (
            <Chip key={a} active={align === a} onClick={() => onEdit((c) => updateTextStyle(c, layer.id, { align: a }))}>
              {a}
            </Chip>
          ))}
        </div>
      </div>
      <div style={row}>
        <div style={label}>Colour</div>
        <RoleSwatches tokens={tokens} active={boundRole(layer.color)} onPick={(role) => onEdit((c) => updateTextStyle(c, layer.id, { colorRole: role }))} />
      </div>
    </>
  )
}

/**
 * AI design actions for a plate: regenerate from a prompt, seed from a reference image, or cut out the
 * subject (background removal). All hit `plate-edit` and stay on-brand via the brand reference images.
 */
function PlateAiControls({
  clientId,
  layerId,
  plateSrc,
  onEdit,
}: {
  clientId: string
  layerId: string
  plateSrc: string
  onEdit: Edit
}) {
  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const run = async (payload: Record<string, unknown>, apply: (c: Composition, url: string) => Composition) => {
    if (busy) return
    setBusy(true)
    try {
      const res = await fetch(`/api/clients/${clientId}/plate-edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = (await res.json().catch(() => ({}))) as { url?: string | null }
      if (data.url) onEdit((c) => apply(c, data.url as string))
    } finally {
      setBusy(false)
    }
  }

  const toSrc = (c: Composition, url: string) => setPlateSrc(c, layerId, url)

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-picking the same file
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => void run({ mode: 'reference', prompt, referenceDataUrl: reader.result }, toSrc)
    reader.readAsDataURL(file)
  }

  return (
    <div style={row}>
      <div style={label}>AI design</div>
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Describe the design…"
        rows={2}
        style={{ ...num, resize: 'vertical', lineHeight: 1.3 }}
      />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        <Chip active={false} onClick={() => void run({ mode: 'regenerate', prompt }, toSrc)}>
          {busy ? 'Working…' : 'Regenerate'}
        </Chip>
        <Chip active={false} onClick={() => fileRef.current?.click()}>
          Reference…
        </Chip>
        {plateSrc && (
          <Chip
            active={false}
            onClick={() => void run({ mode: 'cutout', imageUrl: plateSrc }, (c, url) => setPlateCutout(c, layerId, true, url))}
          >
            Cut out
          </Chip>
        )}
        <input ref={fileRef} type="file" accept="image/*" onChange={onFile} style={{ display: 'none' }} />
      </div>
    </div>
  )
}

function PlateControls({
  layer,
  tokens,
  onEdit,
  clientId,
}: {
  layer: Extract<Layer, { type: 'plate' }>
  tokens: BrandTokens
  onEdit: Edit
  clientId?: string
}) {
  const treatment = resolve<Treatment>(layer.treatment, tokens)
  return (
    <>
      {!layer.cutout && (
        <div style={row}>
          <div style={label}>Treatment</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {TREATMENTS.map((t) => (
              <Chip key={t} active={treatment === t} onClick={() => onEdit((c) => setPlateTreatment(c, layer.id, t))}>
                {t}
              </Chip>
            ))}
          </div>
        </div>
      )}
      {clientId && <PlateAiControls clientId={clientId} layerId={layer.id} plateSrc={layer.src} onEdit={onEdit} />}
    </>
  )
}

function ShapeControls({ layer, tokens, onEdit }: { layer: Extract<Layer, { type: 'shape' }>; tokens: BrandTokens; onEdit: Edit }) {
  return (
    <div style={row}>
      <div style={label}>Fill</div>
      <RoleSwatches tokens={tokens} active={boundRole(layer.fill)} onPick={(role) => onEdit((c) => setShapeFillRole(c, layer.id, role))} />
    </div>
  )
}

/** Chrome decorations (rules, frames, dot grids, annotations…) — the common numeric knob is the stroke
 *  width; position/size come from TransformControls. */
function ChromeControls({ layer, tokens, onEdit }: { layer: Extract<Layer, { type: 'chrome' }>; tokens: BrandTokens; onEdit: Edit }) {
  const raw = layer.params.strokeWidth ? resolve(layer.params.strokeWidth as Binding<number>, tokens) : 2
  const sw = typeof raw === 'number' ? Math.round(raw) : 2
  return (
    <div style={row}>
      <div style={label}>Stroke width</div>
      <input type="number" min={1} value={sw} onChange={(e) => onEdit((c) => setChromeParam(c, layer.id, 'strokeWidth', Number(e.target.value)))} style={num} />
    </div>
  )
}

function TransformControls({ layer, onEdit }: { layer: Layer; onEdit: Edit }) {
  const { w, h, rotate } = layer.rect
  return (
    <>
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ ...row, flex: 1 }}>
          <div style={label}>Width</div>
          <input type="number" value={Math.round(w)} min={1} onChange={(e) => onEdit((c) => setLayerSize(c, layer.id, Number(e.target.value), h))} style={num} />
        </div>
        <div style={{ ...row, flex: 1 }}>
          <div style={label}>Height</div>
          <input type="number" value={Math.round(h)} min={1} onChange={(e) => onEdit((c) => setLayerSize(c, layer.id, w, Number(e.target.value)))} style={num} />
        </div>
      </div>
      <div style={row}>
        <div style={label}>Rotation {Math.round(rotate)}°</div>
        <input
          type="range"
          min={-180}
          max={180}
          value={rotate}
          onChange={(e) => onEdit((c) => setLayerRotation(c, layer.id, Number(e.target.value)))}
          style={{ width: '100%' }}
        />
      </div>
    </>
  )
}

/**
 * The visual editor's property panel: controls for the selected layer, all routed through the pure
 * `scene-graph/edit` model (tested), so this is thin presentational glue. Text gets content/size/weight/
 * align/colour; plate gets a treatment; shape gets a fill; every layer gets width/height/rotation. Colours
 * bind to brand roles so edits stay on-brand and recolour with the kit.
 */
export function LayerPropertyPanel({
  layer,
  tokens,
  onEdit,
  clientId,
}: {
  layer: Layer
  tokens: BrandTokens
  onEdit: Edit
  clientId?: string
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'capitalize' }}>{layer.name || layer.type}</div>
      {layer.type === 'text' && <TextControls layer={layer} tokens={tokens} onEdit={onEdit} />}
      {layer.type === 'plate' && <PlateControls layer={layer} tokens={tokens} onEdit={onEdit} clientId={clientId} />}
      {layer.type === 'shape' && <ShapeControls layer={layer} tokens={tokens} onEdit={onEdit} />}
      {layer.type === 'chrome' && <ChromeControls layer={layer} tokens={tokens} onEdit={onEdit} />}
      <TransformControls layer={layer} onEdit={onEdit} />
    </div>
  )
}
