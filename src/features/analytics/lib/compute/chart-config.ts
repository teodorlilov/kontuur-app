/**
 * The comparison console's frozen chart vocabulary (.impeccable/surfaces/
 * src-app-dashboard-analytics.md): Deep Pine is this period, sage is the previous one, Living
 * Green is the now-instant. Never a third green in one plot — the brief's validated pair
 * measures ΔE 33, while 2e9e68↔7fa588 fails at ΔE 5.2, so Living Green can never stand in
 * for "then" beside sage.
 *
 * Hex literals rather than var() on purpose: these feed SVG presentation attributes, which do
 * not resolve CSS custom properties. DOM elements use
 * the matching `--metric-3` / `--then-line` tokens instead.
 */
export const CHART_COLORS = {
  now: '#164430',
  /** 2.75:1 on white — a fill, and one that needs its value labelled (globals.css:216). */
  then: '#7fa588',
  /** The same hue held to 3.4:1, so a 2px stroke of it stays legible. */
  thenLine: '#6f957a',
  instant: '#2e9e68',
  /** Clay — the same `--danger` the delta chips spend on a move in the wrong direction. */
  loss: '#b04a38',
  grid: '#e7ece7',
  /** Axis labels — 5.15:1 on Surface (#ffffff). The AA fix; do not lighten. */
  label: '#667068',
  ink: '#0f1512',
} as const
