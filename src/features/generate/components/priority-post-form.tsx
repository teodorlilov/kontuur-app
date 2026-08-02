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
            border: '1px solid rgba(15,21,18,0.10)',
            borderRadius: '12px',
            padding: '18px 20px',
            background: 'var(--sunken)',
          }}
        >
          <div className="flex items-center justify-between mb-3">
            <span
              className="text-label"
              style={{
                fontWeight: 500,
                color: 'var(--spring-text)',
                letterSpacing: '1.2px',
                textTransform: 'uppercase',
              }}
            >
              Priority post {i + 1}
            </span>
            <button onClick={() => removeRow(i)} className="text-body text-text3 hover:text-danger">
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
            <label className="text-caption" style={{ fontWeight: 500, color: 'var(--text2)' }}>
              Brief
            </label>
            <textarea
              value={post.brief}
              onChange={(e) => updateRow(i, 'brief', e.target.value)}
              placeholder="Key messages to include, specific products or services to mention..."
              rows={2}
              className="w-full rounded-lg border border-line2 px-4 py-3 text-lead md:text-body texe text-ink placeholder:text-text3 focus:border-[var(--line2)] focus:outline-none focus:ring-1 focus:ring-[var(--line2)] resize-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-4 mt-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-caption" style={{ fontWeight: 500, color: 'var(--text2)' }}>
                Platform
              </label>
              <select
                value={post.platform}
                onChange={(e) => updateRow(i, 'platform', e.target.value)}
                className="rounded-lg border border-line2 px-4 py-3 text-lead md:text-body text-ink focus:border-[var(--line2)] focus:outline-none focus:ring-1 focus:ring-[var(--line2)]"
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
        className="text-caption"
        onClick={addRow}
        style={{
          width: '100%',
          padding: '12px',
          fontWeight: 500,
          color: 'var(--text2)',
          background: 'none',
          border: '1px dashed rgba(15,21,18,0.22)',
          borderRadius: '10px',
          cursor: 'pointer',
          fontFamily: 'inherit',
          textAlign: 'center',
          transition: 'all 0.15s',
        }}
      >
        + Add another priority post
      </button>
    </div>
  )
}
