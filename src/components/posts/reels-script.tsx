'use client'

import { toast } from '@/components/ui/toast'

export interface ReelsScriptData {
  hook: string
  main_points: string[]
  cta: string
  on_screen_text: string[]
  visual_directions: string[]
  estimated_seconds: number
}

interface ReelsScriptProps {
  script: ReelsScriptData
}

export function ReelsScript({ script }: ReelsScriptProps) {
  function handleCopyScript() {
    const text = [
      `HOOK:\n${script.hook}`,
      `MAIN POINTS:\n${script.main_points.map((p, i) => `${i + 1}. ${p}`).join('\n')}`,
      `CTA:\n${script.cta}`,
      `ON-SCREEN TEXT:\n${script.on_screen_text.join('\n')}`,
      `VISUAL DIRECTIONS:\n${script.visual_directions.join('\n')}`,
    ].join('\n\n')
    void navigator.clipboard.writeText(text)
    toast.success('Copied to clipboard')
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
          Reels Script · ~{script.estimated_seconds}s
        </span>
        <button
          onClick={handleCopyScript}
          className="text-xs text-gray-500 hover:text-gray-700 font-medium"
        >
          Copy full script
        </button>
      </div>

      <div className="bg-gray-50 rounded-lg p-4 flex flex-col gap-4">
        <div>
          <p className="text-xs font-medium text-gray-400 uppercase mb-1">Hook (0-3s)</p>
          <p className="text-base font-semibold text-gray-900">{script.hook}</p>
          {script.visual_directions[0] && (
            <p className="text-xs text-gray-400 italic mt-1">{script.visual_directions[0]}</p>
          )}
        </div>

        <div>
          <p className="text-xs font-medium text-gray-400 uppercase mb-2">Main Content</p>
          <ol className="flex flex-col gap-2">
            {script.main_points.map((point, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-xs font-bold text-brand-purple mt-0.5 shrink-0">
                  {i + 1}.
                </span>
                <div className="flex flex-col gap-0.5">
                  <p className="text-sm text-gray-800">{point}</p>
                  {script.visual_directions[i + 1] && (
                    <p className="text-xs text-gray-400 italic">
                      {script.visual_directions[i + 1]}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </div>

        <div>
          <p className="text-xs font-medium text-gray-400 uppercase mb-1">CTA</p>
          <p className="text-sm text-gray-800">{script.cta}</p>
        </div>

        {script.on_screen_text.length > 0 && (
          <div>
            <p className="text-xs font-medium text-gray-400 uppercase mb-2">On-Screen Text</p>
            <div className="flex flex-wrap gap-1.5">
              {script.on_screen_text.map((text, i) => (
                <span
                  key={i}
                  className="text-xs bg-white border border-gray-200 text-gray-700 px-2 py-1 rounded"
                >
                  {text}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
