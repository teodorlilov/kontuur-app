'use client'

import { Plus } from 'lucide-react'
import type { CanvasDoc, CanvasNode, CanvasShapeKind } from '@/types/canvas'
import type { AssetRef } from '../../lib/asset-client'
import { AiSection } from './ai-section'
import { AssetsSection } from '../assets-section'
import { BackgroundControls } from '../background-controls'
import { EDITOR_BUTTON } from './chrome'
import { LayersSection } from './layers-section'
import type { RailSection } from './rail'

interface RailPanelProps {
  section: RailSection
  doc: CanvasDoc
  selectedIds: string[]
  busy: {
    uploadingAsset: boolean
    isolating: boolean
    generatingSvg: boolean
    replacingBackground: boolean
    generatingBackground: boolean
    expanding: boolean
  }
  candidates: AssetRef[]
  /** Whether the slide has words to regenerate from — changes what an empty prompt means. */
  hasSlideCopy: boolean
  onGenerateBackground: (direction?: string) => void
  onCancelBackground: () => void
  onPickCandidate: (ref: AssetRef) => void
  onExpandBackground: () => void
  onSelect: (id: string, additive: boolean) => void
  onHoverNode: (id: string | null) => void
  onAddText: () => void
  onAddShape: (kind: CanvasShapeKind) => void
  onRemoveNode: (id: string) => void
  onReorderNode: (id: string, toIndex: number) => void
  onToggleHidden: (node: CanvasNode) => void
  onToggleLocked: (node: CanvasNode) => void
  onUploadAsset: (file: File) => void
  onReplaceBackground: (file: File) => void
  onBackgroundZoom: (zoom: number) => void
  onBackgroundReset: () => void
  onEnterInpaint: () => void
  onEnterLasso: () => void
  onIsolateSubject: () => void
  onGenerateSvg: (prompt: string) => void
}

/** The contents of the open rail section. Each one answers "what can I add or manage here?". */
export function RailPanel(props: RailPanelProps) {
  if (props.section === 'text') {
    return (
      <div className="flex flex-col gap-3">
        <button type="button" className={EDITOR_BUTTON} onClick={props.onAddText}>
          <Plus size={14} aria-hidden /> Add a text layer
        </button>
        <p className="m-0 text-micro text-text2">
          Double-click any text on the canvas to edit it in place.
        </p>
      </div>
    )
  }

  if (props.section === 'elements') {
    return (
      <AssetsSection
        uploading={props.busy.uploadingAsset}
        generatingSvg={props.busy.generatingSvg}
        onUpload={props.onUploadAsset}
        onAddShape={props.onAddShape}
        onGenerateSvg={props.onGenerateSvg}
      />
    )
  }

  if (props.section === 'layers') {
    return (
      <LayersSection
        doc={props.doc}
        selectedIds={props.selectedIds}
        onSelect={props.onSelect}
        onHover={props.onHoverNode}
        onToggleHidden={props.onToggleHidden}
        onToggleLocked={props.onToggleLocked}
        onRemove={props.onRemoveNode}
        onReorder={props.onReorderNode}
      />
    )
  }

  if (props.section === 'ai') {
    return (
      <AiSection
        candidates={props.candidates}
        currentStoragePath={props.doc.background.storagePath}
        hasSlideCopy={props.hasSlideCopy}
        busy={{
          generating: props.busy.generatingBackground,
          isolating: props.busy.isolating,
          expanding: props.busy.expanding,
        }}
        onGenerate={props.onGenerateBackground}
        onCancelGenerate={props.onCancelBackground}
        onPick={props.onPickCandidate}
        onEnterInpaint={props.onEnterInpaint}
        onIsolateSubject={props.onIsolateSubject}
        onEnterLasso={props.onEnterLasso}
        onExpand={props.onExpandBackground}
      />
    )
  }

  return (
    <BackgroundControls
      transform={props.doc.backgroundTransform}
      replacing={props.busy.replacingBackground}
      onReplace={props.onReplaceBackground}
      onZoom={props.onBackgroundZoom}
      onReset={props.onBackgroundReset}
    />
  )
}
