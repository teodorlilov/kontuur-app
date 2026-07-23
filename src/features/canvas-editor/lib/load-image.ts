/**
 * Load an image for canvas drawing. Always the raw Supabase public URL with
 * `crossOrigin='anonymous'` (the bucket serves ACAO:*) — a Next-optimized URL or a missing
 * crossOrigin would taint the canvas and break export. The single loader behind both the
 * editor hook and the auto-compose pipelines.
 */
export function loadCrossOriginImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`))
    img.src = src
  })
}
