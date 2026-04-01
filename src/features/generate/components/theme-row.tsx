'use client'

export interface ThemeInput {
  description: string
  count: number
  selected: boolean
}

interface ThemeRowProps {
  theme: ThemeInput
  index: number
  onChange: (index: number, theme: ThemeInput) => void
  onRemove: (index: number) => void
}

export function ThemeRow({ theme, index, onChange, onRemove }: ThemeRowProps) {
  return (
    <div className="flex gap-3 items-center">
      <input
        type="checkbox"
        checked={theme.selected}
        onChange={(e) => onChange(index, { ...theme, selected: e.target.checked })}
        className="h-5 w-5 rounded border-gray-300 accent-brand-purple cursor-pointer"
      />
      <div className="flex-1">
        <input
          type="text"
          value={theme.description}
          onChange={(e) => onChange(index, { ...theme, description: e.target.value })}
          placeholder={`Theme ${index + 1} — e.g. "Behind the scenes of our process"`}
          className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base text-gray-900 placeholder:text-gray-400 focus:border-brand-purple focus:outline-none focus:ring-1 focus:ring-brand-purple"
        />
      </div>
      <button
        onClick={() => onRemove(index)}
        className="text-gray-400 hover:text-red-500 px-1 py-3 text-base"
      >
        ✕
      </button>
    </div>
  )
}
