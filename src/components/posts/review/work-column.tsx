'use client'

import { useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/utils/cn'
import { toast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { parseSlides } from '@/components/posts/parse-slides'
import { ImageLightbox } from '@/components/ui/image-lightbox'
import {
  CONTROL_SURFACE,
  CONTROL_FOCUS,
  CONTROL_TEXT,
  LABEL_CLASS,
} from '@/components/ui/form/control-classes'
import { CanvasEditor } from '@/features/canvas-editor/components/canvas-editor'
import { slideCopyAt } from '@/features/canvas-editor/lib/slide-copy'
import type { EditorSlide, EditorTarget } from '@/features/canvas-editor/types'
import { VisualFrame } from './visual-frame'
import { updateSlideField } from '@/components/posts/slides-edit'
import type { DraftVisual } from '@/lib/visual/draft-visuals'
import type { CarouselSlide, PostImage } from '@/types/api'
import type { PostData } from '@/types/post'

interface WorkColumnProps {
  post: PostData
  visuals: DraftVisual[] | undefined
  positionInRun: string
  metaLine: string
  workingCaption: string
  workingSlidesJson: unknown
  slideIdx: number
  canPrev: boolean
  canNext: boolean
  onPrev: () => void
  onNext: () => void
  onSlideIdx: (index: number) => void
  onCaptionChange: (caption: string) => void
  onSlidesChange: (slides: CarouselSlide[]) => void
  onRegenerateVisual: (position: number) => void
  onReplaceVisual: (position: number, file: File) => Promise<boolean>
  onEditedVisual: (draftId: string, visual: DraftVisual) => void
  /** Overrides the wizard-draft editor target — the queue points at persisted posts. */
  editorTarget?: EditorTarget
  /** Post-target editor saves land here (CanvasEditor onSaved); draft saves keep onEditedVisual. */
  onSavedImage?: (image: PostImage) => void
}

/**
 * The focus layout's centre: the draft being judged. Slides strip, the big
 * slide with its editable copy, and the caption. Approve/discard live in the
 * commitment bar; Rewrite lives in the insight panel beside the findings
 * that justify it.
 */
export function WorkColumn({
  post,
  visuals,
  positionInRun,
  metaLine,
  workingCaption,
  workingSlidesJson,
  slideIdx,
  canPrev,
  canNext,
  onPrev,
  onNext,
  onSlideIdx,
  onCaptionChange,
  onSlidesChange,
  onRegenerateVisual,
  onReplaceVisual,
  onEditedVisual,
  editorTarget,
  onSavedImage,
}: WorkColumnProps) {
  const [replacing, setReplacing] = useState(false)
  const [viewing, setViewing] = useState(false)
  const [editingPosition, setEditingPosition] = useState<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const isCarousel = post.post_type === 'carousel'
  const slides = parseSlides(workingSlidesJson)
  const title = post.topic_summary || slides[0]?.headline || workingCaption.slice(0, 60) || 'Draft'
  const activeVisual = visuals?.find((v) => v.position === slideIdx)
  const activeSlide = slides[slideIdx]
  const canEditActive =
    activeVisual?.status === 'done' && !!activeVisual.publicUrl && !!activeVisual.storagePath

  // The working post — edits ride into the canvas editor's slide copy.
  const workingPost: PostData = { ...post, caption: workingCaption, slides_json: workingSlidesJson }

  // Every finished visual is editable, so the editor can carousel between them; a slot still
  // generating has nothing to open. Ascending, because the strip reads left to right.
  const editorSlides: EditorSlide[] = (visuals ?? [])
    .filter((visual) => visual.status === 'done' && !!visual.publicUrl && !!visual.storagePath)
    .map((visual) => ({
      position: visual.position,
      image: { publicUrl: visual.publicUrl!, storagePath: visual.storagePath! },
      slideCopy: slideCopyAt(workingPost, visual.position),
      doc: visual.canvasDoc ?? null,
    }))
    .sort((a, b) => a.position - b.position)
  const canEditPosition =
    editingPosition !== null && editorSlides.some((slide) => slide.position === editingPosition)

  async function handleReplaceFile(file: File) {
    setReplacing(true)
    const ok = await onReplaceVisual(slideIdx, file)
    setReplacing(false)
    if (ok) toast.success('Image replaced')
  }

  function copyAllSlides() {
    const text = slides
      .map((s, i) => `Slide ${i + 1}\n${s.headline}${s.body ? `\n${s.body}` : ''}`)
      .join('\n---\n')
    void navigator.clipboard.writeText(text)
    toast.success('All slides copied')
  }

  function copyCaption() {
    void navigator.clipboard.writeText(workingCaption)
    toast.success('Caption copied')
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="overflow-hidden rounded-card border border-ink/[0.05] bg-surface">
        {/* ── Header ── */}
        <div className="flex flex-wrap items-center gap-3 px-4 py-3">
          <span className="flex flex-none items-center gap-1">
            <NavButton label="Previous draft" disabled={!canPrev} onClick={onPrev}>
              <ChevronLeft aria-hidden className="size-3.5" strokeWidth={1.8} />
            </NavButton>
            <span className="min-w-14 text-center text-micro tabular-nums text-text3">
              {positionInRun}
            </span>
            <NavButton label="Next draft" disabled={!canNext} onClick={onNext}>
              <ChevronRight aria-hidden className="size-3.5" strokeWidth={1.8} />
            </NavButton>
          </span>
          <span className="min-w-[120px] flex-1">
            <span className="block truncate text-title font-semibold text-ink">{title}</span>
            <span className="mt-0.5 block truncate text-micro text-text3">{metaLine}</span>
          </span>
        </div>

        {/* ── Slides strip (carousel only) ── */}
        {isCarousel && (
          <div className="px-4 pb-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-label font-semibold uppercase text-text2">Slides</span>
              <span className="flex gap-2">
                <Button variant="ghost" size="sm" className="text-text2" onClick={copyAllSlides}>
                  Copy all
                </Button>
              </span>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {slides.map((slide, i) => (
                <button
                  key={i}
                  type="button"
                  aria-pressed={i === slideIdx}
                  aria-label={`Slide ${i + 1}`}
                  onClick={() => onSlideIdx(i)}
                  className="w-[72px] flex-none"
                >
                  <span
                    className={cn(
                      'block overflow-hidden rounded-sm border-2 transition-colors duration-150 ease-contour',
                      i === slideIdx ? 'border-forest' : 'border-transparent'
                    )}
                  >
                    <VisualFrame
                      visual={visuals?.find((v) => v.position === i)}
                      size="strip"
                      alt={slide.headline}
                    />
                  </span>
                  <span
                    className={cn(
                      'mt-1 block text-center text-micro tabular-nums',
                      i === slideIdx ? 'font-medium text-ink' : 'text-text3'
                    )}
                  >
                    {i + 1}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── The slide ── */}
        <div
          className={cn('grid gap-5 px-4 pb-4', isCarousel && 'md:grid-cols-[200px_minmax(0,1fr)]')}
        >
          <div className={cn(!isCarousel && 'mx-auto w-full max-w-[280px]')}>
            <button
              type="button"
              className="block w-full"
              disabled={activeVisual?.status !== 'done' || !activeVisual.publicUrl}
              onClick={() => setViewing(true)}
              aria-label="View visual full size"
            >
              <VisualFrame
                visual={activeVisual}
                size="cover"
                alt={activeSlide?.headline ?? workingCaption.slice(0, 80) ?? 'Post visual'}
                pager={isCarousel ? `${slideIdx + 1}/${slides.length}` : undefined}
              />
            </button>
          </div>

          <div className="min-w-0">
            {isCarousel && activeSlide && (
              <div className="flex flex-col gap-3">
                <label className="flex flex-col gap-1.5">
                  <span className={LABEL_CLASS.caps}>Slide text</span>
                  <textarea
                    value={activeSlide.headline}
                    rows={2}
                    aria-label="Slide headline"
                    onChange={(e) =>
                      onSlidesChange(
                        updateSlideField(workingSlidesJson, slideIdx, 'headline', e.target.value)
                      )
                    }
                    className={cn(
                      CONTROL_SURFACE,
                      CONTROL_FOCUS,
                      CONTROL_TEXT,
                      'resize-none px-3 py-2 font-medium'
                    )}
                  />
                </label>
                {activeSlide.body !== '' && (
                  <textarea
                    value={activeSlide.body}
                    rows={3}
                    aria-label="Slide body"
                    onChange={(e) =>
                      onSlidesChange(
                        updateSlideField(workingSlidesJson, slideIdx, 'body', e.target.value)
                      )
                    }
                    className={cn(
                      CONTROL_SURFACE,
                      CONTROL_FOCUS,
                      CONTROL_TEXT,
                      'resize-none px-3 py-2'
                    )}
                  />
                )}
              </div>
            )}

            {/* The note explains the visual, so it reads before the actions:
                tile → why → what you can do. Card-top would give a transient
                wait-state the prominence of a draft-level warning. */}
            {activeVisual?.status === 'error' && (
              <SlotNote tone="bad" title="This visual failed to compose">
                The image job came back with an error. Regenerating asks for a new one; approving
                now attaches the slides that did finish, and you can add this one later from the
                calendar.
              </SlotNote>
            )}
            {activeVisual?.status === 'generating' && (
              <SlotNote tone="wait" title="Still composing">
                Visuals run alongside the copy. Approving now attaches whatever has finished —
                nothing is lost, the rest arrive in the calendar.
              </SlotNote>
            )}

            {/* One door, two side paths: the editor is the bordered invitation,
                re-roll and upload are the matched quiet pair beside it. */}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {canEditActive && (
                <Button variant="secondary" size="sm" onClick={() => setEditingPosition(slideIdx)}>
                  Open visual editor
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="text-text2"
                disabled={activeVisual?.status === 'generating'}
                onClick={() => onRegenerateVisual(slideIdx)}
              >
                Regenerate visual
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-text2"
                loading={replacing}
                // A generating slide has a compose job in flight whose late
                // result would overwrite the upload — see replaceVisual.
                disabled={activeVisual?.status === 'generating'}
                onClick={() => fileInputRef.current?.click()}
              >
                Replace image
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  e.target.value = ''
                  if (file) void handleReplaceFile(file)
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── Caption ── */}
      <div className="rounded-card border border-ink/[0.05] bg-surface p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-label font-semibold uppercase text-text2">Caption</span>
          <Button variant="ghost" size="sm" className="text-text2" onClick={copyCaption}>
            Copy
          </Button>
        </div>
        <textarea
          value={workingCaption}
          rows={12}
          aria-label="Caption"
          onChange={(e) => onCaptionChange(e.target.value)}
          className={cn(
            CONTROL_SURFACE,
            CONTROL_FOCUS,
            CONTROL_TEXT,
            'resize-y px-4 py-3 leading-relaxed'
          )}
        />
      </div>

      {viewing && activeVisual?.publicUrl && (
        <ImageLightbox
          src={activeVisual.publicUrl}
          alt={activeSlide?.headline ?? 'Post visual'}
          onClose={() => setViewing(false)}
        />
      )}

      {canEditPosition && editingPosition !== null && (
        <CanvasEditor
          // The editor's save path follows the target kind: draft targets fire
          // onSavedDraft, post targets fire onSaved — passing both is inert.
          target={editorTarget ?? { kind: 'draft', clientId: post.client_id, draftId: post.id }}
          slides={editorSlides}
          initialPosition={editingPosition}
          onSaved={onSavedImage}
          onClose={() => setEditingPosition(null)}
          onSavedDraft={(visual, doc) =>
            onEditedVisual(post.id, {
              position: visual.position,
              status: 'done',
              publicUrl: visual.publicUrl,
              storagePath: visual.storagePath,
              canvasDoc: doc,
            })
          }
        />
      )}
    </div>
  )
}

function NavButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string
  disabled: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-7 place-items-center rounded-sm text-text2 transition-colors duration-150 ease-contour hover:bg-sunken hover:text-ink disabled:pointer-events-none disabled:opacity-35"
    >
      {children}
    </button>
  )
}

function SlotNote({
  tone,
  title,
  children,
}: {
  tone: 'bad' | 'wait'
  title: string
  children: React.ReactNode
}) {
  return (
    <div
      className={cn(
        'mt-3 rounded-chip p-3 text-caption text-text2',
        tone === 'bad' ? 'bg-danger-bg' : 'bg-pending-bg'
      )}
    >
      <span
        className={cn('mb-1 block font-semibold', tone === 'bad' ? 'text-danger' : 'text-pending')}
      >
        {title}
      </span>
      {children}
    </div>
  )
}
