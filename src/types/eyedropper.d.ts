/**
 * The EyeDropper API is Chromium-only and not yet in TypeScript's DOM lib, so the shape it does
 * ship with is declared here. Call sites must feature-detect (`'EyeDropper' in window`) — this
 * declaration says the type exists, not that the browser does.
 */
interface EyeDropperResult {
  /** The sampled colour as `#rrggbb`. */
  sRGBHex: string
}

interface EyeDropperOpenOptions {
  signal?: AbortSignal
}

declare class EyeDropper {
  constructor()
  /** Resolves with the picked colour; rejects when the user cancels (Escape) or aborts. */
  open(options?: EyeDropperOpenOptions): Promise<EyeDropperResult>
}
