interface CacheEntry {
  loading: Promise<HTMLImageElement>
  /** Set once the decode resolves — the half a render pass can read without awaiting. */
  image: HTMLImageElement | null
}

/**
 * How many decoded images to keep. A 4:5 slide decodes to ~5.8MB of bitmap, so this is a real
 * memory budget, not a formality: generous enough to hold a long carousel plus its placed assets,
 * small enough that a session spent generating candidates cannot grow without bound.
 */
const CACHE_LIMIT = 24

/**
 * Decoded images, by URL, for the life of the page.
 *
 * The editor holds a whole carousel now, so every slide switch asks for that slide's background and
 * each of its placed assets again. Without this, moving between two slides re-decodes both from
 * scratch every time — and because the stage cannot render until its background resolves, a revisit
 * that should be instant instead unmounts and rebuilds the entire Konva scene.
 *
 * The promise is cached, not just the element, so two callers racing the same URL share one decode.
 * A rejection is evicted, so a transient failure does not poison that URL for the whole session.
 * Eviction is safe at any moment: an image still on the stage is held by its own Konva node, and
 * dropping the cache entry only means the next request for it decodes again.
 */
const cache = new Map<string, CacheEntry>()

/**
 * Load an image for canvas drawing. Always the raw Supabase public URL with
 * `crossOrigin='anonymous'` (the bucket serves ACAO:*) — a Next-optimized URL or a missing
 * crossOrigin would taint the canvas and break export. The single loader behind both the
 * editor hook and the auto-compose pipelines.
 */
export function loadCrossOriginImage(src: string): Promise<HTMLImageElement> {
  const cached = cache.get(src)
  if (cached) return cached.loading

  const img = new window.Image()
  const entry: CacheEntry = {
    image: null,
    loading: new Promise<HTMLImageElement>((resolve, reject) => {
      img.onload = () => {
        entry.image = img
        resolve(img)
      }
      img.onerror = () => {
        cache.delete(src)
        reject(new Error(`Failed to load image: ${src}`))
      }
    }),
  }
  cache.set(src, entry)
  // Insertion order is eviction order — the oldest URL goes, which is the one least likely to be
  // the slide the user is on.
  if (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next()
    if (!oldest.done) cache.delete(oldest.value)
  }
  img.crossOrigin = 'anonymous'
  img.src = src
  return entry.loading
}

/**
 * The already-decoded image for a URL, or null. Lets a caller paint on its first render instead of
 * waiting a frame for an effect — the difference between a slide switch that flickers through a
 * spinner and one that does not.
 */
export function decodedImage(src: string | null): HTMLImageElement | null {
  return src ? (cache.get(src)?.image ?? null) : null
}

/** A loaded image's source dimensions in the `{ width, height }` shape the canvas math takes. */
export function naturalSize(image: HTMLImageElement): { width: number; height: number } {
  return { width: image.naturalWidth, height: image.naturalHeight }
}
