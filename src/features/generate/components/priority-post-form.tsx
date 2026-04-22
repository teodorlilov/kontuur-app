'use client'

import { Input } from '@/components/ui/input'
import { PLATFORMS } from '@/utils/constants'
import type { PriorityPost } from '@/types/api'

interface PriorityPostFormProps {
  posts: PriorityPost[]
  onChange: (posts: PriorityPost[]) => void
}

export function PriorityPostForm({ posts, onChange }: PriorityPostFormProps) {
  function addRow() {
    onChange([...posts, { title: '', brief: '', platform: 'Instagram', targetDate: '' }])
  }

  function removeRow(index: number) {
    onChange(posts.filter((_, i) => i !== index))
  }

  function updateRow(index: number, field: keyof PriorityPost, value: string) {
    onChange(posts.map((p, i) => (i === index ? { ...p, [field]: value } : p)))
  }

  return (
    <div className="flex flex-col gap-4">
      {posts.map((post, i) => (
        <div
          key={i}
          style={{
            border: '0.5px solid rgba(192,123,85,0.25)',
            borderRadius: '12px',
            padding: '16px 18px',
            background: 'rgba(192,123,85,0.04)',
          }}
        >
          <div className="flex items-center justify-between mb-3">
            <span
              style={{
                fontSize: '9px',
                fontWeight: 500,
                color: 'var(--color-terracotta)',
                letterSpacing: '1.2px',
                textTransform: 'uppercase',
              }}
            >
              Priority post {i + 1}
            </span>
            <button
              onClick={() => removeRow(i)}
              className="text-sm text-gray-400 hover:text-red-600"
            >
              Remove
            </button>
          </div>
          <Input
            label="Title"
            value={post.title}
            onChange={(e) => updateRow(i, 'title', e.target.value)}
            placeholder="e.g. Summer skin care campaign announcement"
          />
          <div className="flex flex-col gap-1.5 mt-3">
            <label style={{ fontSize: '12px', fontWeight: 500, color: 'var(--color-text-2)' }}>Brief</label>
            <textarea
              value={post.brief}
              onChange={(e) => updateRow(i, 'brief', e.target.value)}
              placeholder="Key messages to include, specific products or services to mention..."
              rows={2}
              className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base text-gray-900 placeholder:text-gray-400 focus:border-[var(--color-border-3)] focus:outline-none focus:ring-1 focus:ring-[var(--color-border-3)] resize-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-4 mt-3">
            <div className="flex flex-col gap-1.5">
              <label style={{ fontSize: '12px', fontWeight: 500, color: 'var(--color-text-2)' }}>Platform</label>
              <select
                value={post.platform}
                onChange={(e) => updateRow(i, 'platform', e.target.value)}
                className="rounded-lg border border-gray-300 px-4 py-3 text-base text-gray-900 focus:border-[var(--color-border-3)] focus:outline-none focus:ring-1 focus:ring-[var(--color-border-3)]"
              >
                {PLATFORMS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <Input
              label="Target date"
              type="date"
              value={post.targetDate}
              onChange={(e) => updateRow(i, 'targetDate', e.target.value)}
            />
          </div>
        </div>
      ))}

      <button
        onClick={addRow}
        style={{
          fontSize: '12px',
          fontWeight: 500,
          color: 'var(--color-terracotta)',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          fontFamily: 'inherit',
          textAlign: 'left',
          display: 'flex',
          alignItems: 'center',
          gap: '5px',
        }}
      >
        + Add another priority post
      </button>
    </div>
  )
}
