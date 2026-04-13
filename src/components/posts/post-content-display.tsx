'use client'

import { cn } from '@/utils/cn'
import { qualityScoreBadgeClass } from '@/components/ui/colors/score-colors'
import { getPillarColor } from '@/components/ui/colors/pillar-colors'
import { toast } from '@/components/ui/toast'
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
}

export function PostContentDisplay({
  caption,
  platform,
  postType,
  slidesJson,
  priority,
  qualityScoreAvg,
  sourceUrl,
  sourceTitle,
  sourceType,
  sourceExcerpt,
  pillar,
  theme,
  criteria,
  scores,
}: PostContentDisplayProps) {
  const isCarousel = postType === 'carousel'

  const slides = Array.isArray(slidesJson) ? (slidesJson as CarouselSlide[]) : []

  const sourceLabel =
    sourceType === 'rss'
      ? 'RSS Feed'
      : sourceType === 'website'
        ? 'Website'
        : sourceType === 'file'
          ? 'Document'
          : !sourceUrl
            ? 'Trend-based'
            : null

  const sourceClass =
    sourceType === 'rss'
      ? 'bg-orange-50 text-orange-700'
      : sourceType === 'website'
        ? 'bg-teal-50 text-teal-700'
        : sourceType === 'file'
          ? 'bg-amber-50 text-amber-700'
          : 'bg-gray-100 text-gray-500'

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
        {sourceLabel && (
          <span className={cn('text-xs px-2 py-0.5 rounded-full', sourceClass)}>{sourceLabel}</span>
        )}
        {sourceUrl && (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full hover:bg-indigo-100 truncate max-w-[200px]"
            title={sourceTitle ?? sourceUrl}
          >
            {sourceTitle ?? 'Source'}
          </a>
        )}
        {qualityScoreAvg !== null && (
          <span
            className={cn(
              'text-xs px-2 py-0.5 rounded-full ml-auto',
              qualityScoreBadgeClass(qualityScoreAvg)
            )}
          >
            Score: {qualityScoreAvg}
          </span>
        )}
      </div>

      {/* Source context */}
      {sourceExcerpt && (
        <div className="flex flex-col gap-1.5 bg-gray-50 rounded-lg px-3 py-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Source context
            </p>
            {!sourceUrl && (
              <a
                href={`https://www.google.com/search?q=${encodeURIComponent(sourceExcerpt.slice(0, 120))}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-md bg-white text-indigo-600 hover:bg-indigo-50 border border-indigo-200 font-medium transition-colors"
              >
                Verify on Google
              </a>
            )}
          </div>
          <p className="text-xs text-gray-600 leading-relaxed">{sourceExcerpt}</p>
        </div>
      )}

      {/* Caption */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            {isCarousel ? 'Main Caption' : 'Caption'}
          </p>
          <button
            onClick={handleCopyCaption}
            className="text-xs text-gray-500 hover:text-gray-700 font-medium"
          >
            Copy
          </button>
        </div>
        <p className="text-sm text-gray-900 whitespace-pre-wrap leading-relaxed">
          {caption ? decodeUrlsInText(caption) : caption}
        </p>
      </div>

      {/* Carousel slides */}
      {isCarousel && slides.length > 0 && <CarouselSlides slides={slides} />}

      {/* Quality scores (generation flow only) */}
      {criteria && scores && (
        <QualityScores criteria={criteria} scores={scores} />
      )}
    </div>
  )
}
