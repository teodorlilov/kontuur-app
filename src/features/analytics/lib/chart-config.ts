/**
 * The comparison console's frozen chart vocabulary (surface brief
 * src-app-dashboard-analytics): Deep Pine is this period, sage is the previous
 * one, Living Green is the now-instant — never a third series. The sage pair
 * was validated against Deep Pine at ΔE 33; 2e9e68↔7fa588 fails CVD at ΔE 5.2,
 * which is why "now" and "then" are never Living Green and sage side by side.
 *
 * Hex literals rather than var() on purpose: these feed SVG presentation
 * attributes, which do not resolve CSS custom properties (the same constraint
 * DESIGN.md records for chart axes). DOM elements use the `--metric-3` /
 * `--then-line` tokens instead.
 */
export const CHART_COLORS = {
  /** This period — Deep Pine. */
  now: '#164430',
  /** Previous period fills — always value-labeled (2.75:1 alone). */
  then: '#7fa588',
  /** Previous period at 2px stroke — same hue, 3.4:1 on white. */
  thenLine: '#6f957a',
  /** The now-instant: peak dots, sparkline end-marks. */
  instant: '#2e9e68',
  grid: '#e7ece7',
  /** Axis labels — 5.15:1 on Surface (the AA fix, do not lighten). */
  label: '#667068',
  ink: '#0f1512',
} as const
