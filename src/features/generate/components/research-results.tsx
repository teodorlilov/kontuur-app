'use client'

interface ResearchTopic {
  finding: string
  suggested_theme: string
}

interface ResearchResultsProps {
  results: ResearchTopic[]
  onAddTheme: (theme: string) => void
}

export function ResearchResults({ results, onAddTheme }: ResearchResultsProps) {
  if (results.length === 0) return null

  return (
    <div className="flex flex-col gap-3 bg-blue-50 border border-blue-100 rounded-lg p-4">
      <p className="text-xs font-medium text-blue-700 uppercase tracking-wide">Trending topics</p>
      {results.map((topic, i) => (
        <div key={i} className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <p className="text-sm text-gray-800">{topic.finding}</p>
            <p className="text-xs text-blue-600 italic">Suggested: {topic.suggested_theme}</p>
          </div>
          <button
            onClick={() => onAddTheme(topic.suggested_theme)}
            className="text-xs font-medium text-brand-purple hover:underline whitespace-nowrap shrink-0"
          >
            + Add
          </button>
        </div>
      ))}
    </div>
  )
}
