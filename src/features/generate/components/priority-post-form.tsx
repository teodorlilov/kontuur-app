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
        <div key={i} className="bg-red-50 border border-red-100 rounded-lg p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-red-700 uppercase tracking-wide">
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
            placeholder="e.g. Summer sale announcement"
          />
          <div className="flex flex-col gap-1.5">
            <label className="text-base font-medium text-gray-700">Brief</label>
            <textarea
              value={post.brief}
              onChange={(e) => updateRow(i, 'brief', e.target.value)}
              placeholder="Key messages to include..."
              rows={2}
              className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base text-gray-900 placeholder:text-gray-400 focus:border-brand-purple focus:outline-none focus:ring-1 focus:ring-brand-purple resize-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-base font-medium text-gray-700">Platform</label>
              <select
                value={post.platform}
                onChange={(e) => updateRow(i, 'platform', e.target.value)}
                className="rounded-lg border border-gray-300 px-4 py-3 text-base text-gray-900 focus:border-brand-purple focus:outline-none focus:ring-1 focus:ring-brand-purple"
              >
                {PLATFORMS.map((p) => (
                  <option key={p} value={p}>{p}</option>
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
        className="text-base font-medium text-brand-purple hover:underline text-left"
      >
        + Add priority post
      </button>
    </div>
  )
}
