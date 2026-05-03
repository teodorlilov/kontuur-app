'use client'

import { useState, useRef } from 'react'
import { X, Upload, Check } from 'lucide-react'
import { mapImageRow } from '@/features/publishing/lib/map-image-row'
import type { PostImage } from '@/types/api'

interface ImageSlotProps {
  postId: string
  position: number
  image: PostImage | null
  onUploaded: (image: PostImage) => void
  onDeleted: (imageId: string) => void
}

/** Single-image upload/display slot for a carousel slide or single post. */
export function ImageSlot({ postId, position, image, onUploaded, onDeleted }: ImageSlotProps) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  if (image) {
    return <ImageCard image={image} onDelete={() => handleDelete(image.id)} />
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <DropZone
        dragOver={dragOver}
        uploading={uploading}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      />
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png"
        style={{ display: 'none' }}
        onChange={(e) => { if (e.target.files?.length) void handleFile(e.target.files[0]!) }}
      />
      {error && <ErrorMessage message={error} />}
    </div>
  )

  async function handleFile(file: File) {
    if (!['image/jpeg', 'image/jpg', 'image/png'].includes(file.type)) {
      setError('Only JPEG and PNG files are accepted')
      return
    }
    if (file.size > 8 * 1024 * 1024) {
      setError('File must be under 8 MB')
      return
    }

    setUploading(true)
    setError(null)

    const form = new FormData()
    form.append('file', file)
    form.append('position', String(position))

    const res = await fetch(`/api/posts/${postId}/images`, { method: 'POST', body: form })
    const data = await res.json()

    setUploading(false)

    if (!res.ok) {
      setError(data.error ?? 'Upload failed')
      return
    }

    onUploaded(mapImageRow(data.image))
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) void handleFile(file)
  }

  async function handleDelete(imageId: string) {
    const res = await fetch(`/api/posts/${postId}/images`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageId }),
    })
    if (res.ok) onDeleted(imageId)
  }
}

function DropZone({
  dragOver,
  uploading,
  onDragOver,
  onDragLeave,
  onDrop,
  onClick,
}: {
  dragOver: boolean
  uploading: boolean
  onDragOver: (e: React.DragEvent) => void
  onDragLeave: () => void
  onDrop: (e: React.DragEvent) => void
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      disabled={uploading}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        padding: '16px 12px',
        border: `1.5px dashed ${dragOver ? '#C07B55' : 'rgba(44,62,80,0.20)'}`,
        borderRadius: 10,
        background: dragOver ? 'rgba(192,123,85,0.04)' : 'rgba(44,62,80,0.02)',
        cursor: uploading ? 'wait' : 'pointer',
        width: '100%',
        fontFamily: 'inherit',
        transition: 'border-color 0.15s, background 0.15s',
      }}
    >
      {uploading ? (
        <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>Uploading...</span>
      ) : (
        <>
          <Upload style={{ width: 16, height: 16, color: 'var(--color-muted)' }} />
          <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>
            Drop file here or click to upload
          </span>
          <span style={{ fontSize: 10, color: 'rgba(44,62,80,0.35)' }}>
            JPEG or PNG, ≤ 8 MB
          </span>
        </>
      )}
    </button>
  )
}

function ImageCard({ image, onDelete }: { image: PostImage; onDelete: () => void }) {
  const sizeMB = image.fileSize ? (image.fileSize / (1024 * 1024)).toFixed(1) : null

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 10px',
        borderRadius: 8,
        border: '0.5px solid var(--color-border-1)',
        background: 'rgba(44,62,80,0.02)',
      }}
    >
      {/* Thumbnail */}
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 6,
          overflow: 'hidden',
          flexShrink: 0,
          background: 'rgba(44,62,80,0.08)',
        }}
      >
        <img
          src={image.publicUrl}
          alt={image.fileName ?? 'Post image'}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      </div>

      {/* File info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 500,
            color: 'var(--color-text-1)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {image.fileName ?? 'image'}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
          <Check style={{ width: 10, height: 10, color: '#5A8A4A' }} />
          <span style={{ fontSize: 10, color: '#5A8A4A' }}>
            Uploaded{sizeMB ? ` · ${sizeMB} MB` : ''}
          </span>
        </div>
      </div>

      {/* Delete */}
      <button
        type="button"
        onClick={onDelete}
        style={{
          width: 24,
          height: 24,
          borderRadius: 6,
          border: 'none',
          background: 'rgba(44,62,80,0.06)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          color: 'var(--color-muted)',
          flexShrink: 0,
        }}
      >
        <X style={{ width: 12, height: 12 }} />
      </button>
    </div>
  )
}

function ErrorMessage({ message }: { message: string }) {
  return (
    <div
      style={{
        fontSize: 11,
        color: '#A32D2D',
        background: '#FCEBEB',
        padding: '7px 10px',
        borderRadius: 6,
      }}
    >
      {message}
    </div>
  )
}

