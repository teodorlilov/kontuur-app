'use client'

import { useState, useRef, useEffect } from 'react'
import { cn } from '@/utils/cn'
import { toast } from '@/components/ui/toast'
import { getPillarColor } from '@/components/ui/colors/pillar-colors'
import { decodeUrlsInText } from '@/utils/decode-url'
import { CarouselSlides } from './carousel-slides'
import type { CarouselSlide, ValidationCriteria, ValidationScores } from '@/types/api'
import { QualityScores } from './quality-scores'

export interface PostContentDisplayProps {
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

  useEffect(() => {
    setDraft(caption ?? '')
  }, [caption])

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
        <button onClick={onCopy} className="text-xs text-gray-500 hover:text-gray-700 font-medium">Copy</button>
      </div>
      {editable && onCaptionChange && !editing ? (
        <p
          onClick={() => setEditing(true)}
          className="text-sm text-gray-900 whitespace-pre-wrap leading-relaxed cursor-text rounded px-1 -mx-1 hover:bg-gray-50 hover:ring-1 hover:ring-gray-200 transition-all"
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
          className="w-full text-sm text-gray-900 whitespace-pre-wrap leading-relaxed border border-gray-300 rounded-lg px-2 py-1 -mx-1 focus:outline-none focus:ring-2 focus:ring-[var(--color-border-3)] focus:border-transparent resize-none"
        />
      ) : (
        <p className="text-sm text-gray-900 whitespace-pre-wrap leading-relaxed">
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
}: PostContentDisplayProps) {
  const isCarousel = postType === 'carousel'

  const slides = Array.isArray(slidesJson) ? (slidesJson as CarouselSlide[]) : []

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
          <span className="text-xs font-semibold bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
            Priority
          </span>
        )}
        {pillar && pillarColor && (
          <span
            className={cn('text-xs px-2 py-0.5 rounded-full', pillarColor.bg, pillarColor.text)}
          >
            {pillar}
          </span>
        )}
        {theme && (
          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
            {theme}
          </span>
        )}
        {platform && (
          <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">
            {platform}
          </span>
        )}
        <span
          className={cn(
            'text-xs px-2 py-0.5 rounded-full',
            isCarousel ? 'bg-purple-50 text-purple-700' : 'bg-gray-100 text-gray-600'
          )}
        >
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
        <CarouselSlides slides={slides} editable={editable} onSlidesChange={onSlidesChange} />
      )}

      {/* Quality scores (generation flow only) */}
      {criteria && scores && (
        <QualityScores criteria={criteria} scores={scores} />
      )}
    </div>
  )
}
