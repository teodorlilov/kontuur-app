/** Clamp a value into [min, max] — the one shared clamp for all canvas math and controls. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/** Round + clamp a transformer rotation to the doc schema's −180…180 range. */
export function persistedRotation(degrees: number): number {
  return clamp(Math.round(degrees), -180, 180)
}
