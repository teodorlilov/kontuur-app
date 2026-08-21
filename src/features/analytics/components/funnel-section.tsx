import { barWidthPct } from '../lib/bar-scale'
import type { FunnelStage } from '../lib/build-report'
import { countDeltaVerdict } from '../lib/delta-verdict'
import { formatCount } from '../lib/format'
import { DeltaChip } from './delta-chip'

/** Bars stop here so the widest stage never crowds the rate caption beside it. */
const BAR_SPAN_BEFORE_CAPTION = 78

function formatPer100(value: number): string {
  return value >= 10 ? String(Math.round(value)) : value.toFixed(1)
}

/**
 * The conversion path as descending stages: every bar is a share of the top
 * stage, so the drop-off from reached to followed is the picture itself.
 * A measured zero keeps its sunken track; a never-captured stage renders as
 * absence. Rates carry their denominator in words ("per 100 profile visits")
 * because the stages count different things — never percentages of people.
 */
export function FunnelSection({ stages }: { stages: FunnelStage[] }) {
  const top = stages[0]?.now ?? null
  return (
    <div className="mt-4 grid gap-5">
      {stages.map((stage) => {
        const width =
          top !== null && stage.now !== null
            ? barWidthPct(stage.now, top, BAR_SPAN_BEFORE_CAPTION)
            : 0
        return (
          <div key={stage.key} className="grid gap-1.5">
            <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
              <span className="w-40 flex-none text-caption font-medium text-ink">
                {stage.label}
              </span>
              <span className="text-title tabular-nums text-ink">
                {stage.now === null ? '—' : formatCount(stage.now)}
              </span>
              <DeltaChip verdict={countDeltaVerdict(stage.now, stage.then)} />
              <span className="text-micro tabular-nums text-text3">
                {stage.now === null
                  ? 'not captured for this period'
                  : stage.then === null
                    ? 'no previous period yet'
                    : `${formatCount(stage.then)} last period`}
              </span>
              {stage.per100 !== null && stage.rateBasis && (
                <span className="ml-auto text-micro font-medium tabular-nums text-text2">
                  {formatPer100(stage.per100)} {stage.rateBasis}
                </span>
              )}
            </div>
            {stage.now !== null && (
              <div aria-hidden="true" className="h-2 overflow-hidden rounded-r bg-sunken">
                {width > 0 && (
                  <i
                    className="block h-full rounded-r bg-forest"
                    // Computed width — every stage as a share of the top one.
                    style={{ width: `${width.toFixed(1)}%` }}
                  />
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
