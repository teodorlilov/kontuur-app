import type { Json } from '@/types/database'

/**
 * The one place an app object becomes a `jsonb` column value.
 *
 * `Json` is a recursive union, and a structural interface never satisfies it however
 * plain its contents — so every write to a jsonb column needs an assertion. The
 * assertion is fine; twelve copies of it were not. They had already grown three
 * different shapes (`as unknown as Json` inline, a local `asJson` in `visual/queries`,
 * a local `docAsJson` in `canvas/doc-store`), which is how a cast stops being a
 * documented decision and becomes background noise nobody reads.
 *
 * §5.7 recorded what casts hide when they multiply: `posts['Insert']` had been
 * suppressing a whole row, and underneath it two columns were reaching the insert as
 * `unknown`. `draftColumns` fixed that by making one place where a draft becomes a
 * write. This is the same move for jsonb.
 *
 * The constraint is `T extends object`: passing a primitive means the value was never a
 * jsonb payload, and the column would have taken it without complaint.
 */
export function asJson<T extends object>(value: T): Json {
  return value as unknown as Json
}
