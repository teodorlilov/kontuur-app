import type { ReactNode } from 'react'
import { SourceTile } from '@/components/posts/source-tile'
import { PostContentDisplay } from '@/components/posts/post-content-display'
import type { CarouselSlide } from '@/types/api'
import type { PostVisualsProps } from '@/components/posts/visuals-props'

interface PostDetailLayoutProps extends PostVisualsProps {
  caption: string
  platform: string | null
  postType: string
  slidesJson: unknown
  priority: boolean
  qualityScoreAvg: number | null
  pillar?: string | null
  sourceUrl?: string | null
  sourceTitle?: string | null
  sourceType?: string | null
  sourceExcerpt?: string | null
  editable?: boolean
  onCaptionChange?: (caption: string) => void
  onSlidesChange?: (slides: CarouselSlide[]) => void
  children: ReactNode
}

/** Shared center-panel layout used by both generation results and review. */
export function PostDetailLayout({
  caption,
  platform,
  postType,
  slidesJson,
  priority,
  qualityScoreAvg,
  pillar,
  sourceUrl,
  sourceTitle,
  sourceType,
  sourceExcerpt,
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
  children,
}: PostDetailLayoutProps) {
  return (
    <div style={{ flex: 1, overflowY: 'auto', background: 'var(--color-page)', minWidth: 0 }}>
      <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <SourceTile
          sourceUrl={sourceUrl}
          sourceTitle={sourceTitle}
          sourceType={sourceType}
          sourceExcerpt={sourceExcerpt}
        />
        <div
          style={{
            background: 'var(--color-surface)',
            border: '0.5px solid var(--color-border-1)',
            borderRadius: '14px',
            padding: '24px',
            boxShadow: '0 1px 8px rgba(44,62,80,0.05)',
          }}
        >
          <PostContentDisplay
            caption={caption}
            platform={platform}
            postType={postType}
            slidesJson={slidesJson}
            priority={priority}
            qualityScoreAvg={qualityScoreAvg}
            pillar={pillar}
            editable={editable}
            onCaptionChange={onCaptionChange}
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
        </div>
        {children}
      </div>
    </div>
  )
}
