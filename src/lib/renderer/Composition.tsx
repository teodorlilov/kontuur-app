import type { BrandTokens, Composition as CompositionType, GroupLayer, Layer } from '@/lib/scene-graph'
import { baseLayerStyle } from './layer-style'
import { MarkView, PlateView, ShapeView, TextView } from './layers'
import { ChromeView } from './chrome'

type RenderProps = { tokens: BrandTokens; marks?: Record<string, string> }

/** Renders a composition's layers in array order — index 0 paints first (bottom). */
export function Composition({ composition, tokens, marks }: { composition: CompositionType } & RenderProps) {
  return (
    <>
      {composition.layers.map((layer) => (
        <LayerView key={layer.id} layer={layer} tokens={tokens} marks={marks} />
      ))}
    </>
  )
}

/** Dispatches one layer to its component by discriminant. */
function LayerView({ layer, tokens, marks }: { layer: Layer } & RenderProps) {
  switch (layer.type) {
    case 'plate':
      return <PlateView layer={layer} tokens={tokens} />
    case 'text':
      return <TextView layer={layer} tokens={tokens} />
    case 'mark':
      return <MarkView layer={layer} tokens={tokens} marks={marks} />
    case 'shape':
      return <ShapeView layer={layer} tokens={tokens} />
    case 'chrome':
      return <ChromeView layer={layer} tokens={tokens} />
    case 'group':
      return <GroupView layer={layer} tokens={tokens} marks={marks} />
    default:
      return null
  }
}

/** A positioned container whose children lay out relative to it. */
function GroupView({ layer, tokens, marks }: { layer: GroupLayer } & RenderProps) {
  return (
    <div style={baseLayerStyle(layer, tokens)}>
      {layer.children.map((child) => (
        <LayerView key={child.id} layer={child} tokens={tokens} marks={marks} />
      ))}
    </div>
  )
}
