'use client'

import { Plus } from 'lucide-react'
import type { LockupContext, LockupId } from '@/lib/canvas/lockups'
import type { CanvasDoc, CanvasNode, CanvasShapeKind } from '@/types/canvas'
import type { AssetRef } from '../../lib/asset-client'
import { AiSection } from './ai-section'
import { LockupsSection } from './lockups-section'
import { AssetsSection } from '../assets-section'
import { BackgroundControls } from '../background-controls'
import { EDITOR_BUTTON, EDITOR_LABEL } from './chrome'
import { LayersSection } from './layers-section'
import type { EditorJobs } from '../../hooks/use-editor-jobs'
import type { RailSection } from './rail'

interface RailPanelProps {
  section: RailSection
  /** Passed straight through to the sections that show a wait; the panel itself reads nothing. */
  jobs: EditorJobs
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
  /** The client's colours, brand pairing and slide position — what a lockup resolves against. */
  lockupContext: LockupContext
  onApplyLockup: (id: LockupId) => void
  /** Absent on a single post — one slide has nothing to apply a lockup across. */
  onApplyLockupToAll?: (id: LockupId) => void
  /** Slides the last apply-to-all landed on, so the panel can offer one undo for the set. */
  appliedToAll: number[] | null
  onUndoApplyToAll: () => void
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
        <div className="border-t border-line pt-3">
          <h3 className={EDITOR_LABEL}>Lockups</h3>
          <LockupsSection
            doc={props.doc}
            ctx={props.lockupContext}
            onApply={props.onApplyLockup}
            onApplyToAll={props.onApplyLockupToAll}
            appliedToAll={props.appliedToAll}
            onUndoApplyToAll={props.onUndoApplyToAll}
          />
        </div>
      </div>
    )
  }

  if (props.section === 'elements') {
    return (
      <AssetsSection
        uploading={props.busy.uploadingAsset}
        generatingSvg={props.busy.generatingSvg}
        jobs={props.jobs}
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
        jobs={props.jobs}
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
