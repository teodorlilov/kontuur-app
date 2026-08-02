'use client'

import { useState, useRef, useEffect } from 'react'
import { cn } from '@/utils/cn'
import { toast } from '@/components/ui/toast'
import { getPillarColor } from '@/components/ui/colors/pillar-colors'
import { decodeUrlsInText } from '@/utils/decode-url'
import { CarouselSlides } from './carousel-slides'
import { ImageSlot } from '@/features/publishing/components/image-slot'
import { parseSlides } from './parse-slides'
import type { CarouselSlide, ValidationCriteria, ValidationScores } from '@/types/api'
import type { PostVisualsProps } from './visuals-props'
import { QualityScores } from './quality-scores'

export interface PostContentDisplayProps extends PostVisualsProps {
  caption: string | null
  platform: string | null
  postType: string
  slidesJson: unknown
  priority: boolean
  qualityScoreAvg: number | null
  sourceUrl?: string | null
  sourceTitle?: string | null
  sourceType?: string | null
  sourceExcerpt?: string | null
  pillar?: string | null
  theme?: string
  criteria?: ValidationCriteria | null
  scores?: ValidationScores | null
  editable?: boolean
  onCaptionChange?: (caption: string) => void
  onSlidesChange?: (slides: CarouselSlide[]) => void
}

/** Inline-editable caption that switches to a textarea on click */
function EditableCaption({
  caption,
  editable,
  onCaptionChange,
  onCopy,
}: {
  caption: string | null
  editable?: boolean
  onCaptionChange?: (caption: string) => void
  onCopy: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(caption ?? '')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Adjusted during render rather than in an effect: an effect renders the stale draft once,
  // commits it, then re-renders — so a caption arriving from the server flashes the old text.
  const [syncedCaption, setSyncedCaption] = useState(caption)
  if (syncedCaption !== caption) {
    setSyncedCaption(caption)
    setDraft(caption ?? '')
  }

  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus()
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`
    }
  }, [editing])

  function commit() {
    setEditing(false)
    if (draft !== (caption ?? '') && onCaptionChange) {
      onCaptionChange(draft)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-end">
        <button onClick={onCopy} className="text-xs text-text3 hover:text-text2 font-medium">Copy</button>
      </div>
      {editable && onCaptionChange && !editing ? (
        <p
          onClick={() => setEditing(true)}
          className="text-sm text-ink whitespace-pre-wrap leading-relaxed cursor-text rounded px-1 -mx-1 hover:bg-sunken hover:ring-1 hover:ring-line2 transition-all"
        >
          {caption ? decodeUrlsInText(caption) : caption}
        </p>
      ) : editing ? (
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value)
            e.target.style.height = 'auto'
            e.target.style.height = `${e.target.scrollHeight}px`
          }}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setDraft(caption ?? '')
              setEditing(false)
            }
          }}
          className="w-full text-sm text-ink whitespace-pre-wrap leading-relaxed border border-line2 rounded-lg px-2 py-1 -mx-1 focus:outline-none focus:ring-2 focus:ring-[var(--line2)] focus:border-transparent resize-none"
        />
      ) : (
        <p className="text-sm text-ink whitespace-pre-wrap leading-relaxed">
          {caption ? decodeUrlsInText(caption) : caption}
        </p>
      )}
    </div>
  )
}

export function PostContentDisplay({
  caption,
  platform,
  postType,
  slidesJson,
  priority,
  pillar,
  theme,
  criteria,
  scores,
  editable,
  onCaptionChange,
  onSlidesChange,
  postId,
  images,
  onImageUploaded,
  onImageDeleted,
  canvaConnected,
  onGenerateImage,
  generatingPositions,
  composingPositions,
  onEditImage,
  renderImageSlot,
}: PostContentDisplayProps) {
  const isCarousel = postType === 'carousel'

  const slides = parseSlides(slidesJson)

  const pillarColor = pillar ? getPillarColor(pillar) : null

  function handleCopyCaption() {
    if (!caption) return
    void navigator.clipboard.writeText(caption)
    toast.success('Copied to clipboard')
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Badge row */}
      <div className="flex items-center gap-2 flex-wrap">
        {priority && (
          <span className="text-xs font-semibold bg-danger-bg text-danger px-2 py-0.5 rounded-full">
            Priority
          </span>
        )}
        {pillar && pillarColor && (
          <span
            className="text-xs px-2 py-0.5 rounded-full"
            style={{ background: pillarColor.bg, color: pillarColor.text }}
          >
            {pillar}
          </span>
        )}
        {theme && (
          <span className="text-xs bg-sunken text-text2 px-2 py-0.5 rounded-full">
            {theme}
          </span>
        )}
        {platform && (
          <span className="text-xs bg-wash text-forest px-2 py-0.5 rounded-full">
            {platform}
          </span>
        )}
        {/* Post type is a category, and colour does not name a category — the
            words do. Both states take the neutral draft pair. */}
        <span className="text-xs px-2 py-0.5 rounded-full bg-sunken text-text2">
          {isCarousel ? `🎠 Carousel · ${slides.length} slides` : 'Single image'}
        </span>
      </div>

      {/* Caption */}
      <EditableCaption
        caption={caption}
        editable={editable}
        onCaptionChange={onCaptionChange}
        onCopy={handleCopyCaption}
      />

      {/* Carousel slides */}
      {isCarousel && slides.length > 0 && (
        <CarouselSlides
          slides={slides}
          editable={editable}
          onSlidesChange={onSlidesChange}
          postId={postId}
          images={images}
          onImageUploaded={onImageUploaded}
          onImageDeleted={onImageDeleted}
          canvaConnected={canvaConnected}
          onGenerateImage={onGenerateImage}
          generatingPositions={generatingPositions}
          composingPositions={composingPositions}
          onEditImage={onEditImage}
          renderImageSlot={renderImageSlot}
        />
      )}

      {/* Single-post visual */}
      {!isCarousel &&
        (renderImageSlot
          ? renderImageSlot(0)
          : postId && onImageUploaded && onImageDeleted && (
              <ImageSlot
                postId={postId}
                position={0}
                image={images?.find((img) => img.position === 0) ?? null}
                onUploaded={onImageUploaded}
                onDeleted={onImageDeleted}
                canvaConnected={canvaConnected}
                onGenerate={onGenerateImage ? () => onGenerateImage(0) : undefined}
                generating={generatingPositions?.includes(0)}
                composing={composingPositions?.includes(0)}
                onEdit={onEditImage ? () => onEditImage(0) : undefined}
              />
            ))}

      {/* Quality scores (generation flow only) */}
      {criteria && scores && (
        <QualityScores criteria={criteria} scores={scores} />
      )}
    </div>
  )
}
