import { Sparkles } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { BriefingActions } from '@/features/dashboard/components/briefing-actions'
import type { DashboardBriefing } from '@/features/dashboard/types'

/** Strips <cite> wrappers left by web-search citations. */
function stripCiteTags(text: string): string {
  return text.replace(/<cite[^>]*>([\s\S]*?)<\/cite>/g, '$1')
}

/**
 * The one line worth reading from this week's briefing. Prefers the action
 * nudge — it is the only part that asks the reader to do something.
 */
function pickHeadline(briefing: DashboardBriefing | null): string | null {
  if (!briefing) return null
  const candidate = briefing.action_nudge ?? briefing.weekly_tip ?? briefing.platform_updates?.[0]
  return candidate ? stripCiteTags(candidate) : null
}

export function BriefingBar({ briefing }: { briefing: DashboardBriefing | null }) {
  const headline = pickHeadline(briefing)

  return (
    <Card className="flex flex-wrap items-center gap-3.5 px-5 py-[18px]">
      <span
        aria-hidden="true"
        className="grid size-[27px] shrink-0 place-items-center rounded-sm bg-wash text-forest"
      >
        <Sparkles size={14} />
      </span>

      <div className="min-w-[220px] flex-1">
        <h2 className="text-[14px] font-semibold text-ink">Weekly intelligence briefing</h2>
        <p className="mt-0.5 font-display text-[17px] italic text-text2">
          {headline ?? 'Your Monday briefing lands here — trends, wins, and what to try next.'}
        </p>
      </div>

      <BriefingActions />
    </Card>
  )
}
