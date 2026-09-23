import type { ReactNode } from 'react'
import type { PostImage } from '@/types/api'

/**
 * Per-slide image/visual props threaded PostDetailLayout → PostContentDisplay → CarouselSlides/ImageSlot.
 * Editable surfaces pass `postId` + callbacks (upload/delete/AI-generate); the read-only approval
 * portal passes `renderImageSlot` instead — it shows a slide, it does not change one.
 */
export interface PostVisualsProps {
  postId?: string
  images?: PostImage[]
  onImageUploaded?: (image: PostImage) => void
  onImageDeleted?: (imageId: string) => void
  canvaConnected?: boolean
  onGenerateImage?: (position: number) => void
  generatingPositions?: number[]
  /** Positions whose fresh AI image is being auto-composed with text ("Adding text…" phase). */
  composingPositions?: number[]
  /** Opens the canvas text-overlay editor for a filled slot. */
  onEditImage?: (position: number) => void
  renderImageSlot?: (activeIndex: number) => ReactNode
}
