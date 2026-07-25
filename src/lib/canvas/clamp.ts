/** Clamp a value into [min, max] — the one shared clamp for all canvas math and controls. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}
