'use client'

import { Lasso, Maximize2, Scissors, Sparkles, Wand2 } from 'lucide-react'
import { cn } from '@/utils/cn'
import { VisualFrame } from '@/components/draft-editing/visual-frame'
import type { AssetRef } from '../../lib/asset-client'
import { TYPICAL_SECONDS, type EditorJobs } from '../../hooks/use-editor-jobs'
import { BusyHint } from '../busy-hint'
import { EDITOR_BUTTON, EDITOR_LABEL } from './chrome'
import { PromptRow } from './prompt-row'

interface AiSectionProps {
  candidates: AssetRef[]
  /** The background the doc currently uses — the strip marks it so a pick reads as a swap. */
  currentStoragePath: string
  /** True while the slide has copy to regenerate from; changes what an empty prompt means. */
  hasSlideCopy: boolean
  busy: { generating: boolean; isolating: boolean; expanding: boolean }
  /** The wait registry — the flags above say whether, this says how long it has been. */
  jobs: EditorJobs
  onGenerate: (direction?: string) => void
  onCancelGenerate: () => void
  onPick: (ref: AssetRef) => void
  onEnterInpaint: () => void
  onIsolateSubject: () => void
  onEnterLasso: () => void
  onExpand: () => void
}

/**
 * Everything in the editor that calls a model, in one panel.
 *
 * They live together because they share the one property that matters to the person using them:
 * each takes about a minute and costs a generation. A toolbar can show a verb in eight characters;
 * it cannot say what the verb does or how long you will wait, and these all need both.
 */
export function AiSection(props: AiSectionProps) {
  const { candidates, busy } = props

  return (
    <div className="flex flex-col gap-5">
      <section>
        <h3 className={EDITOR_LABEL}>New picture</h3>
        <PromptRow
          placeholder="Describe the picture…"
          submitLabel="Generate"
          icon={<Sparkles size={13} aria-hidden />}
          title="Generate a new background in the client's palette and brand style"
          busy={busy.generating}
          // An empty prompt is a real request — the model is stochastic, so the same slide copy
          // yields a different picture every time.
          allowEmpty
          onSubmit={(direction) => props.onGenerate(direction || undefined)}
        />
        <p className="m-0 mt-1.5 text-micro text-text2">
          {props.hasSlideCopy
            ? 'Leave it blank to try again from the slide’s own words. About a minute either way.'
            : 'This slide has no copy, so a description is what the picture will be built from. About a minute.'}
        </p>

        {(candidates.length > 0 || busy.generating) && (
          <div className="mt-3">
            {/* Two columns so a candidate is big enough to actually judge — the 72px filmstrip
                tile is for a row of slides you already chose, not for choosing between images. */}
            <div role="group" aria-label="Generated backgrounds" className="grid grid-cols-2 gap-2">
              {candidates.map((candidate, index) => {
                const inUse = candidate.storagePath === props.currentStoragePath
                return (
                  <button
                    key={candidate.storagePath}
                    type="button"
                    aria-pressed={inUse}
                    aria-label={`Use generated background ${index + 1}${inUse ? ', in use' : ''}`}
                    title={inUse ? 'This is the slide’s picture' : 'Use this picture'}
                    onClick={() => props.onPick(candidate)}
                    className={cn(
                      'block cursor-pointer overflow-hidden rounded-sm border-2 transition-colors duration-150 ease-contour',
                      inUse ? 'border-forest' : 'border-transparent hover:border-line2'
                    )}
                  >
                    <VisualFrame
                      visual={{ status: 'done', publicUrl: candidate.publicUrl }}
                      size="panel"
                      alt=""
                    />
                  </button>
                )
              })}
              {/* The pending tile appears in the grid the instant you press Generate, at the size
                  the result will be — so the wait happens where the answer will land. */}
              {busy.generating && (
                <div className="overflow-hidden rounded-sm border-2 border-dashed border-line2">
                  <VisualFrame visual={{ status: 'generating' }} size="panel" alt="" />
                </div>
              )}
            </div>

            {busy.generating ? (
              <div className="mt-2 flex items-center justify-between gap-2">
                <BusyHint label="Painting" job={props.jobs.find('generate')} />
                {/* The same word the tray uses. Neither control can recall the work — the request
                    is already with the provider — and two names for one act read as two acts. */}
                <button
                  type="button"
                  className={EDITOR_BUTTON}
                  title="Throw this result away when it arrives"
                  onClick={props.onCancelGenerate}
                >
                  Discard result
                </button>
              </div>
            ) : (
              <p className="m-0 mt-2 text-micro text-text2">
                Picking one replaces the slide’s picture. Your text and elements stay put.
              </p>
            )}
          </div>
        )}
      </section>

      <section>
        <h3 className={EDITOR_LABEL}>Change this picture</h3>
        <div className="flex flex-col gap-1.5">
          <AiVerb
            icon={<Wand2 size={14} aria-hidden />}
            label="Repair or replace a zone"
            description="Paint over part of the picture and describe what belongs there instead."
            seconds={TYPICAL_SECONDS.inpaint}
            onClick={props.onEnterInpaint}
          />
          <AiVerb
            icon={<Scissors size={14} aria-hidden />}
            label="Cut out the subject"
            description="Lift the main subject out as its own movable picture."
            seconds={TYPICAL_SECONDS.isolate}
            busy={busy.isolating}
            onClick={props.onIsolateSubject}
          />
          <AiVerb
            icon={<Lasso size={14} aria-hidden />}
            label="Lasso something out"
            description="Draw a loop around any object to cut just that out."
            seconds={TYPICAL_SECONDS.lasso}
            onClick={props.onEnterLasso}
          />
          <AiVerb
            icon={<Maximize2 size={14} aria-hidden />}
            label="Expand the picture"
            description="Generate more picture around all four edges, so you have room to reposition."
            seconds={TYPICAL_SECONDS.expand}
            busy={busy.expanding}
            onClick={props.onExpand}
          />
        </div>
        {busy.isolating && (
          <BusyHint label="Finding the subject" job={props.jobs.find('isolate')} />
        )}
        {busy.expanding && (
          <BusyHint label="Painting the new edges" job={props.jobs.find('expand')} />
        )}
      </section>
    </div>
  )
}

interface AiVerbProps {
  icon: React.ReactNode
  label: string
  /** Always visible. These verbs are not self-explanatory, and a tooltip nobody hovers is not help. */
  description: string
  seconds: number
  busy?: boolean
  onClick: () => void
}

function AiVerb({ icon, label, description, seconds, busy, onClick }: AiVerbProps) {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onClick}
      className={cn(EDITOR_BUTTON, 'h-auto flex-col items-start gap-0.5 px-2.5 py-2 text-left')}
    >
      <span className="flex items-center gap-1.5 font-medium text-ink">
        {icon} {label}
        <span className="ml-auto shrink-0 tabular-nums text-micro text-text3">~{seconds}s</span>
      </span>
      <span className="text-micro font-normal text-text2">{description}</span>
    </button>
  )
}
