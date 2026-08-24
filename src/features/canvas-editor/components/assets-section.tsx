'use client'

import { useRef } from 'react'
import { cn } from '@/utils/cn'
import { Sparkles, Upload } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { BusyHint } from './busy-hint'
import type { CanvasShapeKind } from '@/types/canvas'
import type { EditorJobs } from '../hooks/use-editor-jobs'
import { EDITOR_BUTTON, EDITOR_LABEL } from './workspace/chrome'
import { NODE_KIND_META } from './workspace/node-kinds'
import { PromptRow } from './workspace/prompt-row'

/** The primitives offered as insert tiles, in the order they appear. */
const SHAPE_TILES: CanvasShapeKind[] = ['rect', 'ellipse', 'line']

interface AssetsSectionProps {
  uploading: boolean
  generatingSvg: boolean
  /** The wait registry — the flag above says whether, this says how long it has been. */
  jobs: EditorJobs
  onUpload: (file: File) => void
  onAddShape: (kind: CanvasShapeKind) => void
  onGenerateSvg: (prompt: string) => void
}

/**
 * The two ways to put a picture on the slide: upload one, or describe one and let the model draw
 * it. Managing what is already placed — order, visibility, deletion — belongs to the Layers
 * section, which lists text and pictures together because they share one stacking order.
 */
export function AssetsSection({
  uploading,
  generatingSvg,
  jobs,
  onUpload,
  onAddShape,
  onGenerateSvg,
}: AssetsSectionProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  return (
    <div>
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        title="Upload an image element (logo, graphic)"
        disabled={uploading}
        className={cn(EDITOR_BUTTON, 'w-full', uploading && 'cursor-default')}
      >
        {uploading ? <Spinner size="sm" /> : <Upload size={13} aria-hidden />} Upload an image
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) onUpload(file)
          event.target.value = ''
        }}
      />
      <p className="m-0 mt-2 text-micro text-text2">
        You can also paste an image, or drop one straight onto the canvas.
      </p>

      <div className={cn(EDITOR_LABEL, 'mt-4')}>Shapes</div>
      <div className="flex gap-1.5">
        {SHAPE_TILES.map((kind) => {
          const { label, Icon } = NODE_KIND_META[kind]
          return (
            <button
              key={kind}
              type="button"
              title={`Add a ${label.toLowerCase()}`}
              onClick={() => onAddShape(kind)}
              className={cn(EDITOR_BUTTON, 'flex-1')}
            >
              <Icon size={15} aria-hidden />
              <span className="sr-only">{label}</span>
            </button>
          )
        })}
      </div>

      <div className={cn(EDITOR_LABEL, 'mt-4')}>Vector</div>

      <div>
        <PromptRow
          placeholder="e.g. hand-drawn arrow"
          submitLabel="Draw"
          icon={<Sparkles size={13} aria-hidden />}
          title="Generate a vector graphic in the client's brand palette (~10s)"
          busy={generatingSvg}
          onSubmit={onGenerateSvg}
        />
      </div>
      {generatingSvg && <BusyHint label="Drawing the vector" job={jobs.find('vector')} />}
    </div>
  )
}
